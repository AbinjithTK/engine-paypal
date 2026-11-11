import "server-only";

import { applyFacts, extractFacts } from "./brain";
import { nextId, now, read, write } from "./db";
import { shortError } from "./gemini";
import { chunkText, elasticDeleteDoc, elasticIndex, searchMode } from "./search";
import type { Chunk, Doc } from "./types";

/**
 * Getting company material into the Brain: uploaded files, GitHub repos and
 * pasted text. Each source becomes a Doc, its passages become Chunks (always
 * stored locally, and indexed in Elastic when that is on), and Gemini drafts
 * facts from it that wait for the owner to confirm.
 */

export const MAX_BYTES = 10 * 1024 * 1024;
const TEXT_EXT = /\.(txt|md|markdown|csv|json|ya?ml|html?|tsx?|jsx?|py|rb|go|rs|java|css|sql|toml|ini|log)$/i;

export class IngestError extends Error {}

export async function extractText(name: string, mime: string, buf: Buffer): Promise<string> {
  if (buf.length > MAX_BYTES) throw new IngestError("Files must be under 10 MB.");
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const { extractText: pdf, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdf(doc, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  }
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value;
  }
  if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(lower)) {
    const t = buf.toString("utf8");
    return lower.endsWith(".html") || lower.endsWith(".htm") || mime === "text/html" ? stripHtml(t) : t;
  }
  throw new IngestError("Engine reads PDF, Word (.docx), text, Markdown, CSV, JSON and code files.");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|h\d|li|tr|section|article)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

export type IngestResult = { doc: Doc; facts: number; conflicts: number; indexed: "local" | "elastic"; note?: string };

/** Add one source. Safe to call for each file of a repo. */
export async function ingest(opts: {
  title: string;
  text: string;
  origin: Doc["origin"];
  uri?: string;
  bytes: number;
  isPrivate: boolean;
  learnFacts?: boolean;
}): Promise<IngestResult> {
  const text = opts.text.replace(/\u0000/g, "").trim();
  if (text.length < 20) throw new IngestError(`"${opts.title}" has no readable text.`);
  const pieces = chunkText(text);

  const { doc, chunks } = await write((db) => {
    // Re-importing the same source replaces it instead of duplicating it.
    if (opts.uri) {
      const old = db.docs.find((d) => d.uri === opts.uri);
      if (old) {
        db.docs = db.docs.filter((d) => d.id !== old.id);
        db.chunks = db.chunks.filter((c) => c.docId !== old.id);
      }
    }
    const d: Doc = {
      id: nextId(db, "doc"),
      title: opts.title.slice(0, 160),
      origin: opts.origin,
      uri: opts.uri,
      bytes: opts.bytes,
      private: opts.isPrivate,
      chunkCount: pieces.length,
      factCount: 0,
      createdAt: now(),
      indexedIn: "local",
    };
    const cs: Chunk[] = pieces.map((p) => ({ id: nextId(db, "chk"), docId: d.id, title: d.title, text: p, private: d.private }));
    db.docs.unshift(d);
    db.chunks.push(...cs);
    return { doc: d, chunks: cs };
  });

  let indexed: "local" | "elastic" = "local";
  let note: string | undefined;
  if (searchMode(read()) === "elastic") {
    try {
      await elasticIndex(chunks);
      indexed = "elastic";
    } catch (e) {
      note = `Kept in the local index; Elastic failed: ${e instanceof Error ? e.message.slice(0, 160) : e}`;
    }
  }

  let facts = 0;
  let conflicts = 0;
  if (opts.learnFacts !== false) {
    try {
      const raw = await extractFacts(read(), text, `Document "${doc.title}"`);
      const r = await write((db) => {
        const out = applyFacts(db, raw, { kind: "document", docId: doc.id, title: doc.title }, doc.private);
        const d = db.docs.find((x) => x.id === doc.id);
        if (d) d.factCount = out.added.length;
        return out;
      });
      facts = r.added.length;
      conflicts = r.conflicts;
    } catch (e) {
      note = [note, `Facts not drafted: ${shortError(e)}`].filter(Boolean).join(" ");
    }
  }
  await write((db) => {
    const d = db.docs.find((x) => x.id === doc.id);
    if (d) d.indexedIn = indexed;
  });
  return { doc: { ...doc, indexedIn: indexed, factCount: facts }, facts, conflicts, indexed, note };
}

export async function removeDoc(id: string): Promise<void> {
  const db0 = read();
  if (db0.docs.find((d) => d.id === id)?.indexedIn === "elastic") {
    await elasticDeleteDoc(id).catch(() => undefined);
  }
  await write((db) => {
    db.docs = db.docs.filter((d) => d.id !== id);
    db.chunks = db.chunks.filter((c) => c.docId !== id);
    // Draft facts from it go too; confirmed ones the owner kept stay.
    db.facts = db.facts.filter((f) => !(f.source.kind === "document" && f.source.docId === id && !f.confirmed));
  });
}

/** Copy every passage into Elastic, e.g. after switching it on. */
export async function reindexAll(): Promise<{ count: number }> {
  const db = read();
  await elasticIndex(db.chunks);
  await write((d) => {
    for (const doc of d.docs) doc.indexedIn = "elastic";
  });
  return { count: db.chunks.length };
}
