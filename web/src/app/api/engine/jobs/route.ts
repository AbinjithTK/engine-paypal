import { NextResponse } from "next/server";

import { body, denied, fail, isOwner } from "@/lib/engine/http";
import { draftJob } from "@/lib/engine/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isOwner(req)) return denied();
  const { request } = await body<{ request?: string }>(req);
  try {
    const job = await draftJob(String(request ?? ""));
    return NextResponse.json({ job });
  } catch (e) {
    return fail(e);
  }
}
