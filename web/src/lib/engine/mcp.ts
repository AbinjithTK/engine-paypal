import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { chunksById, factsById } from "./brain";
import { searchBrain } from "./search";
import { now, read, write } from "./db";
import * as jobs from "./jobs";
import { dollars } from "./paypal";
import { DEMO_DOER } from "./seed";
import type { Job } from "./types";

/**
 * Engine's MCP server, for a freelancer's own AI agent (Claude Code, Kiro,
 * Cursor). The agent finds funded work, reads a brief and a Brain slice
 * scoped to that one job, does the work, and submits it for review.
 *
 * Rules that hold for every call:
 *  1. SCOPE. An agent sees open funded jobs and its own jobs, nothing else,
 *     and only the Brain facts chosen for that job. Private facts never leave.
 *  2. NO MONEY TOOLS. Nothing here captures, pays or refunds. A passing review
 *     starts the appeal window; release happens in jobs.release(), in code.
 *  3. EVERY CALL IS LOGGED, allowed or refused, and the founder can read it.
 */

export type Session = { id: string; name: string; email: string };

/**
 * Every expert has their own key. It is an HMAC of their id, signed with
 * ENGINE_DOER_TOKEN, so Engine stores no key and one expert's key can't be
 * turned into another's. The signing secret itself is never shown anywhere.
 */
function signingSecret(): string | null {
  return (
    process.env.ENGINE_DOER_TOKEN ||
    (process.env.NODE_ENV !== "production" ? "priya-dev-token" : null)
  );
}

