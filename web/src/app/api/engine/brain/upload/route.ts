import { NextResponse } from "next/server";

import { denied, fail, isOwner } from "@/lib/engine/http";
import { extractText, ingest, IngestError, MAX_BYTES } from "@/lib/engine/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Multipart upload: one or more files, plus private=1 to keep them out of every job. */
export async function POST(req: Request) {
  if (!isOwner(req)) return denied();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the files as a form upload." }, { status: 400 });
  }
  const isPrivate = form.get("private") === "1";
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) return NextResponse.json({ error: "Choose at least one file." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ error: "Up to 10 files at a time." }, { status: 400 });

  const results: { name: string; ok: boolean; facts?: number; chunks?: number; indexed?: string; note?: string; error?: string }[] = [];
  for (const f of files) {
    try {
      if (f.size > MAX_BYTES) throw new IngestError("Files must be under 10 MB.");
      const text = await extractText(f.name, f.type, Buffer.from(await f.arrayBuffer()));
      const r = await ingest({ title: f.name, text, origin: "upload", uri: `upload:${f.name}`, bytes: f.size, isPrivate });
      results.push({ name: f.name, ok: true, facts: r.facts, chunks: r.doc.chunkCount, indexed: r.indexed, note: r.note });
    } catch (e) {
      if (!(e instanceof IngestError)) console.error("[engine] upload", e);
      results.push({ name: f.name, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Could not read it." });
    }
  }
  if (results.every((r) => !r.ok)) return fail(new IngestError(results.map((r) => `${r.name}: ${r.error}`).join(" ")));
  return NextResponse.json({ results });
}
