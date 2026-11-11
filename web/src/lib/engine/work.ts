import "server-only";

import { chunksById, factsById } from "./brain";
import { canSee, projectJobs } from "./jobs";
import type { Db, Expert, Job } from "./types";

/**
 * What an expert sees. One builder for the freelancer dashboard; the MCP
 * server gives an agent the same content as text. Never includes private
 * facts or passages, other experts' invites, or the founder's money beyond
 * this job.
 */

export function expertById(db: Db, id: string | null | undefined): Expert | undefined {
  return id ? db.experts.find((e) => e.id === id) : undefined;
}

function card(db: Db, j: Job, expertId: string) {
  const inv = j.invites?.find((x) => x.expertId === expertId);
  return {
    id: j.id,
    title: j.title,
    role: j.role,
    state: j.state,
    priceCents: j.priceCents,
    skills: j.skills,
    project: j.project,
    company: db.company.name,
    invite: inv ? { status: inv.status, reason: inv.reason, score: inv.score } : undefined,
    rounds: j.submissions.length,
    createdAt: j.createdAt,
  };
}

export function expertHome(db: Db, expertId: string) {
  const mine = db.jobs.filter((j) => j.doer?.id === expertId);
  const invited = db.jobs.filter((j) => j.state === "funded" && j.invites?.some((x) => x.expertId === expertId && x.status === "invited"));
  const open = db.jobs.filter((j) => j.state === "funded" && canSee(j, expertId) && !invited.includes(j));
  const pending = db.jobs.filter(
    (j) => j.state === "draft" && j.invites?.some((x) => x.expertId === expertId && x.status === "invited"),
  ).length;
  const earned = mine
    .filter((j) => j.state === "paid")
    .reduce((n, j) => n + (j.payees.find((p) => p.email === expertById(db, expertId)?.email)?.amountCents ?? 0), 0);
  const held = mine
    .filter((j) => !["paid", "cancelled"].includes(j.state))
    .reduce((n, j) => n + (j.payees.find((p) => p.email === expertById(db, expertId)?.email)?.amountCents ?? 0), 0);
  return {
    invited: invited.map((j) => card(db, j, expertId)),
    open: open.map((j) => card(db, j, expertId)),
    mine: mine.map((j) => card(db, j, expertId)),
    pendingInvites: pending,
    earnedCents: earned,
    heldCents: held,
  };
}

export function expertJob(db: Db, job: Job, expertId: string) {
  const team = projectJobs(db, job).map((j) => ({
    id: j.id,
    title: j.title,
    role: j.role,
    step: j.project?.step ?? 1,
    state: j.state,
    locked: Boolean(j.locked),
    who: j.doer?.name,
    you: j.doer?.id === expertId,
  }));
  const last = job.submissions[job.submissions.length - 1];
  const taken = job.doer?.id === expertId;
  return {
    job: {
      ...card(db, job, expertId),
      brief: job.brief,
      criteria: job.criteria,
      judgement: job.judgement ?? [],
      signer: job.signer,
      payees: taken ? job.payees : [],
      releaseAt: job.releaseAt,
      payoutStatus: job.paypal.payoutStatus,
      payoutBatchId: taken ? job.paypal.payoutBatchId : undefined,
      held: Boolean(job.paypal.authorizationId) && !["paid", "cancelled"].includes(job.state),
    },
    taken,
    facts: factsById(db, job.factIds).map((f) => ({ id: f.id, section: f.section, text: f.text })),
    passages: chunksById(db, job.chunkIds ?? []).map((c) => ({ id: c.id, title: c.title, text: c.text })),
    skills: db.skills.filter((s) => job.skillIds?.includes(s.id)),
    connectors: db.connectors.filter((c) => job.connectorIds?.includes(c.id)),
    questions: db.gaps.filter((g) => g.jobId === job.id).map((g) => ({ id: g.id, question: g.question, askedBy: g.askedBy, answer: g.answer, at: g.createdAt })),
    rounds: taken
      ? job.submissions.map((s) => ({
          at: s.at,
          content: s.content,
          artefact: s.artefact,
          review: s.review,
          signoff: s.signoff,
        }))
      : [],
    lastReview: taken ? last?.review : undefined,
    team: team.length > 1 ? team : [],
    events: taken ? job.events.slice(-12) : [],
  };
}
