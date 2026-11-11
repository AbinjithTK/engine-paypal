import "server-only";

import { feeFor, reviewWork, scopeRequest } from "./agents";
import { matchExperts } from "./match";
import { addFact, sliceForJob } from "./brain";
import { invoicePaidJob } from "./bookkeeper";
import { shortError } from "./gemini";
import { nextId, now, read, write } from "./db";
import * as paypal from "./paypal";
import { DEMO_DOER } from "./seed";
import type { Db, Job, JobEvent, JobState, Notice, Submission } from "./types";

/**
 * The money loop. Every state change is guarded here, so no caller (UI, MCP,
 * builder, cron) can skip a step: money is held before work starts, released
 * only after a passing review, and paid out exactly once.
 */

export const RELEASE_WINDOW_SECONDS = Number(process.env.RELEASE_WINDOW_SECONDS || 600);

export class JobError extends Error {}

function ev(job: Job, by: string, text: string, kind: JobEvent["kind"] = "system") {
  job.events.push({ at: now(), by, text, kind });
}

export function notice(db: Db, n: Omit<Notice, "id" | "createdAt">): Notice {
  // One open notice per action and target: no duplicate approval cards.
  const open = db.notices.find((x) => !x.resolved && x.action === n.action && x.ref === n.ref && x.kind === n.kind);
  if (open && n.action) {
    Object.assign(open, n);
    return open;
  }
  const full: Notice = { ...n, id: nextId(db, "note"), createdAt: now() };
  db.notices.unshift(full);
  if (db.notices.length > 200) db.notices.length = 200;
  return full;
}

export function resolveNotices(db: Db, action: Notice["action"], ref: string) {
  for (const n of db.notices) if (n.action === action && n.ref === ref) n.resolved = true;
}

function getJob(db: Db, id: string): Job {
  const j = db.jobs.find((x) => x.id === id);
  if (!j) throw new JobError("No such job.");
  return j;
}

function expect(job: Job, states: JobState[], doing: string) {
  if (!states.includes(job.state)) {
    throw new JobError(`Can't ${doing}: the job is ${job.state.replace("_", " ")}.`);
  }
}

function money(c: number) {
  return `$${paypal.dollars(c)}`;
}

function builderRun(db: Db, id: string, summary: string, tools: string[], ok = true) {
  const b = db.builders.find((x) => x.id === id);
  if (!b) return;
  b.runs.unshift({ at: now(), summary, ok, tools });
  if (b.runs.length > 30) b.runs.length = 30;
}

// ─── 1. describe and scope ───────────────────────────────────────────────

