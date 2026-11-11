import { NextResponse } from "next/server";

import { addFact, FIRST_QUESTION, interviewTurn, SECTIONS } from "@/lib/engine/brain";
import { nextId, now, read, reset, write } from "@/lib/engine/db";
import { body, denied, fail, isOwner } from "@/lib/engine/http";
import { resolveNotices } from "@/lib/engine/jobs";
import { connectRepo } from "@/lib/engine/github";
import { ingest, reindexAll, removeDoc } from "@/lib/engine/ingest";
import { elasticConfigured, elasticStatus, searchBrain, searchMode, SUGGEST_ELASTIC_AT } from "@/lib/engine/search";
import type { BrainSection, SearchMode } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const db = read();
  return NextResponse.json({
    company: db.company,
    sections: SECTIONS,
    facts: db.facts.filter((f) => !f.retired),
    gaps: db.gaps,
    interview: db.interview.length ? db.interview : [{ role: "engine", text: FIRST_QUESTION, at: now() }],
    docs: db.docs,
    connectors: db.connectors,
    skills: db.skills,
    search: {
      mode: searchMode(db),
      chosen: db.company.search ?? "local",
      elasticConfigured: elasticConfigured(),
      passages: db.chunks.length,
      suggestElastic: db.chunks.length >= SUGGEST_ELASTIC_AT && searchMode(db) === "local",
      suggestAt: SUGGEST_ELASTIC_AT,
    },
  });
}

type Action =
  | { action: "answer"; text: string }
  | { action: "import"; url: string }
  | { action: "add"; section: BrainSection; text: string }
  | { action: "confirm"; id: string }
  | { action: "retire"; id: string }
  | { action: "edit"; id: string; text: string }
  | { action: "resolve"; keep: string; drop: string }
  | { action: "answer_gap"; id: string; text: string }
  | { action: "company"; name?: string; owner?: string }
  | { action: "finish" }
  | { action: "reset" }
  | { action: "paste"; title: string; text: string; private?: boolean }
  | { action: "remove_doc"; id: string }
  | { action: "github"; repo: string; private?: boolean }
  | { action: "add_connector"; kind: "mcp" | "tool"; name: string; url?: string; purpose: string }
  | { action: "remove_connector"; id: string }
  | { action: "add_skill"; name: string; when: string; body: string }
  | { action: "remove_skill"; id: string }
  | { action: "search_mode"; mode: SearchMode }
  | { action: "search"; query: string }
  | { action: "elastic_status" };

