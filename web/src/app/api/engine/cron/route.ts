import { NextResponse } from "next/server";

import { runBuilder } from "@/lib/engine/builders";
import { read } from "@/lib/engine/db";
import { sweep } from "@/lib/engine/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Called by a Render cron job (render.yaml). Releases jobs past their appeal
 * window, then runs the daily builders. Needs CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const released = await sweep();
  const daily = new URL(req.url).searchParams.get("daily") === "1";
  const runs: Record<string, string> = {};
  if (daily) {
    for (const id of ["bookkeeper", "librarian", "scout"]) {
      const b = read().builders.find((x) => x.id === id);
      // Only builders the owner put on the schedule; AI ones cost credits per run.
      if (!b || b.paused || !b.scheduled) continue;
      try {
        runs[id] = await runBuilder(id);
      } catch (e) {
        runs[id] = `failed: ${e instanceof Error ? e.message : e}`;
      }
    }
  }
  return NextResponse.json({ released, runs });
}
