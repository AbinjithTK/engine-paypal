import "server-only";

import { liveFacts } from "./brain";
import { recentTransactions } from "./bookkeeper";
import { now, read, write } from "./db";
import { json } from "./gemini";
import { notice } from "./jobs";
import type { Builder, BuilderResources } from "./types";

/**
 * Builders that run on a schedule or on demand. Each returns a one-line
 * summary for its run history. None of them can move money.
 */

function logRun(b: Builder, summary: string, tools: string[], ok = true) {
  b.runs.unshift({ at: now(), summary, ok, tools });
  if (b.runs.length > 30) b.runs.length = 30;
}

/** Scout: the forward-deployed engineer. Suggests the next builder worth adding. */
async function runScout(): Promise<string> {
  const db = read();
  const existing = db.builders.map((b) => `${b.name}: ${b.job}`).join("\n");
  const jobs = db.jobs.slice(0, 20).map((j) => `${j.title} (${j.state}, $${j.priceCents / 100}, ${j.submissions.length} rounds)`).join("\n");
  const facts = liveFacts(db).filter((f) => f.section !== "private").map((f) => `(${f.section}) ${f.text}`).join("\n");
  let tx: { amount: string; note: string; date: string }[] = [];
  try {
    tx = (await recentTransactions()).slice(0, 40);
  } catch {
    /* PayPal reading is optional for a suggestion */
  }
  const r = await json<{
    name: string;
    building: string;
    job: string;
    why_now: string;
    schedule: string;
    tools: string[];
    hours_saved_per_month: number;
    risk: "low" | "medium" | "high";
    dont_use_ai: boolean;
  }>({
    system:
      "You are Scout, a forward-deployed engineer for a one-person company. Look at how the company actually runs and suggest " +
      "the ONE new AI builder most worth adding next, specific to this company (not generic). Ground 'why_now' in the data shown, " +
      "with a concrete number where the data has one. If a plain schedule or rule would do better than AI, set dont_use_ai=true and say so. " +
      "It must not move money. Tools are named like paypal.list_invoices, paypal.send_invoice_reminder, brain.read, email.draft.",
    prompt: `Company: ${db.company.name}\n\nExisting builders:\n${existing}\n\nRecent jobs:\n${jobs || "(none)"}\n\nRecent PayPal transactions:\n${
      tx.map((t) => `${t.date} ${t.amount} ${t.note}`).join("\n") || "(none)"
    }\n\nBrain:\n${facts || "(empty)"}`,
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        building: { type: "string", enum: ["Money", "Jobs", "Company Brain", "Questions", "Taxes", "Sales", "Ideas"] },
        job: { type: "string" },
        why_now: { type: "string" },
        schedule: { type: "string" },
        tools: { type: "array", items: { type: "string" } },
        hours_saved_per_month: { type: "number" },
        risk: { type: "string", enum: ["low", "medium", "high"] },
        dont_use_ai: { type: "boolean" },
      },
      required: ["name", "building", "job", "why_now", "schedule", "tools", "hours_saved_per_month", "risk", "dont_use_ai"],
    },
  });
  await write((d) => {
    const id = `proposed_${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`;
    d.notices.unshift({
      id: `note_${id}_${Date.now().toString(36)}`,
      kind: "suggestion",
      title: r.dont_use_ai ? `Skip AI for ${r.name.toLowerCase()}: use a plain schedule` : `Add a builder: ${r.name}`,
      why: `${r.why_now} About ${Math.round(r.hours_saved_per_month)} hours a month, risk ${r.risk}. It would ${r.job.charAt(0).toLowerCase()}${r.job.slice(1)}`,
      action: "build_agent",
      ref: JSON.stringify({ id, name: r.name, building: r.building, job: r.job, schedule: r.schedule, tools: r.tools.slice(0, 6) }),
      builder: "Scout",
      createdAt: now(),
    });
    const s = d.builders.find((b) => b.id === "scout");
    if (s) logRun(s, `Suggested "${r.name}" (${r.risk} risk)`, ["brain.read", "paypal.list_transactions"]);
  });
  const work = await suggestWork(tx);
  return `Suggested ${r.name}${work ? ` and ${work} piece${work === 1 ? "" : "s"} of work` : ""}`;
}

/**
 * Scout's second job: find work the company needs for its operations and
 * growth, grounded in what the Brain and PayPal show. Each idea becomes a
 * card; "Scope it" turns it into a priced, staffed job. Nothing is posted
 * or funded without the founder.
 */
