"use client";

import { useRef, useState } from "react";

import { ago, useEngine } from "../_ui/use-engine";
import type { Brain } from "./page";

const ORIGIN: Record<string, string> = { upload: "Uploaded", github: "GitHub", website: "Website", text: "Pasted" };

function kb(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

// ─── Documents ───────────────────────────────────────────────────────────

export function DocsTab({ b, reload }: { b: Brain; reload: () => Promise<void> }) {
  const { post, toast } = useEngine();
  const [busy, setBusy] = useState<string | null>(null);
  const [priv, setPriv] = useState(false);
  const [repo, setRepo] = useState("");
  const [paste, setPaste] = useState({ title: "", text: "" });
  const input = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy("upload");
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    if (priv) fd.append("private", "1");
    try {
      const r = await fetch("/api/engine/brain/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) toast(j.error || "Upload failed.", true);
      else {
        const ok = (j.results as { ok: boolean; facts?: number; error?: string; name: string }[]).filter((x) => x.ok);
        const bad = j.results.length - ok.length;
        toast(
          `Read ${ok.length} file${ok.length === 1 ? "" : "s"}, drafted ${ok.reduce((n, x) => n + (x.facts ?? 0), 0)} facts to confirm.${bad ? ` ${bad} could not be read.` : ""}`,
          bad > 0 && ok.length === 0,
        );
      }
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
      await reload();
    }
  }

  async function act(name: string, body: Record<string, unknown>, ok?: (r: Record<string, unknown>) => string) {
    setBusy(name);
    const r = await post<Record<string, unknown>>("/api/engine/brain", body);
    setBusy(null);
    if (r && ok) toast(ok(r));
    await reload();
    return r;
  }

  return (
    <div className="grid2 even">
      <section className="stack">
        <div className="card pad stack">
          <p className="label">Add company material</p>
          <p className="soft">
            Brand guides, price lists, SOPs, past proposals, contracts. Engine reads them, splits them into passages each job can search,
            and drafts facts for you to confirm.
          </p>
          <label className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
            <span>Never share these with any job (financials, contracts, customer lists)</span>
          </label>
          <input
            ref={input}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html"
            onChange={(e) => upload(e.target.files)}
            aria-label="Choose files"
            style={{ display: "none" }}
          />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn p" disabled={busy !== null} onClick={() => input.current?.click()}>
              {busy === "upload" ? (
                <>
                  <span className="spin" /> Reading…
                </>
              ) : (
                "Upload files"
              )}
            </button>
            <span className="faint">PDF, Word, Markdown, text, CSV, JSON. Up to 10 files, 10 MB each.</span>
          </div>
        </div>

        <form
          className="card pad stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (repo.trim()) {
              void act("github", { action: "github", repo, private: priv }, (r) => `Read ${r.files} files and ${r.issues} open issues. ${r.facts} facts to confirm.`).then(
                (r) => r && setRepo(""),
              );
            }
          }}
        >
          <p className="label">Connect a GitHub repo</p>
          <p className="soft">The README, the docs and open issues come in, and coding jobs are pointed at the repo.</p>
          <div className="row">
            <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo or a github.com link" aria-label="GitHub repo" />
            <button className="btn" disabled={busy !== null || !repo.trim()}>
              {busy === "github" ? <span className="spin" /> : null} Connect
            </button>
          </div>
          <span className="faint">Public repos work as they are. A private repo needs a read-only GITHUB_TOKEN on the server.</span>
        </form>

        <form
          className="card pad stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (paste.text.trim().length > 20) {
              void act("paste", { action: "paste", ...paste, private: priv }, () => "Saved. Facts drafted to confirm.").then((r) => r && setPaste({ title: "", text: "" }));
            }
          }}
        >
          <p className="label">Or paste notes</p>
          <input type="text" value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} placeholder="Title" aria-label="Title" />
          <textarea value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} rows={4} placeholder="Anything worth knowing" aria-label="Notes" />
          <div>
            <button className="btn" disabled={busy !== null || paste.text.trim().length <= 20}>
              {busy === "paste" ? <span className="spin" /> : null} Save
            </button>
          </div>
        </form>
      </section>

      <section className="card pad">
        <div className="between">
          <p className="label">
            {b.docs.length} document{b.docs.length === 1 ? "" : "s"} · {b.search.passages} passages
          </p>
          <span className="faint">{b.search.mode === "elastic" ? "Search: Elastic, local index if it fails" : "Search: local index"}</span>
        </div>
        {b.docs.length === 0 ? (
          <p className="soft" style={{ marginTop: 10 }}>
            Nothing yet. Upload a brand guide or a price list to start.
          </p>
        ) : (
          <div className="divide" style={{ marginTop: 6 }}>
            {b.docs.map((d) => (
              <div key={d.id} className="fact">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{d.title}</p>
                  <p className="src">
                    {ORIGIN[d.origin]} · {kb(d.bytes)} · {d.chunkCount} passages · {d.factCount} facts · {d.indexedIn === "elastic" ? "in Elastic" : "local index"} ·{" "}
                    {ago(d.createdAt)}
                  </p>
                </div>
                {d.private && <span className="pill pn">Never shared</span>}
                <button className="btn ghost s" aria-label={`Remove ${d.title}`} disabled={busy !== null} onClick={() => act("rm", { action: "remove_doc", id: d.id })}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Connectors and skills ───────────────────────────────────────────────

export function ToolsTab({ b, reload }: { b: Brain; reload: () => Promise<void> }) {
  const { post, toast } = useEngine();
  const [con, setCon] = useState({ kind: "mcp" as "mcp" | "tool", name: "", url: "", purpose: "" });
  const [sk, setSk] = useState({ name: "", when: "", body: "" });

  async function act(body: Record<string, unknown>, ok?: string) {
    const r = await post("/api/engine/brain", body);
    if (r && ok) toast(ok);
    await reload();
    return r;
  }

  return (
    <div className="grid2 even">
      <section className="stack">
        <div className="card pad">
          <p className="label">Connectors</p>
          <p className="soft" style={{ margin: "6px 0 10px" }}>
            The MCP servers, apps and services the company runs on. Each job&apos;s brief names the ones it touches, so the expert&apos;s agent
            knows where things live. Engine never hands over credentials; the expert gets access from you.
          </p>
          <div className="divide">
            {b.connectors.map((c) => (
              <div key={c.id} className="fact">
                <span className="pill pn" style={{ fontSize: 11 }}>
                  {c.kind === "mcp" ? "MCP" : c.kind === "github" ? "GitHub" : "Tool"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600 }}>{c.name}</p>
                  <p className="src" style={{ overflowWrap: "anywhere" }}>
                    {c.purpose}
                    {c.url ? ` · ${c.url}` : ""}
                  </p>
                </div>
                <button className="btn ghost s" aria-label={`Remove ${c.name}`} onClick={() => act({ action: "remove_connector", id: c.id })}>
                  Remove
                </button>
              </div>
            ))}
            {b.connectors.length === 0 && <p className="faint">None yet.</p>}
          </div>
        </div>
        <form
          className="card pad stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "add_connector", ...con }, "Connector added.").then((r) => r && setCon({ ...con, name: "", url: "", purpose: "" }));
          }}
        >
          <p className="label">Add a connector</p>
          <div className="seg" role="group" aria-label="Kind" style={{ alignSelf: "flex-start" }}>
            <button type="button" aria-pressed={con.kind === "mcp"} onClick={() => setCon({ ...con, kind: "mcp" })}>
              MCP server
            </button>
            <button type="button" aria-pressed={con.kind === "tool"} onClick={() => setCon({ ...con, kind: "tool" })}>
              App or service
            </button>
          </div>
          <input type="text" value={con.name} onChange={(e) => setCon({ ...con, name: e.target.value })} placeholder="Name, e.g. Jira or Shopify" aria-label="Connector name" />
          <input type="url" value={con.url} onChange={(e) => setCon({ ...con, url: e.target.value })} placeholder="https:// address (optional)" aria-label="Address" />
          <input type="text" value={con.purpose} onChange={(e) => setCon({ ...con, purpose: e.target.value })} placeholder="What it's for, e.g. product backlog and bugs" aria-label="What it's for" />
          <div>
            <button className="btn" disabled={!con.name.trim() || !con.purpose.trim()}>
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="stack">
        <div className="card pad">
          <p className="label">Skills</p>
          <p className="soft" style={{ margin: "6px 0 10px" }}>
            Your own playbooks: how this company wants a kind of work done. Jobs that match get the playbook in their brief, and the Reviewer
            checks against it.
          </p>
          <div className="divide">
            {b.skills.map((s) => (
              <details key={s.id} style={{ padding: "8px 0" }}>
                <summary className="between" style={{ cursor: "pointer" }}>
                  <span>
                    <b>{s.name}</b> <span className="faint">· {s.when}</span>
                  </span>
                </summary>
                <pre className="code" style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>
                  {s.body}
                </pre>
                <button className="btn ghost s" onClick={() => act({ action: "remove_skill", id: s.id })}>
                  Remove
                </button>
              </details>
            ))}
            {b.skills.length === 0 && <p className="faint">None yet.</p>}
          </div>
        </div>
        <form
          className="card pad stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act({ action: "add_skill", ...sk }, "Skill added.").then((r) => r && setSk({ name: "", when: "", body: "" }));
          }}
        >
          <p className="label">Add a skill</p>
          <input type="text" value={sk.name} onChange={(e) => setSk({ ...sk, name: e.target.value })} placeholder="Name, e.g. Writing a product email" aria-label="Skill name" />
          <input type="text" value={sk.when} onChange={(e) => setSk({ ...sk, when: e.target.value })} placeholder="When it applies, e.g. any customer email" aria-label="When it applies" />
          <textarea value={sk.body} onChange={(e) => setSk({ ...sk, body: e.target.value })} rows={6} placeholder={"The steps, in your words.\n1. Subject under 6 words\n2. One idea per email\n3. Sign off as Maya"} aria-label="Steps" />
          <div>
            <button className="btn" disabled={!sk.name.trim() || !sk.body.trim()}>
              Add
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────

type Hit = { title: string; text: string; private: boolean; score: number };

export function SearchTab({ b, reload }: { b: Brain; reload: () => Promise<void> }) {
  const { post, toast } = useEngine();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ via: string; fellBack?: string; hits: Hit[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const s = b.search;

  async function mode(m: "local" | "elastic") {
    setBusy(m);
    const r = await post<{ indexed?: number }>("/api/engine/brain", { action: "search_mode", mode: m });
    setBusy(null);
    if (r) toast(m === "elastic" ? `Switched to Elastic and indexed ${r.indexed ?? 0} passages.` : "Back on the local index.");
    await reload();
  }

  return (
    <div className="grid2 even">
      <section className="stack">
        <div className="card pad stack">
          <p className="label">Where the Brain searches</p>
          <div className="seg" role="group" aria-label="Search engine" style={{ alignSelf: "flex-start" }}>
            <button aria-pressed={s.mode === "local"} disabled={busy !== null} onClick={() => mode("local")}>
              Local index
            </button>
            <button aria-pressed={s.mode === "elastic"} disabled={busy !== null || !s.elasticConfigured} onClick={() => mode("elastic")}>
              {busy === "elastic" ? <span className="spin" /> : null} Elastic
            </button>
          </div>
          <p className="soft">
            <b>Local index</b>: keyword search over the passages in Engine&apos;s own store. No setup, and right for a small company.
          </p>
          <p className="soft">
            <b>Elastic</b>: semantic search, so &ldquo;refund rules&rdquo; finds &ldquo;returns within 14 days&rdquo;. Better once there&apos;s a lot of material.
            If Elastic stops responding, searches fall back to the local index, which is always kept up to date.
          </p>
          {!s.elasticConfigured && (
            <p className="faint">To turn Elastic on, set ELASTIC_URL and ELASTIC_API_KEY on the server.</p>
          )}
          {s.suggestElastic && (
            <p className="pill pb" style={{ whiteSpace: "normal" }}>
              The Brain has {s.passages} passages. Elastic will find things better from here.
            </p>
          )}
          <p className="faint">
            {s.passages} passages · Engine suggests Elastic from {s.suggestAt}.
          </p>
        </div>
      </section>
      <section className="card pad stack">
        <p className="label">Try a search</p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!q.trim()) return;
            setBusy("q");
            setRes(await post("/api/engine/brain", { action: "search", query: q }));
            setBusy(null);
          }}
        >
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. wholesale minimum order" aria-label="Search the Brain" />
          <button className="btn p" disabled={busy !== null || !q.trim()}>
            {busy === "q" ? <span className="spin" /> : null} Search
          </button>
        </form>
        {res && (
          <>
            <p className="faint">
              {res.hits.length} result{res.hits.length === 1 ? "" : "s"} via {res.via === "elastic" ? "Elastic" : "the local index"}
              {res.fellBack ? `. Elastic failed, so this used the local index: ${res.fellBack}` : ""}. You see private passages here; jobs never do.
            </p>
            <div className="divide">
              {res.hits.map((h, i) => (
                <div key={i} style={{ padding: "10px 0" }}>
                  <div className="between">
                    <b style={{ overflowWrap: "anywhere" }}>{h.title}</b>
                    {h.private && <span className="pill pn">Never shared</span>}
                  </div>
                  <p className="soft" style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>
                    {h.text}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
