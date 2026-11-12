import { NextResponse } from "next/server";

import { read } from "@/lib/engine/db";
import { body, expertCookie, fail, scoped } from "@/lib/engine/http";
import * as jobs from "@/lib/engine/jobs";
import { expertById, expertJob } from "@/lib/engine/work";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function who(req: Request) {
  return expertById(read(), expertCookie(req));
}

async function GET_(req: Request, ctx: RouteContext<"/api/work/jobs/[id]">) {
  const { id } = await ctx.params;
  const me = who(req);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = read();
  const job = db.jobs.find((j) => j.id === id);
  if (!job || !jobs.canSee(job, me.id)) return NextResponse.json({ error: "This job isn't open to you." }, { status: 404 });
  return NextResponse.json(expertJob(db, job, me.id));
}

type Action =
  | { action: "accept" }
  | { action: "decline" }
  | { action: "ask"; question: string }
  | { action: "update"; text: string }
  | { action: "submit"; content: string; artefact?: string; notes?: string };

async function POST_(req: Request, ctx: RouteContext<"/api/work/jobs/[id]">) {
  const { id } = await ctx.params;
  const me = who(req);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await body<Action>(req);
  try {
    switch (b.action) {
      case "accept":
        await jobs.takeJob(id, { id: me.id, name: me.name, email: me.email });
        break;
      case "decline":
        await jobs.declineInvite(id, me.id);
        break;
      case "ask":
        await jobs.askQuestion(id, me, String(b.question ?? ""));
        break;
      case "update":
        await jobs.postUpdate(id, me.id, me.name, String(b.text ?? ""));
        break;
      case "submit":
        await jobs.submitWork(id, me.id, { content: String(b.content ?? ""), artefact: b.artefact, notes: b.notes });
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    const db = read();
    const job = db.jobs.find((j) => j.id === id)!;
    return NextResponse.json(expertJob(db, job, me.id));
  } catch (e) {
    return fail(e);
  }
}

export const GET = scoped(GET_);
export const POST = scoped(POST_);