async function suggestWork(tx: { amount: string; note: string; date: string }[]): Promise<number> {
  const db = read();
  const facts = liveFacts(db).filter((f) => f.section !== "private").map((f) => `(${f.section}) ${f.text}`).join("\n");
  const docs = db.docs.filter((d) => !d.private).map((d) => d.title).slice(0, 20).join("; ");
  const done = db.jobs.map((j) => `${j.title} (${j.state})`).slice(0, 30).join("\n");
  const open = db.notices.filter((n) => !n.resolved && n.action === "post_job").map((n) => n.title).join("\n");
  const r = await json<{ ideas: { title: string; request: string; why: string; area: string; est_usd: number }[] }>({
    system:
      "You are Scout, looking after a one-person or small-team company. Find at most 2 pieces of work an outside human expert could do now " +
      "that would most improve how the company runs or grows. Ground every idea in something specific in the data (a gap in the Brain, a fact, " +
      "a past job's outcome, a pattern in PayPal sales), and say what in 'why', with a number where the data has one. " +
      "Don't repeat work already done, in progress or already suggested. 'request' is written as the founder would post it, in plain words. " +
      "'area' is one of: sales, marketing, operations, finance, legal, product, design.",
    prompt:
      `Company: ${db.company.name}\n\nBrain:\n${facts || "(empty)"}\n\nDocuments: ${docs || "(none)"}\n\nWork so far:\n${done || "(none)"}\n\n` +
      `Already suggested:\n${open || "(none)"}\n\nRecent PayPal transactions:\n${tx.map((t) => `${t.date} ${t.amount} ${t.note}`).join("\n") || "(none)"}`,
    schema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              request: { type: "string" },
              why: { type: "string" },
              area: { type: "string" },
              est_usd: { type: "number" },
            },
            required: ["title", "request", "why", "area", "est_usd"],
          },
        },
      },
      required: ["ideas"],
    },
  });
  const ideas = r.ideas.slice(0, 2).filter((i) => i.request?.trim().length > 10);
  await write((d) => {
    for (const i of ideas) {
      d.notices.unshift({
        id: `note_work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        kind: "suggestion",
        title: `Worth getting done: ${i.title.trim().slice(0, 90)}`,
        why: `${i.why.trim()} ${i.area ? `(${i.area}, ` : "("}about $${Math.max(0, Math.round(i.est_usd))})`,
        action: "post_job",
        ref: i.request.trim().slice(0, 1500),
        builder: "Scout",
        createdAt: now(),
      });
    }
    const s = d.builders.find((b) => b.id === "scout");
    if (s && ideas.length) logRun(s, `Found ${ideas.length} piece${ideas.length === 1 ? "" : "s"} of work worth doing`, ["brain.read", "jobs.read", "paypal.list_transactions"]);
  });
  return ideas.length;
}

/** Bookkeeper's daily pass: read PayPal sales so the Brain knows what money moved. */
async function runBookkeeper(): Promise<string> {
  const tx = await recentTransactions();
  await write((d) => {
    const b = d.builders.find((x) => x.id === "bookkeeper");
    const incoming = tx.filter((t) => Number(t.amount) > 0).reduce((n, t) => n + Number(t.amount), 0);
    const outgoing = tx.filter((t) => Number(t.amount) < 0).reduce((n, t) => n + Number(t.amount), 0);
    if (b) logRun(b, `Read ${tx.length} PayPal transactions: $${incoming.toFixed(2)} in, $${Math.abs(outgoing).toFixed(2)} out in 30 days`, ["paypal.list_transactions"]);
  });
  return `Read ${tx.length} transactions`;
}

/** Librarian's weekly pass: surface conflicts and unconfirmed facts. */
async function runLibrarian(): Promise<string> {
  return write((d) => {
    const conflicts = d.facts.filter((f) => f.conflictsWith && !f.retired);
    const unconfirmed = d.facts.filter((f) => !f.confirmed && !f.retired && !f.conflictsWith);
    for (const f of conflicts) {
      const other = d.facts.find((x) => x.id === f.conflictsWith);
      notice(d, {
        kind: "approval",
        title: "Two facts disagree. Which is right?",
        why: `"${f.text}" vs "${other?.text ?? "an older fact"}"`,
        action: "resolve_conflict",
        ref: f.id,
        builder: "Librarian",
      });
    }
    const b = d.builders.find((x) => x.id === "librarian");
    const s = `${conflicts.length} conflicts and ${unconfirmed.length} unconfirmed facts need you`;
    if (b) logRun(b, s, ["brain.read"]);
    return s;
  });
}

/** Builders that Engine runs on its own triggers, not on "Run now". */
const EVENT_BUILDERS = new Set(["scoper", "reviewer"]);

/** The tools a builder's resources amount to, for its card and its run log. */
export function toolsFor(r: BuilderResources): string[] {
  return [
    ...(r.sections.length ? ["brain.read"] : []),
    ...(r.docIds.length ? ["documents.read"] : []),
    ...(r.skillIds.length ? ["playbooks.read"] : []),
    ...(r.connectorIds.length ? ["connectors.read"] : []),
    ...(r.paypalSales ? ["paypal.list_transactions"] : []),
  ];
}

/**
 * Any builder the owner made, or added from Scout. It reads exactly the
 * resources it was given, and its only output is suggestions on Home.
 * It has no tool that posts, funds, pays or sends anything.
 */
async function runCustom(b: Builder): Promise<string> {
  const db = read();
  const r: BuilderResources = b.resources ?? { sections: ["company", "customers", "offer", "voice", "avoid"], docIds: [], connectorIds: [], skillIds: [], paypalSales: false };
  const facts = liveFacts(db)
    .filter((f) => f.section !== "private" && r.sections.includes(f.section))
    .map((f) => `(${f.section}) ${f.text}`);
  const docs = db.docs.filter((d) => !d.private && r.docIds.includes(d.id));
  const passages = db.chunks.filter((c) => !c.private && docs.some((d) => d.id === c.docId)).slice(0, 24);
  const skills = db.skills.filter((s) => r.skillIds.includes(s.id));
  const connectors = db.connectors.filter((c) => r.connectorIds.includes(c.id));
  let tx: { amount: string; note: string; date: string }[] = [];
  if (r.paypalSales) {
    try {
      tx = (await recentTransactions()).slice(0, 40);
    } catch {
      /* the run still goes ahead without sales */
    }
  }
  const out = await json<{ summary: string; suggestions: { title: string; detail: string }[] }>({
    system:
      `You are ${b.name}, a builder for a small company. Your job: ${b.job}\n` +
      "Work only from the material given. Return at most 3 suggestions the owner can act on, each specific and grounded in that material, " +
      "with a number where the material has one. If nothing needs the owner, return none. You cannot post work, pay, or send anything; " +
      "the owner decides. 'summary' is one plain sentence about what you found.",
    prompt: [
      `Company: ${db.company.name}`,
      facts.length ? `\nCompany facts:\n${facts.join("\n")}` : "",
      passages.length ? `\nFrom the documents:\n${passages.map((c) => `[${c.title}] ${c.text.slice(0, 700)}`).join("\n\n")}` : "",
      skills.length ? `\nPlaybooks to follow:\n${skills.map((s) => `## ${s.name}\n${s.body}`).join("\n\n")}` : "",
      connectors.length ? `\nTools the company uses:\n${connectors.map((c) => `- ${c.name}: ${c.purpose}`).join("\n")}` : "",
      r.paypalSales ? `\nRecent PayPal transactions:\n${tx.map((t) => `${t.date} ${t.amount} ${t.note}`).join("\n") || "(none)"}` : "",
    ].join("\n"),
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        suggestions: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title", "detail"] } },
      },
      required: ["summary", "suggestions"],
    },
  });
  const ideas = (out.suggestions ?? []).slice(0, 3).filter((s) => s.title?.trim());
  const summary = (out.summary || `${ideas.length} suggestion${ideas.length === 1 ? "" : "s"}`).trim().slice(0, 200);
  await write((d) => {
    for (const s of ideas) {
      d.notices.unshift({
        id: `note_${b.id}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        kind: "suggestion",
        title: s.title.trim().slice(0, 100),
        why: s.detail.trim().slice(0, 600),
        builder: b.name,
        createdAt: now(),
      });
    }
    const x = d.builders.find((y) => y.id === b.id);
    if (x) logRun(x, summary, toolsFor(r));
  });
  return summary;
}

export async function runBuilder(id: string): Promise<string> {
  const b = read().builders.find((x) => x.id === id);
  if (!b) throw new Error("No such builder.");
  if (b.paused) return `${b.name} is paused.`;
  try {
    if (id === "scout") return await runScout();
    if (id === "bookkeeper") return await runBookkeeper();
    if (id === "librarian") return await runLibrarian();
    if (EVENT_BUILDERS.has(id)) return `${b.name} runs when its trigger happens (${b.schedule.toLowerCase()}).`;
    return await runCustom(b);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await write((d) => {
      const x = d.builders.find((y) => y.id === id);
      if (x) logRun(x, `Failed: ${msg.slice(0, 160)}`, [], false);
    });
    throw e;
  }
}