function sign(expertId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`engine-expert:${expertId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function tokenForExpert(expertId: string): string | null {
  const secret = signingSecret();
  if (!secret) return null;
  return `eng_${Buffer.from(expertId).toString("base64url")}_${sign(expertId, secret)}`;
}

export function sessionFor(token: string | null): Session | null {
  if (!token) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const db = read();
  const m = /^eng_([A-Za-z0-9_-]+)_([A-Za-z0-9_-]{32})$/.exec(token);
  if (m) {
    const id = Buffer.from(m[1], "base64url").toString();
    const want = Buffer.from(sign(id, secret));
    const got = Buffer.from(m[2]);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const e = db.experts.find((x) => x.id === id);
    return e ? { id: e.id, name: e.name, email: e.email } : null;
  }
  // Older setups handed out the shared secret as Priya's key. It still works for her.
  if (token === secret) {
    const e = db.experts.find((x) => x.id === DEMO_DOER.id);
    return e
      ? { id: e.id, name: e.name, email: e.email }
      : { id: DEMO_DOER.id, name: DEMO_DOER.name, email: DEMO_DOER.email };
  }
  return null;
}

/** Work the owner has handed this expert: jobs they are on, and funded jobs they are invited to. */
export function handedTo(db: ReturnType<typeof read>, expertId: string): Job[] {
  return db.jobs.filter(
    (j) =>
      (j.doer?.id === expertId && !["paid", "cancelled"].includes(j.state)) ||
      (j.state === "funded" &&
        !j.doer &&
        (j.invites ?? []).some(
          (x) => x.expertId === expertId && x.status === "invited",
        )),
  );
}

const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });

export const TOOLS = [
  {
    name: "whoami",
    description: "Who this token belongs to and where you get paid.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "open_jobs",
    description:
      "Funded jobs nobody has taken. The money for each is already held in PayPal.",
    inputSchema: {
      type: "object",
      properties: { skill: S("Optional skill filter, e.g. 'copy'.") },
    },
  },
  {
    name: "my_jobs",
    description:
      "Work handed to you: jobs you are on and jobs you are invited to, with their state.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "take_job",
    description:
      "Take a funded job. You are paid through PayPal Payouts when it passes review.",
    inputSchema: {
      type: "object",
      properties: { job_id: S("The job id.") },
      required: ["job_id"],
    },
  },
  {
    name: "get_brief",
    description:
      "The brief, every acceptance criterion the Reviewer will check, the pay, and the company facts this job may use. Everything needed to start without asking.",
    inputSchema: {
      type: "object",
      properties: { job_id: S("The job id.") },
      required: ["job_id"],
    },
  },
  {
    name: "search_brain",
    description:
      "Search the company's documents (uploads, repo docs, website) for something the brief doesn't cover. Only shareable documents are searched; private ones never are.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: S("The job id you are on."),
        query: S("What to look for, in plain words."),
      },
      required: ["job_id", "query"],
    },
  },
  {
    name: "ask_question",
    description:
      "Ask the company something the brief and facts don't answer. The founder is asked once and the answer joins the Brain.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: S("The job id."),
        question: S("One clear question."),
      },
      required: ["job_id", "question"],
    },
  },
  {
    name: "post_update",
    description: "A short progress note the client sees on their live view.",
    inputSchema: {
      type: "object",
      properties: { job_id: S("The job id."), text: S("The update.") },
      required: ["job_id", "text"],
    },
  },
  {
    name: "split_payment",
    description:
      "Give part of your pay to someone who helped (a subcontractor). Paid in the same PayPal payout.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: S("The job id."),
        name: S("Their name."),
        email: S("Their PayPal email."),
        amount_usd: N("Whole US dollars, taken from your share."),
        role: S("What they did."),
      },
      required: ["job_id", "name", "email", "amount_usd", "role"],
    },
  },
  {
    name: "submit_work",
    description:
      "Submit the finished work itself (the text, or the full file contents). The Reviewer checks it against every criterion right away and returns the result. On a pass, payment releases after a short appeal window.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: S("The job id."),
        content: S("The deliverable itself, in full."),
        artefact: S("Optional link to where it lives (PR, file, page)."),
        notes: S("Optional notes for the reviewer."),
      },
      required: ["job_id", "content"],
    },
  },
  {
    name: "job_status",
    description:
      "Where a job is: review results, money held or released, payout status.",
    inputSchema: {
      type: "object",
      properties: { job_id: S("The job id.") },
      required: ["job_id"],
    },
  },
] as const;

export type ToolResult = { text: string; isError?: boolean };

/** A passage quoted inside a brief: its own headings must not break the brief's structure. */
function quote(title: string, text: string): string {
  return `> From "${title}"\n${text
    .split("\n")
    .map((l) => `> ${l.replace(/^#+\s*/, "")}`)
    .join("\n")}`;
}

function usd(c: number) {
  return `$${dollars(c)}`;
}

async function log(
  actor: string,
  tool: string,
  target: string | undefined,
  allowed: boolean,
  note?: string,
) {
  await write((db) => {
    db.access.unshift({ at: now(), actor, tool, target, allowed, note });
    if (db.access.length > 500) db.access.length = 500;
  });
}

function visible(job: Job | undefined, s: Session): boolean {
  return Boolean(job && jobs.canSee(job, s.id));
}

function reviewText(job: Job): string {
  const last = job.submissions[job.submissions.length - 1];
  const r = last?.review;
  if (!r) return "Not reviewed yet.";
  const lines = r.results.map(
    (x, i) =>
      `${x.pass ? "PASS" : "FAIL"} ${i + 1}. ${x.criterion}\n     ${x.reason}`,
  );
  const generic = r.genericSignals?.length
    ? `\n\nReads as generic, worth rewriting in your own voice:\n${r.genericSignals.map((g) => `- "${g}"`).join("\n")}`
    : "";
  const so = last.signoff
    ? `\n\n${last.signoff.approved ? "SIGNED OFF" : "CHANGES ASKED"} by ${last.signoff.by}${last.signoff.note ? `: ${last.signoff.note}` : "."}`
    : "";
  return `${r.results.filter((x) => x.pass).length} of ${r.results.length} checks met.\n${lines.join("\n")}\n\n${r.summary}${generic}${so}`;
}

export function briefText(db: ReturnType<typeof read>, j: Job): string {
  const facts = factsById(db, j.factIds);
  const passages = chunksById(db, j.chunkIds ?? []);
  const connectors = db.connectors.filter((c) =>
    j.connectorIds?.includes(c.id),
  );
  const skills = db.skills.filter((s) => j.skillIds?.includes(s.id));
  const gaps = db.gaps.filter((g) => g.jobId === j.id && g.answer);
  return [
    `# ${j.title}`,
    "",
    j.brief,
    "",
    ...(j.project
      ? [
          `Milestone ${j.project.step} of ${j.project.of} in "${j.project.title}". Each milestone is held and paid on its own.`,
          "",
        ]
      : []),
    "## Checks (Engine's AI verifies each one)",
    ...j.criteria.map((c, i) => `${i + 1}. ${c}`),
    "",
    ...((j.judgement?.length ?? 0) > 0
      ? [
          `## Judgement (${j.signer?.name || j.signer?.role || "the founder"} decides; you are the expert, so steer toward these)`,
          ...j.judgement.map((c, i) => `${i + 1}. ${c}`),
          "",
        ]
      : []),
    `## Pay`,
    `${usd(j.priceCents)}, held in PayPal now, paid out on a passing review. ${j.state === "funded" ? "Call take_job to claim it." : ""}`,
    "",
    `## Company facts for this job (${facts.length} shared; the rest of the company is not)`,
    ...facts.map((f) => `- [${f.section}] ${f.text}`),
    ...gaps.map((g) => `- [answered] ${g.question} ${g.answer}`),
    ...(skills.length
      ? [
          "",
          "## How this company wants it done (its own playbooks; follow them)",
          ...skills.map((s) => `### ${s.name}\n${s.body}`),
        ]
      : []),
    ...(connectors.length
      ? [
          "",
          "## Tools and services this job uses",
          ...connectors.map(
            (c) =>
              `- ${c.name} (${c.kind})${c.url ? `: ${c.url}` : ""}. ${c.purpose}`,
          ),
        ]
      : []),
    ...(passages.length
      ? [
          "",
          `## From the company's documents (${passages.length} passages; call search_brain for more)`,
          ...passages.map((c) => quote(c.title, c.text)),
        ]
      : []),
  ].join("\n");
}

