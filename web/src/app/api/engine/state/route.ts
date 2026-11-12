import { NextResponse } from "next/server";

import { scoped } from "@/lib/engine/http";

import { liveFacts } from "@/lib/engine/brain";
import { isDemoWs, read } from "@/lib/engine/db";
import { sweep } from "@/lib/engine/jobs";
import { balance, PAYPAL_SANDBOX, paypalConfigured } from "@/lib/engine/paypal";
import { geminiConfigured, nebiusConfigured } from "@/lib/engine/gemini";

export const dynamic = "force-dynamic";

let balanceCache: { at: number; value: Awaited<ReturnType<typeof balance>> } | null = null;

/** Everything the village needs in one read. Also releases jobs whose window ended. */
async function GET_() {
  await sweep();
  if (!balanceCache || Date.now() - balanceCache.at > 30_000) {
    balanceCache = { at: Date.now(), value: paypalConfigured() ? await balance() : null };
  }
  const db = read();
  const facts = liveFacts(db);
  const held = db.jobs
    .filter((j) => ["funded", "taken", "in_review", "signoff", "changes", "passed", "paying", "appealed"].includes(j.state))
    .reduce((n, j) => n + j.priceCents + j.feeCents, 0);
  const paidOut = db.jobs.filter((j) => j.state === "paid").reduce((n, j) => n + j.priceCents, 0);
  return NextResponse.json({
    serverNow: Date.now(),
    // The sample company that anyone can open, as opposed to an owner's own.
    demo: isDemoWs(),
    company: db.company,
    sandbox: PAYPAL_SANDBOX,
    configured: { paypal: paypalConfigured(), gemini: geminiConfigured(), nebius: nebiusConfigured() },
    balanceCents: balanceCache.value?.availableCents ?? null,
    heldCents: held,
    paidOutCents: paidOut,
    jobs: db.jobs,
    notices: db.notices.filter((n) => !n.resolved).slice(0, 40),
    recentDone: db.notices.filter((n) => n.kind === "done").slice(0, 10),
    builders: db.builders,
    brain: {
      total: facts.length,
      confirmed: facts.filter((f) => f.confirmed).length,
      waiting: facts.filter((f) => !f.confirmed && !f.conflictsWith).length,
      conflicts: facts.filter((f) => f.conflictsWith).length,
      gaps: db.gaps.filter((g) => !g.answer).length,
    },
    access: db.access.slice(0, 20),
  });
}

export const GET = scoped(GET_);
