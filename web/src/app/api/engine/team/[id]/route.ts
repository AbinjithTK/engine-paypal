import { NextResponse } from "next/server";

import { read } from "@/lib/engine/db";
import { projectJobs } from "@/lib/engine/jobs";

export const dynamic = "force-dynamic";

/** The team board for a project (or a single job): one slot per role, matches, invites, who is on it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/engine/team/[id]">) {
  const { id } = await ctx.params;
  const db = read();
  const first = db.jobs.find((j) => j.project?.id === id) ?? db.jobs.find((j) => j.id === id);
  if (!first) return NextResponse.json({ error: "No such project." }, { status: 404 });
  const roles = projectJobs(db, first).map((j) => ({
    jobId: j.id,
    title: j.title,
    role: j.role ?? "Expert",
    step: j.project?.step ?? 1,
    state: j.state,
    locked: Boolean(j.locked),
    priceCents: j.priceCents,
    skills: j.skills,
    matches: j.matches ?? [],
    invites: j.invites ?? [],
    doer: j.doer ? { id: j.doer.id, name: j.doer.name } : null,
    paidCents: j.state === "paid" ? j.priceCents : 0,
  }));
  return NextResponse.json({
    title: first.project?.title ?? first.title,
    projectId: first.project?.id,
    roles,
    experts: db.experts,
    totalCents: roles.reduce((n, r) => n + r.priceCents, 0),
  });
}