export async function callTool(
  s: Session,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const jobId = typeof args.job_id === "string" ? args.job_id : undefined;
  if (!TOOLS.some((t) => t.name === name)) {
    await log(s.name, name, jobId, false, "unknown tool");
    return { text: `No tool called "${name}".`, isError: true };
  }
  const db = read();
  const job = jobId ? db.jobs.find((j) => j.id === jobId) : undefined;
  const needsJob = !["whoami", "open_jobs", "my_jobs"].includes(name);
  if (needsJob && !jobId) {
    await log(s.name, name, undefined, false, "missing job_id");
    return { text: `${name} needs a job_id.`, isError: true };
  }
  if (jobId && name !== "take_job" && !visible(job, s)) {
    await log(s.name, name, jobId, false, "outside scope");
    return {
      text: `You can't reach ${jobId}. You see funded open jobs and your own jobs only.`,
      isError: true,
    };
  }
  await log(s.name, name, jobId, true);

  try {
    switch (name) {
      case "whoami":
        return {
          text: `${s.name}. Payouts go to ${s.email} through PayPal. Engine charges freelancers 0%.`,
        };

      case "open_jobs": {
        const skill =
          typeof args.skill === "string" ? args.skill.toLowerCase() : "";
        const rows = db.jobs.filter(
          (j) =>
            j.state === "funded" &&
            jobs.canSee(j, s.id) &&
            (!skill ||
              j.skills.some((k) => k.toLowerCase().includes(skill)) ||
              j.title.toLowerCase().includes(skill)),
        );
        if (!rows.length)
          return { text: "No funded jobs open to you right now." };
        return {
          text: rows
            .map((j) => {
              const inv = j.invites?.find(
                (x) => x.expertId === s.id && x.status === "invited",
              );
              return (
                `${j.id} · ${j.title}${j.role ? ` (${j.role})` : ""}${inv ? " · YOU WERE INVITED" : ""}\n` +
                `  Pays ${usd(j.priceCents)} (held in PayPal) · ${j.criteria.length} checks · ${j.skills.join(", ")}` +
                (inv ? `\n  Why you: ${inv.reason}` : "")
              );
            })
            .join("\n\n"),
        };
      }

      case "my_jobs": {
        const rows = handedTo(db, s.id);
        if (!rows.length)
          return { text: "Nothing handed to you right now. Try open_jobs." };
        return {
          text: rows
            .map(
              (j) =>
                `${j.id} · ${j.title} · ${j.doer?.id === s.id ? j.state : "invited, call take_job to accept"} · ${usd(j.priceCents)}`,
            )
            .join("\n"),
        };
      }

      case "take_job": {
        if (!job) return { text: "No such job.", isError: true };
        const j = await jobs.takeJob(job.id, s);
        return {
          text: `It's yours: ${j.title}, paying ${usd(j.priceCents)}, already held in PayPal.\nCall get_brief next.`,
        };
      }

      case "get_brief":
        return { text: briefText(db, job!) };

      case "search_brain": {
        if (job!.doer?.id !== s.id)
          return {
            text: "Take the job first; then you can search the company's documents.",
            isError: true,
          };
        const q = String(args.query ?? "")
          .trim()
          .slice(0, 300);
        if (!q) return { text: "Give a query.", isError: true };
        const r = await searchBrain(db, q, { k: 5 });
        if (!r.chunks.length)
          return {
            text: "Nothing in the company's shareable documents matches. Try ask_question.",
          };
        return {
          text:
            r.chunks
              .map((c) => quote(c.chunk.title, c.chunk.text))
              .join("\n\n") +
            `\n\n(searched ${r.via}${r.fellBack ? ", Elastic unavailable" : ""})`,
        };
      }

      case "ask_question": {
        await jobs.askQuestion(job!.id, s, String(args.question ?? ""));
        return {
          text: "Asked. The founder sees it on their Today screen; call get_brief later for the answer.",
        };
      }

      case "post_update": {
        await jobs.postUpdate(job!.id, s.id, s.name, String(args.text ?? ""));
        return { text: "Posted to the client's live view." };
      }

      case "split_payment": {
        const amt = Number(args.amount_usd);
        if (!Number.isFinite(amt) || amt <= 0 || Math.round(amt) !== amt)
          return {
            text: "amount_usd must be a whole number of dollars.",
            isError: true,
          };
        const email = String(args.email ?? "").trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return { text: "Give a valid PayPal email.", isError: true };
        const j = await jobs.addSubcontractor(job!.id, s.id, {
          name:
            String(args.name ?? "")
              .trim()
              .slice(0, 60) || "Helper",
          email,
          amountCents: amt * 100,
          role:
            String(args.role ?? "")
              .trim()
              .slice(0, 80) || "Helped",
        });
        return {
          text: `Split saved. Payout on pass: ${j.payees.map((p) => `${p.name} ${usd(p.amountCents)}`).join(", ")}.`,
        };
      }

      case "submit_work": {
        const j = await jobs.submitWork(job!.id, s.id, {
          content: String(args.content ?? ""),
          artefact:
            typeof args.artefact === "string" ? args.artefact : undefined,
          notes: typeof args.notes === "string" ? args.notes : undefined,
        });
        const head =
          j.state === "signoff"
            ? `CHECKS PASSED. ${j.signer?.name || j.signer?.role || "The founder"} now judges the work. ${usd(j.priceCents)} is paid when they sign off; call job_status to see their decision.`
            : j.state === "passed"
              ? `PASSED. ${usd(j.priceCents)} releases through PayPal at ${new Date(j.releaseAt!).toUTCString()} unless someone appeals.`
              : "CHANGES NEEDED. The money stays held. Fix what failed and call submit_work again.";
        return { text: `${head}\n\n${reviewText(j)}` };
      }

      case "job_status": {
        const j = job!;
        const money =
          j.state === "paid"
            ? `Paid. PayPal payout batch ${j.paypal.payoutBatchId} (${j.paypal.payoutStatus ?? "sent"}).`
            : j.paypal.authorizationId
              ? `${usd(j.priceCents + j.feeCents)} held in PayPal.`
              : "Not funded yet.";
        return { text: `${j.title}: ${j.state}\n${money}\n\n${reviewText(j)}` };
      }
    }
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), isError: true };
  }
  return { text: "Not implemented.", isError: true };
}

