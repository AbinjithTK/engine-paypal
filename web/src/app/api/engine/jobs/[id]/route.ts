import { NextResponse } from "next/server";

import { chunksById, factsById } from "@/lib/engine/brain";
import { read } from "@/lib/engine/db";
import { body, denied, fail, isOwner, originOf } from "@/lib/engine/http";
import {
  appeal,
  cancelJob,
  editDraft,
  fundWithTestCard,
  invite,
  projectJobs,
  rematch,
  release,
  settleAppeal,
  signOff,
  startFunding,
  uninvite,
} from "@/lib/engine/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: RouteContext<"/api/engine/jobs/[id]">) {
  const { id } = await ctx.params;
  const db = read();
  const job = db.jobs.find((j) => j.id === id);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });
  const shared = factsById(db, job.factIds);
  const withheld = db.facts.filter((f) => !f.retired).length - shared.length;
  const passages = chunksById(db, job.chunkIds ?? []).map((c) => ({ id: c.id, title: c.title, text: c.text.slice(0, 400) }));
  const connectors = db.connectors.filter((c) => job.connectorIds?.includes(c.id));
  const skills = db.skills.filter((s) => job.skillIds?.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));
  const privateDocs = db.docs.filter((d) => d.private).length;
  const access = db.access.filter((a) => a.target === id).slice(0, 20);
  const milestones = projectJobs(db, job).map((j) => ({
    id: j.id,
    title: j.title,
    state: j.state,
    locked: Boolean(j.locked),
    step: j.project?.step ?? 1,
    priceCents: j.priceCents,
  }));
  return NextResponse.json({ job, shared, withheld, access, milestones, passages, connectors, skills, privateDocs });
}

type Action =
  | { action: "edit"; title?: string; criteria?: string[]; judgement?: string[]; priceCents?: number; answer?: string; role?: string; skills?: string[]; waits?: boolean }
  | { action: "fund" }
  | { action: "fund_card" }
  | { action: "release" }
  | { action: "appeal"; reason?: string }
  | { action: "settle"; outcome: "release" | "changes" }
  | { action: "signoff"; approved: boolean; note?: string }
  | { action: "invite"; expertId: string }
  | { action: "uninvite"; expertId: string }
  | { action: "rematch" }
  | { action: "cancel" };

export async function POST(req: Request, ctx: RouteContext<"/api/engine/jobs/[id]">) {
  const { id } = await ctx.params;
  const b = await body<Action>(req);
  // Appeals are open to both sides; everything else is the owner's.
  if (b.action !== "appeal" && !isOwner(req)) return denied();
  try {
    switch (b.action) {
      case "edit":
        return NextResponse.json({ job: await editDraft(id, b) });
      case "fund":
        return NextResponse.json({ approveUrl: await startFunding(id, originOf(req)) });
      case "fund_card":
        return NextResponse.json({ job: await fundWithTestCard(id) });
      case "release":
        return NextResponse.json({ job: await release(id, "you") });
      case "invite":
        return NextResponse.json({ job: await invite(id, String(b.expertId)) });
      case "uninvite":
        return NextResponse.json({ job: await uninvite(id, String(b.expertId)) });
      case "rematch":
        await rematch([id]);
        return NextResponse.json({ ok: true });
      case "signoff": {
        const signer = read().jobs.find((j) => j.id === id)?.signer;
        const by = signer?.name ? signer.name : signer?.role && signer.role !== "Founder" ? signer.role : read().company.owner;
        return NextResponse.json({ job: await signOff(id, by, Boolean(b.approved), String(b.note ?? "")) });
      }
      case "appeal":
        return NextResponse.json({ job: await appeal(id, "You", b.reason ?? "") });
      case "settle":
        return NextResponse.json({ job: await settleAppeal(id, b.outcome) });
      case "cancel":
        return NextResponse.json({ job: await cancelJob(id) });
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return fail(e);
  }
}
