import "server-only";

import type { Chunk, Db, SearchMode } from "./types";

/**
 * Search over the Brain's document passages.
 *
 * Two backends behind one function:
 *  - local: BM25 keyword ranking over the passages kept in the data file.
 *    Always available, no setup, fine for a small company's documents.
 *  - elastic: an Elasticsearch index with a semantic_text field, so a search
 *    matches meaning as well as words. Worth it once the data grows.
 *
 * Passages are always written locally, so switching back, or Elastic being
 * down, never loses anything. A failed Elastic call falls back to local.
 * Private passages are excluded in both, in the query itself.
 */

export const SUGGEST_ELASTIC_AT = Number(process.env.ENGINE_SUGGEST_ELASTIC_AT || 400);

// ─── chunking ────────────────────────────────────────────────────────────

/** Split on paragraphs into ~900-character passages with a little overlap. */
export function chunkText(text: string, max = 900): string[] {
  const paras = text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > max) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      for (let i = 0; i < p.length; i += max - 120) out.push(p.slice(i, i + max));
      continue;
    }
    if ((cur + "\n\n" + p).length > max && cur) {
      out.push(cur);
      const tail = cur.slice(-120);
      cur = `${tail.slice(tail.indexOf(" ") + 1)}\n\n${p}`;
    } else {
      cur = cur ? `${cur}\n\n${p}` : p;
    }
  }
  if (cur.trim()) out.push(cur);
  return out.filter((c) => c.trim().length > 20).slice(0, 2000);
}

// ─── local BM25 ──────────────────────────────────────────────────────────

const STOP = new Set(
  "a an and are as at be by for from has have i in is it its of on or our that the their this to was we were what when which who will with you your".split(" "),
);

function terms(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t));
}