export const INSTRUCTIONS =
  "Engine pays freelancers through PayPal for work an AI reviewer has checked. Start with open_jobs, take_job, then get_brief. " +
  "The brief lists every acceptance criterion: plan against each one, use the company facts (especially words to avoid), " +
  "then submit_work with the full deliverable. If something essential is missing, ask_question. " +
  "No tool here moves money; payment follows a passing review.";

// ─── Context the owner hands over ─────────────────────────────────────────
//
// When the owner invites an expert or the expert takes a job, that job's
// brief, its Brain facts, its document passages, its playbooks and its tools
// appear in the expert's MCP context as resources, plus a ready prompt to
// start. Nothing is copied: each read is built from the job as it is now, so
// an answered question or a new fact shows up on the next read.

type Resource = {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
};

const URI = (jobId: string, part: string) => `engine://jobs/${jobId}/${part}`;

export function resourcesFor(s: Session): Resource[] {
  const db = read();
  const out: Resource[] = [];
  for (const j of handedTo(db, s.id)) {
    const who = j.doer?.id === s.id ? "on it" : "invited";
    out.push({
      uri: URI(j.id, "brief"),
      name: `${j.id}-brief`,
      title: `${j.title}: brief and checks`,
      description: `${who} · pays ${usd(j.priceCents)}, held in PayPal. Everything the Reviewer will check.`,
      mimeType: "text/markdown",
    });
    const facts = factsById(db, j.factIds);
    if (facts.length)
      out.push({
        uri: URI(j.id, "facts"),
        name: `${j.id}-facts`,
        title: `${j.title}: company facts (${facts.length})`,
        description: "Only the Company Brain facts chosen for this job.",
        mimeType: "text/markdown",
      });
    for (const sk of db.skills.filter((x) => j.skillIds?.includes(x.id)))
      out.push({
        uri: URI(j.id, `playbook/${sk.id}`),
        name: `${j.id}-playbook-${sk.id}`,
        title: `Playbook: ${sk.name}`,
        description: "How this company wants this kind of work done.",
        mimeType: "text/markdown",
      });
    const cons = db.connectors.filter((c) => j.connectorIds?.includes(c.id));
    if (cons.length)
      out.push({
        uri: URI(j.id, "tools"),
        name: `${j.id}-tools`,
        title: `${j.title}: tools and services (${cons.length})`,
        description: cons.map((c) => c.name).join(", "),
        mimeType: "text/markdown",
      });
    const passages = chunksById(db, j.chunkIds ?? []);
    if (passages.length)
      out.push({
        uri: URI(j.id, "documents"),
        name: `${j.id}-documents`,
        title: `${j.title}: document passages (${passages.length})`,
        description:
          "Passages from the company's shareable documents, picked for this job.",
        mimeType: "text/markdown",
      });
  }
  return out;
}

