import { NextResponse } from "next/server";

import { SECTIONS } from "@/lib/engine/brain";
import { runBuilder, toolsFor } from "@/lib/engine/builders";
import { now, read, write } from "@/lib/engine/db";
import { body, denied, fail, isOwner, scoped } from "@/lib/engine/http";
import { release } from "@/lib/engine/jobs";
import type { BuilderMode, BuilderResources } from "@/lib/engine/types";

/** What a new builder can be given: the company's sections, documents, connectors and playbooks. Private ones are left out. */
async function GET_(req: Request) {
  if (!isOwner(req)) return denied();
  const db = read();
  return NextResponse.json({
    sections: SECTIONS.filter((s) => s.id !== "private").map((s) => ({
      id: s.id,
      label: s.label,
      count: db.facts.filter((f) => f.section === s.id && !f.retired).length,
    })),
    docs: db.docs.filter((d) => !d.private).map((d) => ({ id: d.id, title: d.title })),
    connectors: db.connectors.map((c) => ({ id: c.id, name: c.name, purpose: c.purpose })),
    skills: db.skills.map((s) => ({ id: s.id, name: s.name })),
    privateDocs: db.docs.filter((d) => d.private).length,
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Action =
  | { action: "run"; id: string }
  | { action: "mode"; id: string; mode: BuilderMode }
  | { action: "pause"; id: string; paused: boolean }
  | { action: "schedule"; id: string; scheduled: boolean }
  | { action: "dismiss"; notice: string }
  | { action: "accept"; notice: string }
  | {
      action: "create";
      name: string;
      job: string;
      scheduled?: boolean;
      sections?: string[];
      docIds?: string[];
      connectorIds?: string[];
      skillIds?: string[];
      paypalSales?: boolean;
    }
  | { action: "remove"; id: string };

const BUILT_IN = new Set(["scoper", "reviewer", "bookkeeper", "librarian", "scout"]);

async function POST_(req: Request) {
  if (!isOwner(req)) return denied();
  const b = await body<Action>(req);
  try {
    switch (b.action) {
      case "create": {
        const name = String(b.name ?? "").trim().slice(0, 40);
        const job = String(b.job ?? "").trim().slice(0, 600);
        if (name.length < 2) return NextResponse.json({ error: "Give the builder a name." }, { status: 400 });
        if (job.length < 15) return NextResponse.json({ error: "Say what it should do, in a sentence or two." }, { status: 400 });
        const created = await write((db) => {
          const valid = new Set(SECTIONS.map((s) => s.id as string));
          // Private facts and documents are never handed to a builder, whatever is asked.
          const resources: BuilderResources = {
            sections: (b.sections ?? []).filter((s) => valid.has(s) && s !== "private"),
            docIds: (b.docIds ?? []).filter((id) => db.docs.some((d) => d.id === id && !d.private)),
            connectorIds: (b.connectorIds ?? []).filter((id) => db.connectors.some((c) => c.id === id)),
            skillIds: (b.skillIds ?? []).filter((id) => db.skills.some((s) => s.id === id)),
            paypalSales: Boolean(b.paypalSales),
          };
          const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "builder";
          let id = `own_${base}`;
          for (let i = 2; db.builders.some((x) => x.id === id); i++) id = `own_${base}_${i}`;
          db.builders.push({
            id,
            name,
            building: "Ideas",
            job,
            schedule: b.scheduled ? "Daily at 09:00" : "When you press Run now",
            mode: "suggest",
            canMoveMoney: false,
            tools: toolsFor(resources),
            runs: [{ at: now(), summary: "Created by you. It only suggests; you decide.", ok: true, tools: [] }],
            approvedUnchanged: 0,
            scheduled: Boolean(b.scheduled),
            usesAi: true,
            resources,
          });
          return id;
        });
        return NextResponse.json({ id: created });
      }
      case "remove":
        if (BUILT_IN.has(b.id)) return NextResponse.json({ error: "Built-in builders can be paused, not removed." }, { status: 400 });
        await write((db) => {
          db.builders = db.builders.filter((x) => x.id !== b.id);
        });
        return NextResponse.json({ ok: true });
      case "run":
        return NextResponse.json({ summary: await runBuilder(b.id) });
      case "mode":
        if (!["suggest", "ask", "auto"].includes(b.mode)) return NextResponse.json({ error: "Bad mode." }, { status: 400 });
        await write((db) => {
          const x = db.builders.find((y) => y.id === b.id);
          if (x) x.mode = b.mode;
        });
        return NextResponse.json({ ok: true });
      case "pause":
        await write((db) => {
          const x = db.builders.find((y) => y.id === b.id);
          if (x) x.paused = Boolean(b.paused);
        });
        return NextResponse.json({ ok: true });
      case "schedule":
        await write((db) => {
          const x = db.builders.find((y) => y.id === b.id);
          if (x) x.scheduled = Boolean(b.scheduled);
        });
        return NextResponse.json({ ok: true });
      case "dismiss":
        await write((db) => {
          const n = db.notices.find((x) => x.id === b.notice);
          if (n) n.resolved = true;
        });
        return NextResponse.json({ ok: true });
      case "accept": {
        const n0 = await write((db) => {
          const n = db.notices.find((x) => x.id === b.notice);
          if (!n || n.resolved) return null;
          if (n.action === "build_agent" && n.ref) {
            const spec = JSON.parse(n.ref) as { id: string; name: string; building: string; job: string; schedule: string; tools: string[] };
            if (!db.builders.some((x) => x.id === spec.id)) {
              // Every new builder starts in suggest-only mode. Only the founder raises it.
              db.builders.push({
                id: spec.id,
                name: spec.name,
                building: spec.building,
                job: spec.job,
                schedule: spec.schedule,
                mode: "suggest",
                canMoveMoney: false,
                tools: spec.tools.filter((t) => !/pay|capture|payout|refund|transfer/i.test(t) || /list|read|reminder|invoice/i.test(t)),
                runs: [{ at: now(), summary: "Built by Scout. Starts in suggest-only mode.", ok: true, tools: [] }],
                approvedUnchanged: 0,
                usesAi: true,
              });
            }
            n.resolved = true;
          }
          return n;
        });
        if (n0?.action === "release" && n0.ref) {
          await release(n0.ref, "you");
        }
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}

export const GET = scoped(GET_);
export const POST = scoped(POST_);
