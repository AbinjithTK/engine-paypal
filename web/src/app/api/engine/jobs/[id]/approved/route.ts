import { NextResponse } from "next/server";

import { originOf, scoped } from "@/lib/engine/http";
import { confirmFunding } from "@/lib/engine/jobs";

export const dynamic = "force-dynamic";

/** PayPal sends the client back here after they approve. Place the hold. */
async function GET_(req: Request, ctx: RouteContext<"/api/engine/jobs/[id]/approved">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const orderId = url.searchParams.get("token") ?? "";
  const back = `${originOf(req)}/app/jobs/${id}`;
  try {
    await confirmFunding(id, orderId);
    return NextResponse.redirect(`${back}?funded=1`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PayPal error";
    return NextResponse.redirect(`${back}?error=${encodeURIComponent(msg.slice(0, 200))}`);
  }
}

export const GET = scoped(GET_);