export async function POST(req: Request) {
  if (!isOwner(req)) return denied();
  const b = await body<Action>(req);
  // A fact with no words, or in a section that doesn't exist, would show up in briefs as noise.
  if (b.action === "add" || b.action === "edit" || b.action === "answer_gap") {
    const text = String(b.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Write the fact first." }, { status: 400 });
    if (text.length > 1000) return NextResponse.json({ error: "Keep one fact under 1,000 characters. Split longer notes into several facts." }, { status: 400 });
    b.text = text;
  }
  if (b.action === "add" && !SECTIONS.some((s) => s.id === b.section)) {
    return NextResponse.json({ error: "Pick a section for the fact." }, { status: 400 });
  }
  try {
    switch (b.action) {
      case "answer": {
        const text = String(b.text ?? "").trim().slice(0, 3000);
        if (!text) return NextResponse.json({ error: "Say something first." }, { status: 400 });
        // Gemini runs outside the write lock; the facts land inside it.
        const r = await write(async (db) => {
          if (db.interview.length === 0) db.interview.push({ role: "engine", text: FIRST_QUESTION, at: now() });
          db.interview.push({ role: "founder", text, at: now() });
          const turn = await interviewTurn(db, text);
          db.interview.push({
            role: "engine",
            text: turn.next ?? "That's enough to start. Check what I wrote down on the right, then post your first job.",
            at: now(),
          });
          if (!turn.next) db.company.onboarded = true;
          return turn;
        });
        return NextResponse.json({ added: r.facts, done: !r.next });
      }
      case "import": {
        const url = String(b.url ?? "").trim();
        if (!/^https:\/\/[^\s]+$/.test(url)) return NextResponse.json({ error: "Give a full https:// address." }, { status: 400 });
        const host = new URL(url).hostname;
        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || host.endsWith(".internal")) {
          return NextResponse.json({ error: "Only public websites." }, { status: 400 });
        }
        // No redirects: a public page must not bounce the fetch to an internal address.
        const res = await fetch(url, {
          headers: { "User-Agent": "EngineBrain/1.0" },
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 20000);
        const r = await ingest({ title: new URL(url).hostname + new URL(url).pathname, text, origin: "website", uri: url, bytes: html.length, isPrivate: false });
        return NextResponse.json({ added: Array.from({ length: r.facts }), conflicts: r.conflicts, note: r.note });
      }
      case "add":
        return NextResponse.json({
          fact: await write((db) => addFact(db, { section: b.section, text: b.text, source: { kind: "founder" }, confirmed: true })),
        });
      case "confirm":
        await write((db) => {
          const f = db.facts.find((x) => x.id === b.id);
          if (f) f.confirmed = true;
          resolveNotices(db, "confirm_fact", b.id);
          const lib = db.builders.find((x) => x.id === "librarian");
          if (lib) lib.approvedUnchanged++;
        });
        return NextResponse.json({ ok: true });
      case "retire":
        await write((db) => {
          const f = db.facts.find((x) => x.id === b.id);
          if (f) f.retired = true;
          resolveNotices(db, "confirm_fact", b.id);
        });
        return NextResponse.json({ ok: true });
      case "edit":
        await write((db) => {
          const f = db.facts.find((x) => x.id === b.id);
          if (f && b.text.trim()) {
            f.text = b.text.trim().slice(0, 500);
            f.confirmed = true;
            f.source = { kind: "founder" };
          }
        });
        return NextResponse.json({ ok: true });
      case "resolve":
        await write((db) => {
          const keep = db.facts.find((x) => x.id === b.keep);
          const drop = db.facts.find((x) => x.id === b.drop);
          if (keep) {
            keep.confirmed = true;
            keep.conflictsWith = undefined;
          }
          if (drop) {
            drop.retired = true;
            drop.conflictsWith = undefined;
          }
          resolveNotices(db, "resolve_conflict", b.keep);
          resolveNotices(db, "resolve_conflict", b.drop);
        });
        return NextResponse.json({ ok: true });
      case "answer_gap":
        await write((db) => {
          const g = db.gaps.find((x) => x.id === b.id);
          if (!g) return;
          g.answer = b.text.trim().slice(0, 1000);
          const f = addFact(db, {
            section: "rules",
            text: `${g.question.replace(/\?$/, "")}: ${g.answer}`,
            source: g.jobId ? { kind: "client_answer", jobId: g.jobId } : { kind: "founder" },
            confirmed: true,
          });
          const job = db.jobs.find((j) => j.id === g.jobId);
          if (f && job && !job.factIds.includes(f.id)) job.factIds.push(f.id);
          resolveNotices(db, "answer_gap", g.id);
        });
        return NextResponse.json({ ok: true });
      case "company":
        await write((db) => {
          if (b.name?.trim()) db.company.name = b.name.trim().slice(0, 80);
          if (b.owner?.trim()) db.company.owner = b.owner.trim().slice(0, 60);
        });
        return NextResponse.json({ ok: true });
      case "finish":
        await write((db) => {
          db.company.onboarded = true;
        });
        return NextResponse.json({ ok: true });
      case "paste": {
        const text = String(b.text ?? "").slice(0, 200_000);
        const title = String(b.title ?? "").trim().slice(0, 120) || "Pasted notes";
        const r = await ingest({ title, text, origin: "text", bytes: text.length, isPrivate: Boolean(b.private) });
        return NextResponse.json(r);
      }
      case "remove_doc":
        await removeDoc(String(b.id));
        return NextResponse.json({ ok: true });
      case "github":
        return NextResponse.json(await connectRepo(String(b.repo ?? ""), Boolean(b.private)));
      case "add_connector": {
        const name = String(b.name ?? "").trim().slice(0, 80);
        const purpose = String(b.purpose ?? "").trim().slice(0, 300);
        const url = String(b.url ?? "").trim().slice(0, 300);
        if (!name || !purpose) return NextResponse.json({ error: "Give it a name and say what it's for." }, { status: 400 });
        if (url && !/^https:\/\/\S+$/.test(url)) return NextResponse.json({ error: "The address must start with https://" }, { status: 400 });
        const c = await write((db) => {
          const con = { id: nextId(db, "con"), kind: b.kind === "mcp" ? "mcp" : "tool", name, url: url || undefined, purpose, createdAt: now() } as const;
          db.connectors.push({ ...con });
          return con;
        });
        return NextResponse.json({ connector: c });
      }
      case "remove_connector":
        await write((db) => {
          db.connectors = db.connectors.filter((c) => c.id !== b.id);
        });
        return NextResponse.json({ ok: true });
      case "add_skill": {
        const name = String(b.name ?? "").trim().slice(0, 80);
        const when = String(b.when ?? "").trim().slice(0, 300);
        const sbody = String(b.body ?? "").trim().slice(0, 8000);
        if (!name || !sbody) return NextResponse.json({ error: "Give the skill a name and the steps." }, { status: 400 });
        const s = await write((db) => {
          const skill = { id: nextId(db, "skl"), name, when: when || name, body: sbody, createdAt: now() };
          db.skills.push(skill);
          return skill;
        });
        return NextResponse.json({ skill: s });
      }
      case "remove_skill":
        await write((db) => {
          db.skills = db.skills.filter((s) => s.id !== b.id);
        });
        return NextResponse.json({ ok: true });
      case "search_mode": {
        const mode: SearchMode = b.mode === "elastic" ? "elastic" : "local";
        if (mode === "elastic") {
          if (!elasticConfigured()) {
            return NextResponse.json({ error: "Set ELASTIC_URL and ELASTIC_API_KEY on the server first." }, { status: 400 });
          }
          const st = await elasticStatus();
          if (!st.ok) return NextResponse.json({ error: `Elastic isn't reachable: ${st.error}` }, { status: 502 });
          await write((db) => {
            db.company.search = "elastic";
          });
          const r = await reindexAll();
          return NextResponse.json({ ok: true, mode, indexed: r.count });
        }
        await write((db) => {
          db.company.search = "local";
        });
        return NextResponse.json({ ok: true, mode });
      }
      case "search": {
        const q = String(b.query ?? "").trim().slice(0, 500);
        if (!q) return NextResponse.json({ error: "Type something to search for." }, { status: 400 });
        const r = await searchBrain(read(), q, { k: 8, includePrivate: true });
        return NextResponse.json({
          via: r.via,
          fellBack: r.fellBack,
          hits: r.chunks.map((c) => ({ title: c.chunk.title, text: c.chunk.text.slice(0, 500), private: c.chunk.private, score: Number(c.score.toFixed(3)) })),
        });
      }
      case "elastic_status":
        return NextResponse.json(await elasticStatus());
      case "reset":
        // On a public deployment, wiping everything needs the owner key to be set.
        if (process.env.NODE_ENV === "production" && !process.env.ENGINE_OWNER_KEY) {
          return NextResponse.json({ error: "Reset is off on this deployment. Set ENGINE_OWNER_KEY to allow it." }, { status: 403 });
        }
        reset();
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