export async function draftJob(request: string): Promise<Job> {
  const text = request.trim();
  if (text.length < 10) throw new JobError("Say a little more about what you need.");
  if (text.length > 4000) throw new JobError("Keep the request under 4,000 characters.");
  const snapshot = read();
  const scope = await scopeRequest(snapshot, text);
  const slice = await sliceForJob(snapshot, {
    title: scope.title,
    brief: scope.brief,
    criteria: scope.milestones.flatMap((m) => [...m.criteria, ...m.judgement]),
  });
  const factIds = slice.factIds;
  return write((db) => {
    const of = scope.milestones.length;
    const projectId = of > 1 ? nextId(db, "proj") : undefined;
    const total = scope.milestones.reduce((n, m) => n + m.priceCents, 0);
    const jobs: Job[] = scope.milestones.map((m, i) => {
      const job: Job = {
        id: nextId(db, "job"),
        title: of > 1 ? m.title : scope.title,
        request: text,
        brief: of > 1 ? `${scope.brief}\n\nThis milestone (${i + 1} of ${of}): ${m.brief}` : `${scope.brief}${m.brief && m.brief !== scope.brief ? `\n\n${m.brief}` : ""}`,
        criteria: m.criteria,
        judgement: m.judgement,
        signer: scope.signer,
        project: projectId ? { id: projectId, title: scope.title, step: i + 1, of } : undefined,
        role: m.role,
        // A milestone that depends on the one before it waits; a parallel one can start now.
        locked: i > 0 && !m.parallel,
        priceCents: m.priceCents,
        feeCents: feeFor(m.priceCents),
        priceReason: i === 0 ? scope.priceReason : undefined,
        question: i === 0 ? scope.question : undefined,
        state: "draft",
        skills: (m.skills.length ? m.skills : [scope.expert, ...scope.skills]).filter(Boolean).slice(0, 6),
        factIds,
        chunkIds: slice.chunkIds,
        connectorIds: slice.connectorIds,
        skillIds: slice.skillIds,
        payees: [],
        submissions: [],
        paypal: {},
        createdAt: now(),
        events: [],
      };
      if (i === 0) ev(job, "You", "Described the work.", "person");
      if (i === 0 && (slice.chunkIds.length || slice.connectorIds.length || slice.skillIds.length)) {
        ev(
          job,
          "Librarian",
          `Found ${slice.chunkIds.length} passage${slice.chunkIds.length === 1 ? "" : "s"} in your documents (searched ${slice.searchedVia}), ${slice.connectorIds.length} connector${slice.connectorIds.length === 1 ? "" : "s"} and ${slice.skillIds.length} skill${slice.skillIds.length === 1 ? "" : "s"} for this work.`,
          "ai",
        );
      }
      ev(
        job,
        "Scoper",
        `${of > 1 ? `Milestone ${i + 1} of ${of}. ` : ""}${job.criteria.length} checks the AI verifies and ${job.judgement.length} judgement calls for the ${job.signer?.role.toLowerCase() ?? "founder"}. Priced at ${money(job.priceCents)}. Shared ${factIds.length} Brain facts.`,
        "ai",
      );
      if (job.locked) ev(job, "Engine", `Opens once milestone ${i} is paid. Its money is held only then, so no hold sits idle.`, "system");
      else if (i > 0) ev(job, "Engine", `Runs alongside milestone ${i}, so its ${job.role?.toLowerCase() ?? "expert"} can start now.`, "system");
      return job;
    });
    builderRun(
      db,
      "scoper",
      `Scoped "${scope.title}" for a ${scope.expert}: ${of} milestone${of === 1 ? "" : "s"}, ${money(total)}`,
      ["brain.read"],
    );
    db.jobs.unshift(...jobs);
    return jobs;
  }).then(async (jobs) => {
    await rematch(jobs.map((j) => j.id));
    return getJob(read(), jobs[0].id);
  });
}

// ─── matching and invites ────────────────────────────────────────────────

/** Rank experts for each job. Runs the model outside the write lock. */
export async function rematch(ids: string[]): Promise<void> {
  const snap = read();
  const results = await Promise.all(
    ids.map(async (id) => {
      const job = snap.jobs.find((j) => j.id === id);
      return job ? { id, matches: await matchExperts(snap, job) } : null;
    }),
  );
  await write((db) => {
    for (const r of results) {
      if (!r) continue;
      const j = db.jobs.find((x) => x.id === r.id);
      if (!j) continue;
      j.matches = r.matches;
      const top = r.matches[0];
      const name = top ? db.experts.find((e) => e.id === top.expertId)?.name : undefined;
      ev(j, "Matcher", top ? `Ranked ${r.matches.length} experts for the ${j.role ?? "job"}. Best fit: ${name} (${top.score}).` : "Found no expert who fits yet.", "ai");
    }
    builderRun(db, "scoper", `Matched experts for ${results.filter(Boolean).length} role${results.length === 1 ? "" : "s"}`, ["experts.read"]);
  });
}

export async function invite(id: string, expertId: string): Promise<Job> {
  return write((db) => {
    const j = getJob(db, id);
    expect(j, ["draft", "funded"], "invite someone");
    const e = db.experts.find((x) => x.id === expertId);
    if (!e) throw new JobError("No such expert.");
    j.invites ??= [];
    const existing = j.invites.find((x) => x.expertId === expertId);
    if (existing && existing.status !== "declined") return j;
    const m = j.matches?.find((x) => x.expertId === expertId);
    const inv = { expertId, at: now(), score: m?.score ?? 0, reason: m?.reason ?? "Chosen by the founder.", status: "invited" as const };
    if (existing) Object.assign(existing, inv);
    else j.invites.push(inv);
    ev(j, "You", `Invited ${e.name} as ${j.role ?? "the expert"}.${j.state === "draft" ? " They see it once the money is held." : ""}`, "person");
    return j;
  });
}

