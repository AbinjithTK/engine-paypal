/**
 * The building blocks. See BLOCKS.md.
 *
 *   A Party wants an Outcome. The Outcome becomes Work.
 *   A Doer does the Work. Knowledge tells them how.
 *
 * Five nouns, six verbs. Kept small on purpose: a model classifying into a
 * closed vocabulary is far more reliable than one improvising against thirty
 * entity types, and this vocabulary is the AI's tool list.
 */

import { money, type Money } from "./money";

// ─── the five nouns ──────────────────────────────────────────────────────

export type BlockKind =
  // the work
  | "party" //      who wants it, who pays, who owns
  | "outcome" //    what has to become true, with a measure
  | "work" //       what has to be done. Nests. Carries its reward and its proof
  // the doing
  | "doer" //       who or what does it: person, agent, or team
  // the equipment — what a doer, human or AI, is given to work with
  | "knowledge" //  what to know      (MCP: resources)
  | "connection" // what to act on    (MCP: tools)
  | "skill"; //     how to do it      (MCP: prompts)

/** Modes are data, not new kinds. Adding one is not a migration. */
export type PartyMode = "client" | "company" | "investor";
export type DoerMode = "human" | "agent" | "team";
export type KnowledgeMode = "doc" | "repo" | "note" | "decision";
export type ConnectionMode = "mcp" | "api" | "repo" | "payments" | "analytics";
export type SkillMode = "agent" | "checklist" | "rubric";
export type Verdict = "pass" | "changes" | "fail";

export const BLOCK_LABEL: Record<BlockKind, string> = {
  party: "Party",
  outcome: "Outcome",
  work: "Work",
  doer: "Doer",
  knowledge: "Knowledge",
  connection: "Connection",
  skill: "Skill",
};

/**
 * The three equipment blocks are the same triad MCP exposes, which is not a
 * coincidence — it is why the platform can be an MCP server without inventing
 * a translation layer. See MCP.md.
 */
export const EQUIPMENT: BlockKind[] = ["knowledge", "connection", "skill"];

/** What a face says. A founder never meets the abstraction. */
export function faceLabel(kind: BlockKind, mode?: string): string {
  if (kind === "doer") {
    if (mode === "agent") return "Agent";
    if (mode === "team") return "Team";
    return "Person";
  }
  if (kind === "knowledge") return mode === "note" ? "Note" : "Knowledge";
  if (kind === "party") return mode === "company" ? "Company" : "Client";
  if (kind === "connection") return mode === "mcp" ? "MCP" : "Connection";
  return BLOCK_LABEL[kind];
}

// ─── the six verbs ───────────────────────────────────────────────────────

export type Verb =
  | "wants" //       party      -> outcome
  | "becomes" //     outcome    -> work
  | "breaks-into" // work       -> work
  | "does" //        doer       -> work
  | "teams-with" //  doer       -> doer
  | "informs" //     knowledge  -> work | doer | outcome
  | "powers" //      connection -> work | doer
  | "teaches"; //    skill      -> work | doer

export const VERB_LABEL: Record<Verb, string> = {
  wants: "wants",
  becomes: "becomes",
  "breaks-into": "breaks into",
  does: "does",
  "teams-with": "teams with",
  informs: "informs",
  powers: "powers",
  teaches: "teaches",
};

const GRAMMAR: Record<string, Verb> = {
  "party>outcome": "wants",
  "outcome>work": "becomes",
  "work>work": "breaks-into",
  "doer>work": "does",
  "doer>doer": "teams-with",
};

/** What each equipment block may attach to. */
const EQUIPS: Record<string, { verb: Verb; targets: BlockKind[] }> = {
  knowledge: { verb: "informs", targets: ["outcome", "work", "doer"] },
  connection: { verb: "powers", targets: ["work", "doer"] },
  skill: { verb: "teaches", targets: ["work", "doer"] },
};

/**
 * The single resolver, shared by the canvas, the faces, the agent and the MCP
 * server, so a rule can only be wrong in one place. `null` means the wire must
 * not latch and the API must refuse it.
 */
export function resolveVerb(from: BlockKind, to: BlockKind): Verb | null {
  const equip = EQUIPS[from];
  if (equip) return equip.targets.includes(to) ? equip.verb : null;
  return GRAMMAR[`${from}>${to}`] ?? null;
}

/** Which verbs run an agent on creation. */
export const VERB_RUNS: Partial<Record<Verb, string>> = {
  wants: "scoping",
  becomes: "scoping",
  "breaks-into": "scoping",
  does: "briefing",
  informs: "ingestor",
};

