/**
 * Sentence to Intent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SWAP POINT. In production this file is one Gemini call with a structured
 * output schema: seven nouns, eight verbs, and the `Intent` union as the
 * schema. The vocabulary was kept small precisely so this call is reliable
 * (BLOCKS.md §5). The server then validates the intent against the grammar in
 * `blocks.ts` and writes the reasoning to `agent_decisions`.
 *
 * Until the Vertex project exists it is a deterministic parser, so nothing on
 * screen claims to be a model when it is not. Replacing it changes this file
 * and nothing else.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { BlockKind } from "@/lib/blocks";
import type { Intent } from "./types";

const POLITE = /^(please|can you|could you|hey|ok|okay|now)\s+/i;

const KIND_WORDS: { re: RegExp; kind: BlockKind; mode?: string }[] = [
  { re: /\b(outcome|objective|target)\b/, kind: "outcome" },
  { re: /\b(goal)\b/, kind: "outcome" },
  { re: /\b(task|work|job|ticket)\b/, kind: "work" },
  { re: /\b(note)\b/, kind: "knowledge", mode: "note" },
  { re: /\b(doc|document|guide|brief|spec)\b/, kind: "knowledge", mode: "doc" },
  { re: /\b(repo|repository|codebase)\b/, kind: "knowledge", mode: "repo" },
  { re: /\b(decision)\b/, kind: "knowledge", mode: "decision" },
  { re: /\b(client|customer)\b/, kind: "party", mode: "client" },
  { re: /\b(agent)\b/, kind: "doer", mode: "agent" },
  { re: /\b(person|contractor|freelancer|worker)\b/, kind: "doer", mode: "human" },
];

const SKILL_HINT =
  /(design|copy|writ|analytic|react|front|back|growth|sql|access|engineer|market|brand|video|seo|data|ops|product)/;

export function parseIntent(input: string): Intent {
  const said = input.trim();
  const s = said.replace(POLITE, "").toLowerCase();
  if (!s) return { verb: "help" };

  if (/^(help|what can you do|commands|how do i)/.test(s)) return { verb: "help" };

  // ─── reports ───────────────────────────────────────────────────────────
  if (/(what'?s? (blocked|left|next|happening|going on)|status|where are we|progress|summar)/.test(s)) {
    return { verb: "report", topic: "status" };
  }
  if (/(how much|spend|spent|budget|escrow|runway|owe|cost|money)/.test(s)) {
    return { verb: "report", topic: "money" };
  }
  if (/(who('| i)?s? (on|working|available)|my team|the team|roster)/.test(s)) {
    return { verb: "report", topic: "people" };
  }
  if (/(what do (you|we) know|brain|context|knowledge)/.test(s)) {
    return { verb: "report", topic: "knowledge" };
  }

  // ─── navigation ────────────────────────────────────────────────────────
  const goto = s.match(/^(?:go to|open|show me|take me to|show)\s+(?:the\s+)?(board|people|money|brain|tasks?|overview|outline)\b/);
  if (goto) return { verb: "goto", where: goto[1] };

  // ─── teams ─────────────────────────────────────────────────────────────
  const team = s.match(
    /(?:team|group|pair|put)\s+(.+?)\s+(?:and|with|&)\s+([^,.]+?)(?:\s+(?:in|into)\s+a?\s*(?:group|team|pod|squad))?$/,
  );
  if (team) return { verb: "team", doers: [team[1].trim(), team[2].trim()] };

  // ─── assignment ────────────────────────────────────────────────────────
  const assignTo = s.match(/assign\s+(.+?)\s+to\s+(?:the\s+)?(.+)$/);
  if (assignTo) {
    return { verb: "assign", doer: assignTo[1].trim(), work: assignTo[2].trim() };
  }
  const giveTo = s.match(/(?:give|hand|put)\s+(?:the\s+)?(.+?)\s+(?:to|on)\s+(.+)$/);
  if (giveTo) return { verb: "assign", doer: giveTo[2].trim(), work: giveTo[1].trim() };

  // ─── connect, the generic escape hatch ─────────────────────────────────
  const connect = s.match(/(?:connect|link|wire)\s+(.+?)\s+(?:to|with|into)\s+(.+)$/);
  if (connect) return { verb: "connect", from: connect[1].trim(), to: connect[2].trim() };

  // ─── capacity ──────────────────────────────────────────────────────────
  const find = s.match(
    /(?:find|hire|recruit|source|who can(?: do)?|looking for|i need|we need)\s+(?:me\s+)?(?:a|an|some)?\s*(.+)$/,
  );
  if (find && SKILL_HINT.test(find[1])) {
    return {
      verb: "find",
      what: find[1].replace(/\s+(person|someone|dev|developer|guy)$/, "").trim(),
    };
  }

  // ─── money ─────────────────────────────────────────────────────────────
  const fund = s.match(/(?:fund|pay for|release|put money (?:on|into))\s+(?:the\s+)?(.+)$/);
  if (fund) return { verb: "fund", work: fund[1].trim() };

  // ─── creation ──────────────────────────────────────────────────────────
  const create = s.match(/^(?:add|create|new|make|log|record)\s+(?:a|an|the)?\s*(.+)$/);
  if (create) {
    const rest = create[1];
    for (const { re, kind, mode } of KIND_WORDS) {
      if (re.test(rest)) {
        const text = rest
          .replace(re, "")
          .replace(/^\s*(?:called|named|:|-|that says)?\s*/, "")
          .trim();
        return { verb: "create", kind, mode, text: recase(said, text) };
      }
    }
    return { verb: "create", kind: "work", text: recase(said, rest) };
  }

  // "note: ..." shorthand
  const note = s.match(/^(?:note|remember|jot)\s*:?\s*(.+)$/);
  if (note) {
    return { verb: "create", kind: "knowledge", mode: "note", text: recase(said, note[1]) };
  }

  // A bare want is the product's front door, and it is an Outcome not a task.
  const want = s.match(/^(?:i want|we want|i'?d like|our goal is)\s+(.+)$/);
  if (want) return { verb: "create", kind: "outcome", text: recase(said, want[1]) };

  return { verb: "unknown", said };
}

/** Recover the user's original casing for a tail we matched lowercased. */
function recase(original: string, lowerTail: string): string {
  const tail = lowerTail.trim();
  if (!tail) return original.trim();
  const idx = original.toLowerCase().lastIndexOf(tail);
  const out = idx >= 0 ? original.slice(idx, idx + tail.length) : tail;
  return out.replace(/\s*[.?!]$/, "").trim();
}

// ─── fuzzy lookup, shared by every capability ────────────────────────────

export function matchByName<T extends { id: string; name: string }>(
  query: string,
  candidates: T[],
): T | undefined {
  const q = query.trim().toLowerCase().replace(/^(the|that|this)\s+/, "");
  if (!q) return undefined;

  return (
    candidates.find((c) => c.name.toLowerCase() === q) ??
    candidates.find((c) => c.name.toLowerCase().startsWith(q)) ??
    candidates.find((c) => c.name.toLowerCase().includes(q)) ??
    candidates.find((c) => q.includes(c.name.split(" ")[0].toLowerCase())) ??
    bestByWords(q, candidates)
  );
}

function bestByWords<T extends { id: string; name: string }>(
  q: string,
  candidates: T[],
): T | undefined {
  const words = q
    .replace(/\s+(task|work|outcome|goal|note)$/, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return undefined;

  let best: T | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const t = c.name.toLowerCase();
    const score = words.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore > 0 ? best : undefined;
}

export const SUGGESTIONS = [
  "what's blocked",
  "assign Marco to the copy work",
  "team Priya and the review agent",
  "find me a front-end engineer",
  "how much is in escrow",
  "note: client wants annual pricing highlighted",
];