export async function uninvite(id: string, expertId: string): Promise<Job> {
  return write((db) => {
    const j = getJob(db, id);
    const inv = j.invites?.find((x) => x.expertId === expertId && x.status === "invited");
    if (!inv) throw new JobError("They aren't invited to this job.");
    j.invites = j.invites!.filter((x) => x !== inv);
    ev(j, "You", `Withdrew the invite to ${db.experts.find((e) => e.id === expertId)?.name ?? "an expert"}.`, "person");
    return j;
  });
}

/** Can this expert see and take the job? Invited, or the job is open to everyone. */
export function canSee(job: Job, expertId: string): boolean {
  if (job.doer?.id === expertId) return true;
  if (job.state !== "funded") return false;
  const invites = job.invites ?? [];
  const open = invites.filter((x) => x.status === "invited");
  if (invites.some((x) => x.expertId === expertId && x.status === "invited")) return true;
  return open.length === 0;
}

/** An expert asks the founder something. The answer is saved to the Brain. */
export async function askQuestion(id: string, who: { id: string; name: string }, question: string): Promise<void> {
  const q = question.trim().slice(0, 500);
  if (q.length < 5) throw new JobError("Ask a full question.");
  await write((db) => {
    const j = getJob(db, id);
    if (!canSee(j, who.id)) throw new JobError("You can't reach this job.");
    const gap = { id: nextId(db, "gap"), jobId: j.id, question: q, askedBy: who.name, createdAt: now() };
    db.gaps.push(gap);
    notice(db, {
      kind: "approval",
      title: `${who.name} asks: ${q}`,
      why: `On "${j.title}". Your answer is saved to the Brain so nobody asks again.`,
      action: "answer_gap",
      ref: gap.id,
    });
    ev(j, who.name, `Asked: ${q}`, "person");
  });
}

export async function declineInvite(id: string, expertId: string): Promise<Job> {
  return write((db) => {
    const j = getJob(db, id);
    const inv = j.invites?.find((x) => x.expertId === expertId && x.status === "invited");
    if (!inv) throw new JobError("There's no open invite for you on this job.");
    inv.status = "declined";
    const name = db.experts.find((e) => e.id === expertId)?.name ?? "An expert";
    ev(j, name, "Declined the invite.", "person");
    notice(db, {
      kind: "approval",
      title: `${name} declined "${j.title}"`,
      why: "Pick someone else on the team board. The Matcher's next suggestions are ready.",
      action: "invite",
      ref: j.id,
    });
    return j;
  });
}

/** Every milestone of a job's project, in order. A single job returns itself. */
export function projectJobs(db: Db, job: Job): Job[] {
  if (!job.project) return [job];
  return db.jobs.filter((j) => j.project?.id === job.project!.id).sort((a, b) => a.project!.step - b.project!.step);
}

export async function editDraft(
  id: string,
  patch: {
    title?: string;
    criteria?: string[];
    judgement?: string[];
    priceCents?: number;
    answer?: string;
    signer?: { name: string; role: string };
    role?: string;
    skills?: string[];
    /** For a later milestone: wait for the previous one to be paid. */
    waits?: boolean;
  },
): Promise<Job> {
  return write((db) => {
    const job = getJob(db, id);
    expect(job, ["draft"], "edit");
    if (patch.title?.trim()) job.title = patch.title.trim().slice(0, 120);
    if (patch.criteria) {
      const c = patch.criteria.map((x) => x.trim()).filter(Boolean).slice(0, 8);
      if (c.length === 0) throw new JobError("Keep at least one check.");
      job.criteria = c;
    }
    if (patch.judgement) {
      job.judgement = patch.judgement.map((x) => x.trim()).filter(Boolean).slice(0, 5);
    }
    if (patch.role?.trim()) {
      job.role = patch.role.trim().slice(0, 40);
    }
    if (patch.skills) {
      const s = patch.skills.map((x) => x.trim()).filter(Boolean).slice(0, 6);
      if (s.length) job.skills = s;
    }
    if (typeof patch.waits === "boolean" && job.project && job.project.step > 1) {
      job.locked = patch.waits;
      ev(job, "You", patch.waits ? "This milestone now waits for the one before it." : "This milestone can now start right away.", "person");
    }
    if (patch.signer?.role?.trim()) {
      job.signer = { name: patch.signer.name.trim().slice(0, 60), role: patch.signer.role.trim().slice(0, 60) };
    }
    if (patch.priceCents !== undefined) {
      const p = patch.priceCents;
      if (!Number.isInteger(p) || p < 1000 || p > 1_000_000) throw new JobError("Price must be between $10 and $10,000.");
      job.priceCents = p;
      job.feeCents = feeFor(p);
    }
    if (patch.answer?.trim() && job.question) {
      const f = addFact(db, {
        section: "rules",
        text: `${job.question.replace(/\?$/, "")}: ${patch.answer.trim()}`,
        source: { kind: "client_answer", jobId: job.id },
        confirmed: true,
      });
      if (f && !job.factIds.includes(f.id)) job.factIds.push(f.id);
      ev(job, "You", `Answered: ${patch.answer.trim()}. Saved to the Brain so nobody asks again.`, "person");
      job.question = undefined;
    }
    return job;
  });
}

