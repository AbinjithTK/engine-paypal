/**
 * The block store.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IN-MEMORY, SINGLE-TENANT, RESETS ON RESTART. This is the seam where
 * Cloud SQL goes: every function below becomes a query against the two tables
 * in BLOCKS.md §8, and nothing that calls them changes. Written server-side
 * on purpose so the MCP server and the web app read the same data.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  resolveVerb,
  type BlockKind,
  type Reward,
  type Verb,
  type Verdict,
  type WorkState,
} from "./blocks";
import { money } from "./money";
import { PEOPLE } from "./people";

export type Block = {
  id: string;
  kind: BlockKind;
  mode?: string;
  data: Record<string, unknown>;
};

export type Link = { from: string; to: string; verb: Verb };

export type WorkBlock = Block & {
  kind: "work";
  data: {
    title: string;
    brief: string;
    criteria: string[];
    reward: Reward;
    state: WorkState;
    doers: string[];
    skills: string[];
    verdict?: Verdict;
    criteriaMet?: [number, number];
    updates: { at: string; by: string; text: string }[];
  };
};

const blocks: Block[] = [
  {
    id: "party-1",
    kind: "party",
    mode: "company",
    data: { name: "Northwind Tools", detail: "Pre-seed · 2 founders" },
  },
  {
    id: "outcome-1",
    kind: "outcome",
    data: {
      text: "Pricing page converts better than it does now",
      measure: "Visit to trial",
      current: "1.2%",
      target: "2.5%",
    },
  },
  {
    id: "work-1",
    kind: "work",
    data: {
      title: "Redesign the pricing page",
      brief:
        "Three tiers instead of four. Show the annual saving as a percentage, not a struck-through price. The page converts at 1.2%; four tiers is one too many and the annual discount sits below the fold.",
      criteria: [
        "Three tiers, monthly and annual toggle",
        "Annual saving shown as a percentage",
        "Brand voice matches the guide",
        "Accessibility score above 95",
        "No layout shift on load",
      ],
      reward: [money(45_000, "USD")],
      state: "in_review",
      doers: ["worker-1"],
      skills: ["Design", "Webflow"],
      verdict: "changes",
      criteriaMet: [4, 5],
      updates: [
        { at: "Wed 11:48", by: "Priya N", text: "First pass in Figma, link in the file." },
      ],
    },
  },
  {
    id: "work-2",
    kind: "work",
    data: {
      title: "Rewrite tier copy for value-led positioning",
      brief:
        "The current copy is feature-led and reads like a spec sheet. Reposition around what each tier lets someone do. Keep it short: a founder should know which tier is theirs in ten seconds.",
      criteria: [
        "Every tier names the job it is for",
        "No feature lists longer than four items",
        "Reads at grade 8 or below",
        "Matches the brand voice guide",
      ],
      // A small cash floor plus real upside — what most people actually accept.
      reward: [money(60_000, "USD"), money(150, "EQUITY")],
      state: "offered",
      doers: [],
      skills: ["Copy", "Positioning"],
      updates: [],
    },
  },
  {
    id: "work-3",
    kind: "work",
    data: {
      title: "Instrument the funnel and report a baseline",
      brief:
        "We cannot tell where people drop off. Add events across visit, pricing view, signup start and trial start, then report the baseline so the redesign can be measured against it.",
      criteria: [
        "Events for all four funnel steps",
        "A dashboard anyone on the team can read",
        "A written baseline with dates",
      ],
      reward: [money(250, "EQUITY")],
      state: "offered",
      doers: [],
      skills: ["Analytics", "SQL"],
      updates: [],
    },
  },
  {
    id: "knowledge-1",
    kind: "knowledge",
    mode: "doc",
    data: {
      title: "Brand and voice guide",
      body: "Plain, concrete, never salesy. We say what a thing does, not how revolutionary it is. No exclamation marks. Value-led over feature-led: describe the job, not the mechanism.",
      chunks: 42,
    },
  },
  {
    id: "knowledge-2",
    kind: "knowledge",
    mode: "note",
    data: {
      title:
        "We have $8k and 18 months of runway. Prefer equity where someone believes in it.",
      body: "Cash is for work nobody will take equity for. Equity is for people who want this to exist.",
      chunks: 1,
    },
  },
  // Doers are blocks like anything else. People detail lives in people.ts;
  // this is their presence in the graph.
  ...PEOPLE.map(
    (p): Block => ({
      id: p.id,
      kind: "doer",
      mode: "human",
      data: {
        name: p.name,
        initials: p.initials,
        capabilities: p.skills,
        appetite: p.appetite,
        available: p.availability !== "booked",
      },
    }),
  ),
  {
    id: "agent-review",
    kind: "doer",
    mode: "agent",
    data: {
      name: "Review Agent",
      initials: "RA",
      capabilities: ["Review", "Criteria checking"],
      model: "gemini-pro",
      owns: "whether work meets the bar",
      runs: 38,
      autonomyLimit: 6,
      onLimit: "ask",
    },
  },
  {
    id: "connection-1",
    kind: "connection",
    mode: "repo",
    data: { name: "github.com/northwind/site", tools: 6, live: true },
  },
  {
    id: "skill-1",
    kind: "skill",
    mode: "checklist",
    data: { name: "Axe and keyboard audit", builtBy: "Aisha R", uses: 29 },
  },
];

const links: Link[] = [
  { from: "party-1", to: "outcome-1", verb: "wants" },
  { from: "knowledge-1", to: "outcome-1", verb: "informs" },
  { from: "knowledge-2", to: "outcome-1", verb: "informs" },
  { from: "outcome-1", to: "work-1", verb: "becomes" },
  { from: "outcome-1", to: "work-2", verb: "becomes" },
  { from: "outcome-1", to: "work-3", verb: "becomes" },
  { from: "worker-1", to: "work-1", verb: "does" },
  { from: "knowledge-1", to: "work-1", verb: "informs" },
  { from: "knowledge-1", to: "work-2", verb: "informs" },
  { from: "connection-1", to: "work-1", verb: "powers" },
  { from: "skill-1", to: "work-1", verb: "teaches" },
  { from: "agent-review", to: "work-1", verb: "does" },
];

// ─── reads ───────────────────────────────────────────────────────────────

export function allBlocks(): Block[] {
  return blocks;
}
export function allLinks(): Link[] {
  return links;
}
export function block(id: string): Block | undefined {
  return blocks.find((b) => b.id === id);
}
export function byKind(kind: BlockKind): Block[] {
  return blocks.filter((b) => b.kind === kind);
}
export function work(id: string): WorkBlock | undefined {
  const b = block(id);
  return b?.kind === "work" ? (b as WorkBlock) : undefined;
}
export function allWork(): WorkBlock[] {
  return byKind("work") as WorkBlock[];
}

/**
 * The context a piece of work may see, and nothing more.
 *
 * This is `prd.md` §7.2 made enforceable: a doer gets the knowledge attached to
 * their work, never the whole company. The MCP server calls this, so an
 * external AI is bound by the same boundary as the web app.
 */