// ─── work state ──────────────────────────────────────────────────────────

export type WorkState =
  | "draft" //     no reward agreed
  | "offered" //   reward set, nobody accepted
  | "committed" // funded in cash, or equity terms agreed
  | "doing"
  | "in_review"
  | "settled"; //  paid, or equity granted

export const WORK_STATE: Record<WorkState, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "text-muted-foreground" },
  offered: { label: "Open to take", tone: "text-primary" },
  committed: { label: "Committed", tone: "text-primary" },
  doing: { label: "In progress", tone: "text-primary" },
  in_review: { label: "Under review", tone: "text-warning" },
  settled: { label: "Settled", tone: "text-success" },
};

// ─── reward: cash, equity, or both ───────────────────────────────────────

/**
 * A reward is one or two amounts. Cash, equity, or a mix.
 *
 * This is the whole point of the platform for a founder with no funding: offer
 * a share of the thing instead of money, to someone who wants the thing to
 * exist. It needs no new machinery because equity is a currency (money.ts).
 */
export type Reward = Money[];

export function cashPart(r: Reward): Money | undefined {
  return r.find((m) => m.currency !== "EQUITY");
}

export function equityPart(r: Reward): Money | undefined {
  return r.find((m) => m.currency === "EQUITY");
}

export function hasEquity(r: Reward): boolean {
  return Boolean(equityPart(r));
}

/** How a Doer is willing to be paid. Drives matching and what they see. */
export type RewardAppetite = "cash" | "equity" | "either";

export function appetiteFits(appetite: RewardAppetite, r: Reward): boolean {
  if (appetite === "either") return r.length > 0;
  if (appetite === "cash") return Boolean(cashPart(r));
  return hasEquity(r);
}

/** Sum only within a currency. Mixed-currency addition is a bug, not a feature. */
export function sumSameCurrency(amounts: Money[]): Money | undefined {
  if (amounts.length === 0) return undefined;
  const { currency } = amounts[0];
  if (amounts.some((a) => a.currency !== currency)) {
    throw new Error("Cannot sum mixed currencies. Money carries its currency.");
  }
  return money(
    amounts.reduce((n, a) => n + a.amount, 0),
    currency,
  );
}

// ─── team splits ─────────────────────────────────────────────────────────
// Basis points, integers, summing to exactly 10000. DESIGN.md §5.1.

export const TOTAL_BPS = 10_000;

/** Exact even split: the remainder lands on the first member, never 9999. */
export function splitEven(memberCount: number): number[] {
  if (memberCount < 1) return [];
  const base = Math.floor(TOTAL_BPS / memberCount);
  const shares = Array<number>(memberCount).fill(base);
  shares[0] += TOTAL_BPS - base * memberCount;
  return shares;
}

export function isSplitExact(shares: number[]): boolean {
  return shares.reduce((a, b) => a + b, 0) === TOTAL_BPS;
}

/**
 * Each member's cut. Works for cash and equity alike, which is the payoff of
 * treating equity as a currency. Flooring dust goes to the largest share
 * deliberately: left unassigned, the payout is short and the transfer fails.
 */
export function splitAmount(total: Money, shares: number[]): Money[] {
  if (!isSplitExact(shares)) {
    throw new Error(
      `Split must sum to ${TOTAL_BPS} bps, received ${shares.reduce((a, b) => a + b, 0)}.`,
    );
  }

  const parts = shares.map((bps) => Math.floor((total.amount * bps) / TOTAL_BPS));
  const dust = total.amount - parts.reduce((a, b) => a + b, 0);

  if (dust > 0) {
    let largest = 0;
    for (let i = 1; i < shares.length; i++) {
      if (shares[i] > shares[largest]) largest = i;
    }
    parts[largest] += dust;
  }

  return parts.map((amount) => money(amount, total.currency));
}

// ─── layout ──────────────────────────────────────────────────────────────

/** Deterministic fan, so a re-derive lands blocks in the same places. */
export function fanOut(
  origin: { x: number; y: number },
  index: number,
  count: number,
): { x: number; y: number } {
  return {
    x: origin.x + 340,
    y: Math.round(origin.y + (index - (count - 1) / 2) * 180),
  };
}

/** The board reads left to right. Each kind has a home column. */
export const COLUMN: Record<BlockKind, number> = {
  party: -340,
  knowledge: -340,
  connection: -340,
  skill: -340,
  outcome: 0,
  work: 340,
  doer: 700,
};
