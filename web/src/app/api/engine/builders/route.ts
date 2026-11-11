import { NextResponse } from "next/server";

import { runBuilder } from "@/lib/engine/builders";
import { now, write } from "@/lib/engine/db";
import { body, denied, fail, isOwner } from "@/lib/engine/http";
import { release } from "@/lib/engine/jobs";
import type { BuilderMode } from "@/lib/engine/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Action =
  | { action: "run"; id: string }
  | { action: "mode"; id: string; mode: BuilderMode }
  | { action: "pause"; id: string; paused: boolean }
  | { action: "schedule"; id: string; scheduled: boolean }
  | { action: "dismiss"; notice: string }
  | { action: "accept"; notice: string };

export async function POST(req: Request) {
  if (!isOwner(req)) return denied();
  const b = await body<Action>(req);
  try {
    switch (b.action) {
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