export function scopedKnowledge(workId: string): Block[] {
  const direct = links
    .filter((l) => l.to === workId && l.verb === "informs")
    .map((l) => block(l.from));

  // Knowledge attached to the outcome this work serves also applies.
  const outcomeIds = links
    .filter((l) => l.to === workId && l.verb === "becomes")
    .map((l) => l.from);
  const viaOutcome = links
    .filter((l) => outcomeIds.includes(l.to) && l.verb === "informs")
    .map((l) => block(l.from));

  const seen = new Set<string>();
  return [...direct, ...viaOutcome].filter((b): b is Block => {
    if (!b || seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

/** The outcome a piece of work serves, so a doer can judge the vision. */
export function outcomeOf(workId: string): Block | undefined {
  const l = links.find((x) => x.to === workId && x.verb === "becomes");
  return l ? block(l.from) : undefined;
}

export function equipmentOf(workId: string): Block[] {
  return links
    .filter((l) => l.to === workId && (l.verb === "powers" || l.verb === "teaches"))
    .map((l) => block(l.from))
    .filter((b): b is Block => Boolean(b));
}

export function workFor(doerId: string): WorkBlock[] {
  return allWork().filter((w) => w.data.doers.includes(doerId));
}

export function openWork(): WorkBlock[] {
  return allWork().filter((w) => w.data.state === "offered");
}

// ─── writes ──────────────────────────────────────────────────────────────
// Deliberately narrow. Nothing here commits cash or grants equity.

export function addLink(from: string, to: string): Link | { error: string } {
  const a = block(from);
  const b = block(to);
  if (!a || !b) return { error: "One of those blocks does not exist." };

  const verb = resolveVerb(a.kind, b.kind);
  if (!verb) return { error: `A ${a.kind} cannot connect to a ${b.kind}.` };
  if (links.some((l) => l.from === from && l.to === to)) {
    return { error: "Already connected." };
  }

  const link: Link = { from, to, verb };
  links.push(link);
  return link;
}

export function claimWork(workId: string, doerId: string): { ok: true } | { error: string } {
  const w = work(workId);
  if (!w) return { error: "No such work." };
  if (w.data.state !== "offered") return { error: `That work is ${w.data.state}, not open.` };
  if (w.data.doers.includes(doerId)) return { error: "You are already on it." };

  w.data.doers.push(doerId);
  w.data.state = "doing";
  links.push({ from: doerId, to: workId, verb: "does" });
  return { ok: true };
}

export function postUpdate(
  workId: string,
  by: string,
  text: string,
): { ok: true } | { error: string } {
  const w = work(workId);
  if (!w) return { error: "No such work." };
  w.data.updates.push({ at: new Date().toISOString(), by, text });
  return { ok: true };
}

export function submitWork(
  workId: string,
  by: string,
  artefact: string,
  notes: string,
): { ok: true } | { error: string } {
  const w = work(workId);
  if (!w) return { error: "No such work." };
  if (!w.data.doers.includes(by)) return { error: "You are not on that work." };

  w.data.state = "in_review";
  w.data.updates.push({
    at: new Date().toISOString(),
    by,
    text: `Submitted ${artefact}. ${notes}`.trim(),
  });
  return { ok: true };
}

export function addBlock(
  kind: BlockKind,
  mode: string | undefined,
  data: Record<string, unknown>,
): Block {
  const b: Block = { id: `${kind}-${Date.now().toString(36)}`, kind, mode, data };
  blocks.push(b);
  return b;
}

// ─── access log ──────────────────────────────────────────────────────────

export type AccessEntry = {
  at: string;
  actor: string;
  tool: string;
  target?: string;
  allowed: boolean;
};

const accessLog: AccessEntry[] = [];

/** Every MCP call lands here. `prd.md` §7.2 requires per-query logging. */
export function logAccess(e: Omit<AccessEntry, "at">) {
  accessLog.push({ ...e, at: new Date().toISOString() });
  if (accessLog.length > 500) accessLog.shift();
}

export function readAccessLog(): AccessEntry[] {
  return accessLog;
}

export function personName(id: string): string {
  return PEOPLE.find((p) => p.id === id)?.name ?? id;
}
