import { NextResponse } from "next/server";

import { body, denied, fail, isOwner, scoped } from "@/lib/engine/http";
import { draftJob } from "@/lib/engine/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function POST_(req: Request) {
  if (!isOwner(req)) return denied();
  const { request } = await body<{ request?: string }>(req);
  try {
    const job = await draftJob(String(request ?? ""));
    return NextResponse.json({ job });
  } catch (e) {
    return fail(e);
  }
}

export const POST = scoped(POST_);
