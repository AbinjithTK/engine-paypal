import "server-only";

import { nextId, now } from "./db";
import { json, MODELS } from "./gemini";
import { searchBrain } from "./search";
import { PRIVATE_SECTIONS, type BrainSection, type Chunk, type Db, type Fact, type FactSource, type Job } from "./types";

/**
 * The Company Brain: what Engine knows about the business, every fact with
 * its source, and a hard rule about what leaves it.
 */

export const SECTIONS: { id: BrainSection; label: string; hint: string }[] = [
  { id: "company", label: "The company", hint: "What it does and for whom" },
  { id: "customers", label: "Customers", hint: "Who buys and why" },
  { id: "voice", label: "Voice", hint: "How it sounds" },
  { id: "avoid", label: "Words to avoid", hint: "Never say these" },
  { id: "offer", label: "Offer and prices", hint: "What is sold, for how much" },
  { id: "pricing", label: "What work costs", hint: "Learned from paid jobs and PayPal" },
  { id: "rules", label: "Delivery rules", hint: "How work must be handed over" },
  { id: "private", label: "Never shared", hint: "Revenue, suppliers, plans" },
];

const SECTION_IDS = SECTIONS.map((s) => s.id);

export function addFact(
  db: Db,
  f: { section: BrainSection; text: string; source: FactSource; confirmed?: boolean },
): Fact | null {
  const text = f.text.trim();
  if (!text) return null;
  const dup = db.facts.find(
    (x) => !x.retired && x.section === f.section && x.text.toLowerCase() === text.toLowerCase(),
  );
  if (dup) return dup;
  const fact: Fact = {
    id: nextId(db, "fact"),
    section: f.section,
    text,
    source: f.source,
    confirmed: f.confirmed ?? false,
    createdAt: now(),
  };
  db.facts.push(fact);
  return fact;
}

export function liveFacts(db: Db): Fact[] {
  return db.facts.filter((f) => !f.retired);
}

function factList(facts: Fact[]): string {
  return facts.map((f) => `[${f.id}] (${f.section}) ${f.text}`).join("\n") || "(none yet)";
}

// ─── the onboarding interview ────────────────────────────────────────────

export const FIRST_QUESTION =
  "Tell me about the business in a sentence or two: what you sell, and who buys it.";

const factSchema = {
  type: "object",
  properties: {
    section: { type: "string", enum: SECTION_IDS },
    text: { type: "string", description: "One short, self-contained fact in plain words." },
  },
  required: ["section", "text"],
};

export async function interviewTurn(
  db: Db,
  answer: string,
): Promise<{ facts: Fact[]; next: string | null }> {
  const transcript = db.interview.map((m) => `${m.role === "engine" ? "Engine" : "Founder"}: ${m.text}`).join("\n");
  const r = await json<{ facts: { section: BrainSection; text: string }[]; next_question: string; done: boolean }>({
    system:
      "You are Engine, interviewing the founder of a one-person company to build its Company Brain. " +
      "From the founder's latest answer, extract every concrete fact as a separate short item, filed in the right section. " +
      "Sections: company (what it is, where), customers, voice, avoid, offer (what customers buy and its prices), " +
      "pricing (only what hired work has cost), rules (how work must be delivered), private. " +
      "Put revenue, margins, supplier names, customer lists, personal details and unannounced plans in 'private'. " +
      "Merge closely related points into one fact (e.g. one voice fact, not three). " +
      "Words or phrases the founder dislikes go in 'avoid', one per item. Do not invent anything the founder did not say. " +
      "Then ask ONE short, friendly follow-up question that fills the most useful remaining gap, in this order of priority: " +
      "customers, voice, words to avoid, offer and prices, delivery rules, what must never be shared. " +
      "Set done=true once those are covered or after about six questions.",
    prompt:
      `Company: ${db.company.name}\n\nWhat the Brain already holds:\n${factList(liveFacts(db))}\n\n` +
      `Interview so far:\n${transcript}\n\nFounder's latest answer:\n${answer}`,
    schema: {
      type: "object",
      properties: {
        facts: { type: "array", items: factSchema },
        next_question: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["facts", "next_question", "done"],
    },
  });
  const added = r.facts
    .map((f) => addFact(db, { section: f.section, text: f.text, source: { kind: "interview" }, confirmed: true }))
    .filter((f): f is Fact => Boolean(f));
  return { facts: added, next: r.done ? null : r.next_question };
}

// ─── learning from a website ─────────────────────────────────────────────

export type RawFact = { section: BrainSection; text: string; contradicts?: string };

/** Ask the model for facts in a text. Reads the Brain, writes nothing. */
export async function extractFacts(db: Db, text: string, label: string): Promise<RawFact[]> {
  const r = await json<{ facts: RawFact[] }>({
    system:
      "Extract the facts about the business that someone doing work for it would need, from the text given. " +
      "Short, plain, one per item, at most 15. Never invent. Put revenue, margins, supplier names, customer names and unannounced plans in 'private'. " +
      "If a fact contradicts an existing Brain fact, set contradicts to that fact's id (like fact_000a). " +
      "Skip anything already covered by an existing fact.",
    prompt: `Existing Brain:\n${factList(liveFacts(db))}\n\n${label}:\n${text.slice(0, 20000)}`,
    schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: { ...factSchema.properties, contradicts: { type: "string" } },
            required: ["section", "text"],
          },
        },
      },
      required: ["facts"],
    },
  });
  return r.facts.slice(0, 20);
}

