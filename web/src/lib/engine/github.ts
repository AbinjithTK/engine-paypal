import "server-only";

import { nextId, now, write } from "./db";
import { ingest, IngestError } from "./ingest";

/**
 * Connect a GitHub repo: its README, Markdown docs and open issues go into
 * the Brain as documents, and the repo becomes a connector that coding jobs
 * are pointed at. Public repos need nothing; private ones need GITHUB_TOKEN
 * (a fine-grained, read-only token) on the server.
 */

const API = "https://api.github.com";

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "engine-brain", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers(), signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (res.status === 404) throw new IngestError("GitHub can't find that repo. Private repos need GITHUB_TOKEN on the server.");
  if (res.status === 403 || res.status === 429) throw new IngestError("GitHub's rate limit was hit. Set GITHUB_TOKEN or try again later.");
  if (!res.ok) throw new IngestError(`GitHub ${res.status}.`);
  return (await res.json()) as T;
}

async function raw(owner: string, repo: string, ref: string, path: string): Promise<string> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`, {
    headers: { ...headers(), Accept: "application/vnd.github.raw" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new IngestError(`Couldn't read ${path} (${res.status}).`);
  return res.text();
}

export function parseRepo(input: string): { owner: string; repo: string } {
  const m = input.trim().match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/);
  if (!m) throw new IngestError("Give the repo as owner/name or a github.com link.");
  return { owner: m[1], repo: m[2] };
}

export async function connectRepo(input: string, isPrivate: boolean): Promise<{ files: number; facts: number; issues: number; notes: string[] }> {
  const { owner, repo } = parseRepo(input);
  const info = await gh<{ full_name: string; description: string | null; default_branch: string; html_url: string; private: boolean; topics?: string[] }>(
    `/repos/${owner}/${repo}`,
  );
  const ref = info.default_branch;
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[] }>(`/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`);
  const docs = tree.tree
    .filter((t) => t.type === "blob" && /\.(md|markdown|mdx|txt)$/i.test(t.path) && (t.size ?? 0) < 200_000)
    .filter((t) => !/(^|\/)(node_modules|vendor|dist|build|\.github)\//.test(t.path) && !/CHANGELOG/i.test(t.path))
    .sort((a, b) => {
      const rank = (p: string) => (/^readme/i.test(p) ? 0 : /^docs?\//i.test(p) ? 1 : p.includes("/") ? 3 : 2);
      return rank(a.path) - rank(b.path);
    })
    .slice(0, 15);

  const notes: string[] = [];
  let files = 0;
  let facts = 0;
  for (const [i, f] of docs.entries()) {
    try {
      const text = await raw(owner, repo, ref, f.path);
      // Facts are drafted from the README and the first few docs only, to keep model calls bounded.
      const r = await ingest({
        title: `${info.full_name}/${f.path}`,
        text,
        origin: "github",
        uri: `${info.html_url}/blob/${ref}/${f.path}`,
        bytes: f.size ?? text.length,
        isPrivate,
        learnFacts: i < 3,
      });
      files++;
      facts += r.facts;
      if (r.note) notes.push(r.note);
    } catch (e) {
      notes.push(e instanceof Error ? e.message : String(e));
    }
  }

  let issues = 0;
  try {
    const list = await gh<{ number: number; title: string; body: string | null; labels: { name: string }[]; pull_request?: unknown }[]>(
      `/repos/${owner}/${repo}/issues?state=open&per_page=30`,
    );
    const real = list.filter((x) => !x.pull_request);
    if (real.length) {
      const text = real
        .map((x) => `#${x.number} ${x.title}${x.labels.length ? ` [${x.labels.map((l) => l.name).join(", ")}]` : ""}\n${(x.body ?? "").slice(0, 1200)}`)
        .join("\n\n");
      await ingest({
        title: `${info.full_name}: open issues`,
        text,
        origin: "github",
        uri: `${info.html_url}/issues`,
        bytes: text.length,
        isPrivate,
        learnFacts: false,
      });
      issues = real.length;
    }
  } catch (e) {
    notes.push(e instanceof Error ? e.message : String(e));
  }

  await write((db) => {
    const exists = db.connectors.find((c) => c.kind === "github" && c.url === info.html_url);
    const purpose = `Code repository${info.description ? `: ${info.description}` : ""}. Coding, docs and technical jobs.`;
    if (exists) exists.purpose = purpose;
    else db.connectors.push({ id: nextId(db, "con"), kind: "github", name: info.full_name, url: info.html_url, purpose, createdAt: now() });
  });
  return { files, facts, issues, notes };
}