export async function readResource(
  s: Session,
  uri: string,
): Promise<{ uri: string; mimeType: string; text: string } | null> {
  const m = /^engine:\/\/jobs\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) return null;
  const db = read();
  const j = handedTo(db, s.id).find((x) => x.id === m[1]);
  if (!j) {
    await log(
      s.name,
      "resources/read",
      m[1],
      false,
      "not handed to this expert",
    );
    return null;
  }
  await log(s.name, "resources/read", j.id, true, m[2]);
  const md = (text: string) => ({ uri, mimeType: "text/markdown", text });
  if (m[2] === "brief") return md(briefText(db, j));
  if (m[2] === "facts")
    return md(
      factsById(db, j.factIds)
        .map((f) => `- [${f.section}] ${f.text}`)
        .join("\n"),
    );
  if (m[2] === "tools")
    return md(
      db.connectors
        .filter((c) => j.connectorIds?.includes(c.id))
        .map(
          (c) =>
            `## ${c.name} (${c.kind})\n${c.purpose}${c.url ? `\n${c.url}` : ""}`,
        )
        .join("\n\n"),
    );
  if (m[2] === "documents")
    return md(
      chunksById(db, j.chunkIds ?? [])
        .map((c) => quote(c.title, c.text))
        .join("\n\n"),
    );
  const pb = /^playbook\/(.+)$/.exec(m[2]);
  if (pb) {
    const sk = db.skills.find(
      (x) => x.id === pb[1] && j.skillIds?.includes(x.id),
    );
    return sk ? md(`# ${sk.name}\n\n${sk.body}`) : null;
  }
  return null;
}

export function promptsFor(s: Session) {
  return handedTo(read(), s.id).map((j) => ({
    name: `start_${j.id}`,
    title: `Start: ${j.title}`,
    description: `${j.role ?? "The job"} for ${read().company.name}, paying ${usd(j.priceCents)}.`,
  }));
}

export function promptFor(s: Session, name: string) {
  const id = name.replace(/^start_/, "");
  const j = handedTo(read(), s.id).find((x) => x.id === id);
  if (!j) return null;
  const take =
    j.doer?.id === s.id
      ? ""
      : `First call take_job with job_id ${j.id} to accept it. `;
  return {
    description: `Start ${j.title}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `${take}Read the brief below, plan against every check, and use the company facts and playbooks. ` +
            `If something essential is missing, call ask_question. When it's done, call submit_work with job_id ${j.id} and the full deliverable.\n\n` +
            briefText(read(), j),
        },
      },
    ],
  };
}

/** The welcome an agent sees on connect, naming the work already handed over. */
export function instructionsFor(s: Session | null): string {
  if (!s) return INSTRUCTIONS;
  const jobs = handedTo(read(), s.id);
  if (!jobs.length)
    return `You are connected as ${s.name}. Nothing is handed to you yet. ${INSTRUCTIONS}`;
  return (
    `You are connected as ${s.name}. Handed to you: ` +
    jobs
      .map(
        (j) =>
          `${j.title} (${j.id}, ${j.doer?.id === s.id ? j.state : "invited"})`,
      )
      .join("; ") +
    `. Each one's brief, facts, playbooks and tools are in your resources, and a start_<job id> prompt is ready. ${INSTRUCTIONS}`
  );
}