function localSearch(chunks: Chunk[], query: string, k: number): { chunk: Chunk; score: number }[] {
  const q = [...new Set(terms(query))];
  if (q.length === 0 || chunks.length === 0) return [];
  const docs = chunks.map((c) => terms(`${c.title} ${c.text}`));
  const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const k1 = 1.4;
  const b = 0.75;
  return docs
    .map((d, i) => {
      const tf = new Map<string, number>();
      for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
      }
      return { chunk: chunks[i], score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}

// ─── Elastic ─────────────────────────────────────────────────────────────

const INDEX = process.env.ELASTIC_INDEX || "engine-brain";

export function elasticConfigured(): boolean {
  return Boolean(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY);
}

async function es<T>(method: string, path: string, body?: unknown, ndjson = false): Promise<T> {
  const url = `${process.env.ELASTIC_URL!.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `ApiKey ${process.env.ELASTIC_API_KEY}`,
      "Content-Type": ndjson ? "application/x-ndjson" : "application/json",
    },
    body: body === undefined ? undefined : ndjson ? (body as string) : JSON.stringify(body),
    // Semantic indexing runs inference, so the first writes can be slow.
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const reason = json?.error?.root_cause?.[0]?.reason || json?.error?.reason || text.slice(0, 200);
    throw new Error(`Elastic ${res.status}: ${reason}`);
  }
  return json as T;
}

let indexReady = false;
async function ensureIndex() {
  if (indexReady) return;
  const head = await fetch(`${process.env.ELASTIC_URL!.replace(/\/$/, "")}/${INDEX}`, {
    method: "HEAD",
    headers: { Authorization: `ApiKey ${process.env.ELASTIC_API_KEY}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (head.status === 404) {
    const semantic: Record<string, unknown> = { type: "semantic_text" };
    if (process.env.ELASTIC_INFERENCE_ID) semantic.inference_id = process.env.ELASTIC_INFERENCE_ID;
    await es("PUT", `/${INDEX}`, {
      mappings: {
        properties: {
          meaning: semantic,
          plain: { type: "text" },
          title: { type: "text" },
          doc_id: { type: "keyword" },
          private: { type: "boolean" },
        },
      },
    });
  } else if (!head.ok) {
    throw new Error(`Elastic ${head.status} checking the index`);
  }
  indexReady = true;
}

export async function elasticIndex(chunks: Chunk[]): Promise<void> {
  if (!chunks.length) return;
  await ensureIndex();
  for (let i = 0; i < chunks.length; i += 50) {
    const lines = chunks.slice(i, i + 50).flatMap((c) => [
      JSON.stringify({ index: { _index: INDEX, _id: c.id } }),
      JSON.stringify({ meaning: c.text, plain: c.text, title: c.title, doc_id: c.docId, private: c.private }),
    ]);
    const r = await es<{ errors: boolean; items: { index?: { error?: { reason?: string } } }[] }>(
      "POST",
      "/_bulk?refresh=wait_for",
      lines.join("\n") + "\n",
      true,
    );
    if (r.errors) {
      const reason = r.items.find((x) => x.index?.error)?.index?.error?.reason ?? "unknown";
      throw new Error(`Elastic bulk index failed: ${reason}`);
    }
  }
}

export async function elasticDeleteDoc(docId: string): Promise<void> {
  await es("POST", `/${INDEX}/_delete_by_query?refresh=true`, { query: { term: { doc_id: docId } } });
}

async function elasticSearch(query: string, k: number, includePrivate: boolean, docIds?: string[]): Promise<{ id: string; score: number }[]> {
  await ensureIndex();
  const filter: unknown[] = [];
  if (!includePrivate) filter.push({ term: { private: false } });
  if (docIds) filter.push({ terms: { doc_id: docIds } });
  const r = await es<{ hits: { hits: { _id: string; _score: number }[] } }>("POST", `/${INDEX}/_search`, {
    size: k,
    _source: false,
    query: {
      bool: {
        filter,
        should: [{ semantic: { field: "meaning", query } }, { match: { plain: { query, boost: 0.3 } } }],
        minimum_should_match: 1,
      },
    },
  });
  return r.hits.hits.map((h) => ({ id: h._id, score: h._score }));
}

export async function elasticStatus(): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!elasticConfigured()) return { ok: false, error: "ELASTIC_URL and ELASTIC_API_KEY are not set." };
  try {
    await ensureIndex();
    const r = await es<{ count: number }>("GET", `/${INDEX}/_count`);
    return { ok: true, count: r.count };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

// ─── the one search everyone calls ───────────────────────────────────────

export function searchMode(db: Db): SearchMode {
  return db.company.search === "elastic" && elasticConfigured() ? "elastic" : "local";
}

export type SearchResult = { chunks: { chunk: Chunk; score: number }[]; via: SearchMode; fellBack?: string };

/**
 * Search the Brain's passages. Never returns private passages unless asked
 * (only the owner's own Brain search asks). Elastic errors fall back to local.
 */
export async function searchBrain(
  db: Db,
  query: string,
  opts: { k?: number; includePrivate?: boolean; docIds?: string[] } = {},
): Promise<SearchResult> {
  const k = opts.k ?? 6;
  const pool = db.chunks.filter((c) => (opts.includePrivate || !c.private) && (!opts.docIds || opts.docIds.includes(c.docId)));
  if (searchMode(db) === "elastic") {
    try {
      const hits = await elasticSearch(query, k, Boolean(opts.includePrivate), opts.docIds);
      const byId = new Map(pool.map((c) => [c.id, c]));
      const chunks = hits.map((h) => ({ chunk: byId.get(h.id), score: h.score })).filter((x): x is { chunk: Chunk; score: number } => Boolean(x.chunk));
      return { chunks, via: "elastic" };
    } catch (e) {
      return { chunks: relevant(localSearch(pool, query, k)), via: "local", fellBack: e instanceof Error ? e.message.slice(0, 160) : String(e) };
    }
  }
  return { chunks: relevant(localSearch(pool, query, k)), via: "local" };
}

/** Keyword scores have no floor, so drop passages far weaker than the best match. */
function relevant(hits: { chunk: Chunk; score: number }[]) {
  const top = hits[0]?.score ?? 0;
  return hits.filter((h) => h.score >= top * 0.45);
}