/** File extracted facts as unconfirmed, flagging conflicts. A private source makes every fact private. */
export function applyFacts(db: Db, raw: RawFact[], source: FactSource, forcePrivate = false): { added: Fact[]; conflicts: number } {
  let conflicts = 0;
  const added: Fact[] = [];
  for (const f of raw) {
    const fact = addFact(db, { section: forcePrivate ? "private" : f.section, text: f.text, source });
    if (!fact) continue;
    if (f.contradicts && db.facts.some((x) => x.id === f.contradicts && !x.retired)) {
      fact.conflictsWith = f.contradicts;
      conflicts++;
    }
    added.push(fact);
  }
  return { added, conflicts };
}

export async function learnFromText(db: Db, text: string, url: string): Promise<{ added: Fact[]; conflicts: number }> {
  const raw = await extractFacts(db, text, `Website (${url})`);
  return applyFacts(db, raw, { kind: "website", url });
}

// ─── the per-job slice ───────────────────────────────────────────────────

/**
 * Which facts a job may see. Two layers:
 *  1. A hard rule in code: private facts never leave, whatever the model says.
 *  2. Gemini picks what is relevant from the rest, so a copy job is not
 *     handed the delivery rules for a design job.
 */
export type Slice = { factIds: string[]; connectorIds: string[]; skillIds: string[]; chunkIds: string[]; searchedVia: string };

/**
 * Also picks the company's connectors and skills that apply, and searches the
 * documents for passages the job needs (private documents are never searched).
 */
export async function sliceForJob(db: Db, job: Pick<Job, "title" | "brief" | "criteria">): Promise<Slice> {
  const shareable = liveFacts(db).filter((f) => !PRIVATE_SECTIONS.includes(f.section) && !f.conflictsWith);
  const found = db.chunks.length
    ? await searchBrain(db, `${job.title}\n${job.brief}\n${job.criteria.join("\n")}`, { k: 6 })
    : { chunks: [], via: "local" as const, fellBack: undefined };
  const chunkIds = found.chunks.map((c) => c.chunk.id);
  const searchedVia = found.fellBack ? "local (Elastic unavailable)" : found.via;
  if (shareable.length === 0 && db.connectors.length === 0 && db.skills.length === 0) {
    return { factIds: [], connectorIds: [], skillIds: [], chunkIds, searchedVia };
  }
  let picked = { ids: [] as string[], connector_ids: [] as string[], skill_ids: [] as string[] };
  try {
    picked = await json<typeof picked>({
      system:
        "Choose what an outside expert needs to do this job well. 'ids': the company facts they need; include voice and words to avoid " +
        "for any job that produces words or visuals. 'connector_ids': the company's tools and services this job will touch. " +
        "'skill_ids': the company's playbooks that apply to this kind of work. Leave out anything this job does not need.",
      prompt:
        `Job: ${job.title}\n${job.brief}\nCriteria:\n${job.criteria.join("\n")}\n\nFacts:\n${factList(shareable)}\n\n` +
        `Connectors:\n${db.connectors.map((c) => `[${c.id}] ${c.name} (${c.kind}): ${c.purpose}`).join("\n") || "(none)"}\n\n` +
        `Skills:\n${db.skills.map((s) => `[${s.id}] ${s.name}: use when ${s.when}`).join("\n") || "(none)"}`,
      schema: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" } },
          connector_ids: { type: "array", items: { type: "string" } },
          skill_ids: { type: "array", items: { type: "string" } },
        },
        required: ["ids", "connector_ids", "skill_ids"],
      },
    });
  } catch {
    picked.ids = shareable.filter((f) => f.section === "voice" || f.section === "avoid").map((f) => f.id);
  }
  // The model chooses; code decides what is allowed.
  const keep = (ids: string[], allowed: string[]) => [...new Set(ids)].filter((id) => allowed.includes(id));
  return {
    factIds: keep(picked.ids, shareable.map((f) => f.id)),
    connectorIds: keep(picked.connector_ids, db.connectors.map((c) => c.id)),
    skillIds: keep(picked.skill_ids, db.skills.map((s) => s.id)),
    chunkIds,
    searchedVia,
  };
}

/** Passages a job may read: chosen for it, and never from a private document. */
export function chunksById(db: Db, ids: string[]): Chunk[] {
  const set = new Set(ids);
  return db.chunks.filter((c) => set.has(c.id) && !c.private);
}

export function factsById(db: Db, ids: string[]): Fact[] {
  const set = new Set(ids);
  return db.facts.filter((f) => set.has(f.id) && !f.retired && !PRIVATE_SECTIONS.includes(f.section));
}

export const DEFAULT_MODEL = MODELS.fast;