// ─── 2. hold the money in PayPal ─────────────────────────────────────────

function refuseLocked(job: Job) {
  if (job.locked) {
    throw new JobError(`Milestone ${job.project?.step} opens once milestone ${(job.project?.step ?? 2) - 1} is paid.`);
  }
}

/**
 * A later milestone goes straight to the expert who did the earlier ones,
 * so a project keeps one person steering it from start to finish.
 */
function onFunded(db: Db, job: Job) {
  if (!job.project || job.project.step === 1) return;
  // Only when the same role continues and the founder hasn't picked someone else.
  if (job.invites?.some((x) => x.status === "invited")) return;
  const prev = projectJobs(db, job).find((j) => j.project!.step === job.project!.step - 1);
  if (!prev?.doer || prev.role !== job.role) return;
  job.doer = prev.doer;
  job.payees = [{ name: prev.doer.name, email: prev.doer.email, amountCents: job.priceCents, role: "Lead" }];
  job.state = "taken";
  ev(job, "Engine", `${prev.doer.name} carries on from milestone ${prev.project!.step}. ${money(job.priceCents)} is held for them.`, "person");
}

export async function startFunding(id: string, origin: string): Promise<string> {
  const snapshot = getJob(read(), id);
  expect(snapshot, ["draft"], "fund");
  refuseLocked(snapshot);
  if (snapshot.paypal.approveUrl && snapshot.paypal.orderId) return snapshot.paypal.approveUrl;
  const hold = await paypal.createHold({
    jobId: snapshot.id,
    title: snapshot.title,
    totalCents: snapshot.priceCents + snapshot.feeCents,
    returnUrl: `${origin}/api/engine/jobs/${snapshot.id}/approved`,
    cancelUrl: `${origin}/app/jobs/${snapshot.id}?cancelled=1`,
    brand: read().company.name,
  });
  await write((db) => {
    const job = getJob(db, id);
    job.paypal.orderId = hold.orderId;
    job.paypal.approveUrl = hold.approveUrl;
    ev(job, "PayPal", `Checkout opened for ${money(job.priceCents + job.feeCents)}.`, "money");
  });
  return hold.approveUrl;
}

export async function confirmFunding(id: string, orderId: string): Promise<Job> {
  const snapshot = getJob(read(), id);
  if (snapshot.paypal.authorizationId) return snapshot; // a reload of the return page
  expect(snapshot, ["draft"], "confirm funding");
  if (snapshot.paypal.orderId !== orderId) throw new JobError("That PayPal order is not this job's.");
  const auth = await paypal.authorizeHold(id, orderId);
  const order = await paypal.getOrder(orderId).catch(() => null);
  const payer = (order as { payer?: { email_address?: string; name?: { given_name?: string } } } | null)?.payer;
  return write((db) => {
    const job = getJob(db, id);
    job.paypal.authorizationId = auth.authorizationId;
    job.paypal.authorizationExpires = auth.expires;
    job.paypal.clientEmail = payer?.email_address;
    job.paypal.clientName = payer?.name?.given_name;
    job.state = "funded";
    ev(job, "PayPal", `Holding ${money(job.priceCents + job.feeCents)}. Nothing is charged until the work passes review.`, "money");
    resolveNotices(db, "fund_next", job.id);
    onFunded(db, job);
    notice(db, {
      kind: "done",
      title: `${money(job.priceCents + job.feeCents)} held for "${job.title}"`,
      why: "The job is now open to freelancers and their agents.",
      action: "open_job",
      ref: job.id,
    });
    return job;
  });
}

