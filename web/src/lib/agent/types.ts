/**
 * The agent's vocabulary. See BLOCKS.md §6.
 *
 * An intent is expressed in blocks and verbs, never in screens. That is what
 * makes the agent general: it does not know what a "board page" is.
 */

import type { BlockKind } from "@/lib/blocks";

export type Intent =
  /** Bring a new block into existence. */
  | { verb: "create"; kind: BlockKind; mode?: string; text: string }
  /** Connect two blocks by name. The grammar decides what it means. */
  | { verb: "connect"; from: string; to: string }
  /** A Doer does some Work. */
  | { verb: "assign"; doer: string; work: string }
  /** Two or more Doers team up. */
  | { verb: "team"; doers: string[] }
  /** Look for capacity. */
  | { verb: "find"; what: string }
  /** Propose funding. Never executes. */
  | { verb: "fund"; work: string }
  /** Answer a question about the state of things. */
  | { verb: "report"; topic: "status" | "money" | "people" | "knowledge" }
  /** Take me somewhere. */
  | { verb: "goto"; where: string }
  | { verb: "help" }
  | { verb: "unknown"; said: string };

export type Reply = {
  text: string;
  tone?: "neutral" | "success" | "warning";
  /** Where the answer came from, so an answer is never unattributable. */
  via?: string;
};

/**
 * A capability is a thing some part of the app can do. Surfaces register them
 * on mount and the agent resolves against whatever is registered.
 *
 * The agent imports nothing from any page. Pages hand it abilities.
 */
export type Capability = {
  id: string;
  /** Route that owns it, so the agent can navigate there first if needed. */
  surface: string;
  /** One line, used for help and later for the model's tool list. */
  describe: string;
  can: (intent: Intent) => boolean;
  run: (intent: Intent) => Reply;
};

export type Turn = {
  id: number;
  from: "you" | "agent";
  text: string;
  tone?: Reply["tone"];
  via?: string;
};

/**
 * Where an intent lives when nothing currently mounted can serve it. The agent
 * navigates, waits for the surface to register, then replays the intent.
 */
export const INTENT_SURFACE: Partial<Record<Intent["verb"], string>> = {
  create: "/demo/board",
  connect: "/demo/board",
  assign: "/demo/board",
  team: "/demo/board",
  fund: "/demo/board",
  find: "/demo/people",
};