export async function fundWithTestCard(id: string): Promise<Job> {
  const snapshot = getJob(read(), id);
  expect(snapshot, ["draft"], "fund");
  refuseLocked(snapshot);
  const hold = await paypal.createHoldWithTestCard({
    jobId: snapshot.id,
    title: snapshot.title,
    totalCents: snapshot.priceCents + snapshot.feeCents,
  });
  return write((db) => {
    const job = getJob(db, id);
    if (job.paypal.authorizationId) return job;
    job.paypal.orderId = hold.orderId;
    job.paypal.authorizationId = hold.authorizationId;
    job.paypal.authorizationExpires = hold.expires;
    job.paypal.clientName = "Sandbox client (test card)";
    job.state = "funded";
    ev(job, "PayPal", `Holding ${money(job.priceCents + job.feeCents)} on the sandbox test card. Nothing is charged until the work passes review.`, "money");
    resolveNotices(db, "fund_next", job.id);
    onFunded(db, job);
    return job;
  });
}

// ─── 3. a doer takes it ──────────────────────────────────────────────────

export async function takeJob(id: string, doer: { id: string; name: string; email: string }): Promise<Job> {
  return write((db) => {
    const job = getJob(db, id);
    expect(job, ["funded"], "take this job");
    if (!canSee(job, doer.id)) throw new JobError("This job is offered to the experts the founder invited.");
    for (const inv of job.invites ?? []) {
      if (inv.status === "invited") inv.status = inv.expertId === doer.id ? "accepted" : "closed";
    }
    job.doer = doer;
    job.payees = [{ name: doer.name, email: doer.email, amountCents: job.priceCents, role: "Lead" }];
    job.state = "taken";
    ev(job, doer.name, `Took the job. ${money(job.priceCents)} is held for them.`, "person");
    return job;
  });
}

/** Hand part of the job to someone else. Splits are integers that sum exactly. */
export async function addSubcontractor(
  id: string,
  by: string,
  sub: { name: string; email: string; amountCents: number; role: string },
): Promise<Job> {
  return write((db) => {
    const job = getJob(db, id);
    expect(job, ["taken", "changes"], "split the payment");
    if (job.doer?.id !== by) throw new JobError("Only the person on the job can split it.");
    const lead = job.payees[0];
    if (!Number.isInteger(sub.amountCents) || sub.amountCents <= 0 || sub.amountCents >= lead.amountCents) {
      throw new JobError("The split must be a positive amount smaller than the lead's share.");
    }
    if (job.payees.some((p) => p.email.toLowerCase() === sub.email.toLowerCase())) {
      throw new JobError("That person is already paid on this job.");
    }
    lead.amountCents -= sub.amountCents;
    job.payees.push(sub);
    ev(job, job.doer!.name, `Split ${money(sub.amountCents)} to ${sub.name} for ${sub.role}.`, "person");
    return job;
  });
}

export async function postUpdate(id: string, by: string, byName: string, text: string): Promise<Job> {
  return write((db) => {
    const job = getJob(db, id);
    if (job.doer?.id !== by) throw new JobError("Only the person on the job can post updates.");
    expect(job, ["taken", "changes"], "post an update");
    ev(job, byName, text.trim().slice(0, 1000), "person");
    return job;
  });
}

// ─── 4. submit and review ────────────────────────────────────────────────

export async function submitWork(
  id: string,
  by: string,
  input: { content: string; artefact?: string; notes?: string },
): Promise<Job> {
  const content = input.content?.trim() ?? "";
  if (content.length < 20) throw new JobError("Submit the work itself (at least a few sentences), not just a link.");
  const submission: Submission = {
    at: now(),
    by,
    content: content.slice(0, 30000),
    artefact: input.artefact?.slice(0, 500),
    notes: input.notes?.slice(0, 2000),
  };
  const job = await write((db) => {
    const j = getJob(db, id);
    if (j.doer?.id !== by) throw new JobError("Only the person on the job can submit it.");
    expect(j, ["taken", "changes"], "submit");
    j.submissions.push(submission);
    j.state = "in_review";
    ev(j, j.doer.name, `Submitted round ${j.submissions.length}.`, "person");
    return structuredClone(j);
  });

  let review;
  try {
    review = await reviewWork(read(), job, submission.content, submission.artefact);
  } catch (e) {
    await write((db) => {
      const j = getJob(db, id);
      // The round never got a verdict, so it does not count as a round.
      j.submissions.pop();
      j.state = j.submissions.length ? "changes" : "taken";
      ev(j, "Reviewer", `Review could not run (${shortError(e)}). Submit again.`, "ai");
    });
    throw new JobError("The review could not run. Try submitting again.");
  }

  return write((db) => {
    const j = getJob(db, id);
    const sub = j.submissions[j.submissions.length - 1];
    sub.review = review;
    const met = review.results.filter((r) => r.pass).length;
    builderRun(db, "reviewer", `${j.title}: ${met} of ${review.results.length} criteria met`, []);

    // The Librarian learns from what failed, so the next job starts smarter.
    for (const phrase of review.flaggedPhrases) {
      const p = phrase.toLowerCase().replace(/[^a-z0-9' -]/g, "").trim();
      const known = db.facts.some((x) => !x.retired && x.section === "avoid" && (x.text.toLowerCase().includes(p) || p.includes(x.text.toLowerCase().replace(/^avoid the words? /, "").replace(/['".]/g, "").trim())));
      if (!p || known) continue;
      const f = addFact(db, {
        section: "avoid",
        text: `"${phrase}"`,
        source: { kind: "review", jobId: j.id },
        confirmed: false,
      });
      if (f && !f.confirmed) {
        notice(db, {
          kind: "suggestion",
          title: `Add ${f.text} to words to avoid?`,
          why: `The Reviewer flagged it on "${j.title}". Future jobs will be told to avoid it.`,
          action: "confirm_fact",
          ref: f.id,
          builder: "Librarian",
        });
      }
    }
    if (review.flaggedPhrases.length) {
      builderRun(db, "librarian", `Proposed ${review.flaggedPhrases.length} words to avoid from a review`, ["brain.propose"]);
    }

    if (review.passed && (j.judgement?.length ?? 0) > 0) {
      // Layer two: a person decides taste, strategy and soundness. No timer
      // releases this money; only the sign-off does.
      j.state = "signoff";
      const who = j.signer?.name ? `${j.signer.name} (${j.signer.role})` : (j.signer?.role ?? "The founder");
      ev(j, "Reviewer", `All ${review.results.length} checks met. ${review.summary}`, "ai");
      ev(j, "Engine", `${who} now judges ${j.judgement.length} thing${j.judgement.length === 1 ? "" : "s"} only a person can. The money stays held until they sign off.`, "person");
      notice(db, {
        kind: "approval",
        title: `Sign off "${j.title}"`,
        why: `The AI checks all pass. You decide: ${j.judgement.join("; ")}.${review.genericSignals?.length ? ` The Reviewer flagged ${review.genericSignals.length} generic-sounding passage${review.genericSignals.length === 1 ? "" : "s"}.` : ""}`,
        action: "signoff",
        ref: j.id,
      });
    } else if (review.passed) {
      j.state = "passed";
      j.releaseAt = new Date(Date.now() + RELEASE_WINDOW_SECONDS * 1000).toISOString();
      ev(j, "Reviewer", `All ${review.results.length} criteria met. ${review.summary}`, "ai");
      ev(j, "Engine", `Payment releases in ${Math.round(RELEASE_WINDOW_SECONDS / 60)} minutes unless someone appeals.`, "money");
      notice(db, {
        kind: "approval",
        title: `Release ${money(j.priceCents)} to ${j.payees.map((p) => p.name).join(" and ")}`,
        why: `"${j.title}" passed all ${review.results.length} criteria. It releases on its own at the end of the appeal window.`,
        action: "release",
        ref: j.id,
      });
    } else {
      j.state = "changes";
      ev(j, "Reviewer", `${met} of ${review.results.length} criteria met. Notes sent back; the money stays held.`, "ai");
    }
    return j;
  });
}

// ─── 4b. a person signs off ──────────────────────────────────────────────

/**
 * The judgement layer. Approving releases the money straight away (the
 * person who could object is the one approving). Asking for changes sends
 * their note back to the expert and keeps the money held.
 */
export async function signOff(id: string, by: string, approved: boolean, note: string): Promise<Job> {
  const text = note.trim().slice(0, 2000);
  if (!approved && !text) throw new JobError("Say what needs to change, so the expert can act on it.");
  await write((db) => {
    const j = getJob(db, id);
    expect(j, ["signoff"], "sign off");
    const last = j.submissions[j.submissions.length - 1];
    if (!last?.review?.passed) throw new JobError("The AI checks have not passed yet.");
    last.signoff = { at: now(), by, approved, note: text || undefined };
    resolveNotices(db, "signoff", j.id);
    if (approved) {
      j.state = "passed";
      ev(j, by, `Signed off${text ? `: ${text}` : "."} Releasing the payment.`, "person");
    } else {
      j.state = "changes";
      ev(j, by, `Asked for changes: ${text}. The money stays held.`, "person");
    }
  });
  if (approved) return release(id, `${by}, on sign-off`);
  return getJob(read(), id);
}

// ─── 5. release and pay ──────────────────────────────────────────────────

/**
 * The only function that moves money. Idempotent at every step: a step that
 * already happened is skipped, and PayPal itself refuses a duplicate capture
 * (PayPal-Request-Id) and a duplicate payout batch (sender_batch_id).
 */
export async function release(id: string, by: string): Promise<Job> {
  // Claim the job first, so a second click or the auto-release sweep cannot
  // run a parallel release.
  const claimed = await write((db) => {
    const j = getJob(db, id);
    if (j.state === "paid") return null;
    expect(j, ["passed", "paying"], "release payment");
    if (!j.paypal.authorizationId) throw new JobError("No PayPal hold on this job.");
    const last = j.submissions[j.submissions.length - 1];
    if (!last?.review?.passed) throw new JobError("The latest review did not pass.");
    if ((j.judgement?.length ?? 0) > 0 && !last.signoff?.approved) {
      throw new JobError("A person has not signed off the judgement criteria yet.");
    }
    j.state = "paying";
    return structuredClone(j);
  });
  if (!claimed) return getJob(read(), id);

  try {
    if (!claimed.paypal.captureId) {
      const cap = await paypal.captureHold(claimed.id, claimed.paypal.authorizationId!, claimed.priceCents + claimed.feeCents);
      claimed.paypal.captureId = cap.captureId;
      await write((db) => {
        const j = getJob(db, id);
        j.paypal.captureId = cap.captureId;
        ev(j, "PayPal", `Captured ${money(j.priceCents + j.feeCents)} from the client (${by}).`, "money");
      });
    }
    if (!claimed.paypal.payoutBatchId) {
      const total = claimed.payees.reduce((n, p) => n + p.amountCents, 0);
      if (total !== claimed.priceCents) throw new JobError("Payee shares do not add up to the job price.");
      const po = await paypal.payout(
        claimed.id,
        claimed.title,
        claimed.payees.map((p, i) => ({
          email: p.email,
          amountCents: p.amountCents,
          itemId: `${claimed.id}-${i}`,
          note: `${p.role} on "${claimed.title}". Passed review on every criterion.`,
        })),
      );
      await write((db) => {
        const j = getJob(db, id);
        j.paypal.payoutBatchId = po.batchId;
        j.paypal.payoutStatus = po.status;
        ev(
          j,
          "PayPal",
          `Paid out ${j.payees.map((p) => `${money(p.amountCents)} to ${p.name}`).join(", ")}. Engine kept its ${money(j.feeCents)} fee.`,
          "money",
        );
      });
    }
  } catch (e) {
    await write((db) => {
      const j = getJob(db, id);
      j.state = "passed";
      ev(j, "PayPal", `Release stopped: ${e instanceof Error ? e.message : "error"}. Nothing was paid twice; try again.`, "money");
    });
    throw e instanceof JobError ? e : new JobError(e instanceof Error ? e.message : "PayPal error.");
  }

  const paid = await write((db) => {
    const j = getJob(db, id);
    j.state = "paid";
    resolveNotices(db, "release", j.id);
    notice(db, {
      kind: "done",
      title: `Paid ${j.payees.map((p) => p.name).join(" and ")} for "${j.title}"`,
      why: `${money(j.priceCents)} went out through PayPal Payouts. The Bookkeeper is writing the invoice.`,
      action: "open_job",
      ref: j.id,
    });
    // Open the next milestone. Its money is held only now, so a PayPal hold
    // never has to outlive the 29-day authorization window.
    const next = j.project ? projectJobs(db, j).find((x) => x.locked && x.project!.step > j.project!.step) : undefined;
    if (next?.locked) {
      next.locked = false;
      ev(next, "Engine", `Milestone ${j.project!.step} is paid. This one is ready to fund.`, "system");
      notice(db, {
        kind: "approval",
        title: `Fund milestone ${next.project!.step} of ${next.project!.of}: "${next.title}"`,
        why: `${j.doer?.name ?? "The expert"} finished milestone ${j.project!.step}. Holding ${money(next.priceCents + next.feeCents)} lets them carry on.`,
        action: "fund_next",
        ref: next.id,
      });
    }
    return structuredClone(j);
  });

  // Paperwork happens after the money, and its failure never undoes a payment.
  try {
    const co = read().company;
    const inv = await invoicePaidJob(paid, paid.paypal.clientEmail || co.ownerEmail || "client@example.com", co.name);
    await write((db) => {
      const j = getJob(db, id);
      if (inv.invoiceId) {
        j.paypal.invoiceId = inv.invoiceId;
        j.paypal.invoiceUrl = `https://www.sandbox.paypal.com/invoice/p/#${inv.invoiceId}`;
        ev(j, "Bookkeeper", `Invoice ${inv.invoiceId} created and marked paid (${inv.tools.join(", ")}).`, "ai");
      } else {
        ev(j, "Bookkeeper", inv.note, "ai");
      }
      builderRun(db, "bookkeeper", `Invoiced "${j.title}" via ${inv.via === "agent" ? "Gemini + Agent Toolkit" : "Agent Toolkit"}`, inv.tools, Boolean(inv.invoiceId));
      addFact(db, {
        section: "pricing",
        text: `${j.title}: paid ${money(j.priceCents)} to the freelancer, ${new Date().toISOString().slice(0, 10)}.`,
        source: { kind: "paypal", detail: j.paypal.captureId ?? "" },
        confirmed: true,
      });
    });
  } catch (e) {
    await write((db) => {
      builderRun(db, "bookkeeper", `Invoice failed: ${shortError(e)}`, [], false);
    });
  }
  return getJob(read(), id);
}

export async function appeal(id: string, by: string, reason: string): Promise<Job> {
  return write((db) => {
    const j = getJob(db, id);
    expect(j, ["passed", "changes"], "appeal");
    j.state = "appealed";
    j.releaseAt = undefined;
    resolveNotices(db, "release", j.id);
    ev(j, by, `Appealed: ${reason.trim().slice(0, 500) || "no reason given"}. A person decides; the money stays held.`, "person");
    notice(db, {
      kind: "approval",
      title: `Appeal on "${j.title}"`,
      why: reason.trim().slice(0, 200) || "Someone disagrees with the review.",
      action: "open_job",
      ref: j.id,
    });
    return j;
  });
}

/** A person settles an appeal: back to the doer, or release. */
export async function settleAppeal(id: string, outcome: "release" | "changes"): Promise<Job> {
  await write((db) => {
    const j = getJob(db, id);
    expect(j, ["appealed"], "settle the appeal");
    if (outcome === "release") {
      const last = j.submissions[j.submissions.length - 1];
      if (last?.review) last.review.passed = true;
      if (last) last.signoff = { at: now(), by: "You, settling an appeal", approved: true };
      j.state = "passed";
      ev(j, "You", "Settled the appeal: release the payment.", "person");
    } else {
      j.state = "changes";
      ev(j, "You", "Settled the appeal: the work needs changes.", "person");
    }
    resolveNotices(db, "open_job", j.id);
  });
  if (outcome === "release") return release(id, "you, after an appeal");
  return getJob(read(), id);
}

export async function cancelJob(id: string): Promise<Job> {
  const j0 = getJob(read(), id);
  expect(j0, ["draft", "funded", "changes", "appealed", "signoff"], "cancel");
  if (j0.paypal.authorizationId) await paypal.voidHold(id, j0.paypal.authorizationId);
  return write((db) => {
    const j = getJob(db, id);
    j.state = "cancelled";
    ev(j, "You", j0.paypal.authorizationId ? "Cancelled. PayPal released the hold back to the client." : "Cancelled.", "money");
    return j;
  });
}

/** Releases passed jobs whose appeal window has ended. Safe to call often. */
export async function sweep(): Promise<string[]> {
  const due = read().jobs.filter((j) => j.state === "passed" && j.releaseAt && Date.parse(j.releaseAt) <= Date.now());
  const done: string[] = [];
  for (const j of due) {
    try {
      await release(j.id, "auto-release after the appeal window");
      done.push(j.id);
    } catch {
      /* logged on the job */
    }
  }
  return done;
}

export { DEMO_DOER };
