/**
 * The Engine MCP server. See MCP.md.
 *
 * Any AI can call this: Claude Desktop, Cursor, Claude Code, a custom agent.
 * The point is that a freelancer never has to open our app to be productive —
 * their own tools pull the brief and the company context straight in, which is
 * what makes the zero-onboarding promise real rather than a claim.
 *
 * Three rules that hold without exception:
 *  1. SCOPE. A doer reaches only work they are on, and only the knowledge
 *     attached to it. Enforced here, in one place, for every tool.
 *  2. NO VALUE MOVES. No tool commits cash or grants equity. Rewards can be
 *     proposed; a human confirms. An MCP endpoint that could grant equity via
 *     prompt injection is catastrophic (prd.md §11.2).
 *  3. EVERY CALL IS LOGGED, allowed or refused.
 */

import { cashPart, equityPart } from "@/lib/blocks";
import { formatMoney, money } from "@/lib/money";
import { appetiteFits } from "@/lib/blocks";
import { PEOPLE, searchPeople } from "@/lib/people";
import {
  addBlock,
  allWork,
  claimWork,
  equipmentOf,
  logAccess,
  openWork,
  outcomeOf,
  personName,
  postUpdate,
  scopedKnowledge,
  submitWork,
  work,
  workFor,
} from "@/lib/store";

export type Role = "founder" | "doer";
export type Session = { token: string; role: Role; id: string; name: string };

/**
 * DEMO SESSIONS — NOT AUTHENTICATION.
 * Real tokens are per-user, revocable, and scoped at issue time. This is the
 * single largest gap in the MCP surface and it is listed first in GAPS.md.
 */
const SESSIONS: Session[] = [
  { token: "founder-demo", role: "founder", id: "party-1", name: "Abin J" },
  { token: "doer-demo", role: "doer", id: "worker-2", name: "Marco S" },
  { token: "doer-priya", role: "doer", id: "worker-1", name: "Priya N" },
];

export function sessionFor(token: string | null): Session | null {
  if (!token) return null;
  return SESSIONS.find((s) => s.token === token) ?? null;
}

// ─── tool definitions ────────────────────────────────────────────────────

export type Tool = {
  name: string;
  title: string;
  description: string;
  roles: Role[];
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });

export const TOOLS: Tool[] = [
  {
    name: "whoami",
    title: "Who am I",
    description: "The identity and role this token is scoped to.",
    roles: ["founder", "doer"],
    inputSchema: { type: "object", properties: {} },
  },

  // ─── freelancer side ───────────────────────────────────────────────────
  {
    name: "my_work",
    title: "My work",
    description:
      "Every piece of work assigned to me, with its state and what it pays in cash and equity.",
    roles: ["doer"],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "open_work",
    title: "Find open work",
    description:
      "Work nobody has taken yet that fits my skills and what I am willing to be paid in. Includes the outcome it serves, so I can judge the vision before taking equity.",
    roles: ["doer"],
    inputSchema: {
      type: "object",
      properties: { skill: S("Optional skill to filter by, e.g. 'Copy'.") },
    },
  },
  {
    name: "get_brief",
    title: "Get the brief",
    description:
      "The full brief for a piece of work: what to build, the acceptance criteria it will be judged against, the outcome it serves, and the reward. Everything needed to start without asking anyone.",
    roles: ["founder", "doer"],
    inputSchema: {
      type: "object",
      properties: { work_id: S("The work's id.") },
      required: ["work_id"],
    },
  },
  {
    name: "get_context",
    title: "Get scoped context",
    description:
      "The company knowledge attached to this work — brand voice, constraints, decisions. Scoped: you get what this work needs and nothing else about the company.",
    roles: ["founder", "doer"],
    inputSchema: {
      type: "object",
      properties: { work_id: S("The work's id.") },
      required: ["work_id"],
    },
  },
  {
    name: "take_work",
    title: "Take open work",
    description:
      "Claim a piece of open work. Accepting its reward terms, including any equity, is part of taking it.",
    roles: ["doer"],
    inputSchema: {
      type: "object",
      properties: { work_id: S("The work's id.") },
      required: ["work_id"],
    },
  },
  {
    name: "post_update",
    title: "Post an update",
    description: "Progress note on a piece of work. Visible to the founder and to the agents.",
    roles: ["founder", "doer"],
    inputSchema: {
      type: "object",
      properties: { work_id: S("The work's id."), text: S("The update.") },
      required: ["work_id", "text"],
    },
  },
  {
    name: "submit_work",
    title: "Submit for review",
    description:
      "Submit a deliverable. The Review Agent judges it against the criteria in the brief and the reward settles on a pass.",
    roles: ["doer"],
    inputSchema: {
      type: "object",
      properties: {
        work_id: S("The work's id."),
        artefact: S("URL or filename of what you are delivering."),
        notes: S("Anything the reviewer should know."),
      },
      required: ["work_id", "artefact"],
    },
  },
  {
    name: "my_holdings",
    title: "My holdings",
    description: "Equity I have earned, across every company I have worked for.",
    roles: ["doer"],
    inputSchema: { type: "object", properties: {} },
  },

  // ─── founder side ──────────────────────────────────────────────────────
  {
    name: "state_outcome",
    title: "State an outcome",
    description:
      "Record something that has to become true, with a measure. The Scoping Agent breaks it into priced work.",
    roles: ["founder"],
    inputSchema: {
      type: "object",
      properties: {
        text: S("What has to become true."),
        measure: S("How it is measured, e.g. 'visit to trial'."),
        target: S("The target value."),
      },
      required: ["text"],
    },
  },
  {
    name: "list_work",
    title: "List work",
    description: "All work, with state, who is on it, and what it pays.",
    roles: ["founder"],
    inputSchema: {
      type: "object",
      properties: { state: S("Optional state filter, e.g. 'offered'.") },
    },
  },
  {
    name: "propose_reward",
    title: "Propose a reward",
    description:
      "Suggest what a piece of work should pay in cash and/or equity. PROPOSAL ONLY — a human confirms in the app before anything is committed or granted.",
    roles: ["founder"],
    inputSchema: {
      type: "object",
      properties: {
        work_id: S("The work's id."),
        cash_usd: N("Cash in whole US dollars."),
        equity_bps: N("Equity in basis points. 250 = 2.50%."),
      },
      required: ["work_id"],
    },
  },
  {
    name: "find_doers",
    title: "Find people",
    description:
      "People who could do a piece of work, ranked, including whether they will take equity.",
    roles: ["founder"],
    inputSchema: {
      type: "object",
      properties: {
        skill: S("What is needed, e.g. 'Analytics'."),
        appetite: S("Optional: 'cash', 'equity' or 'either'."),
      },
      required: ["skill"],
    },
  },
  {
    name: "status",
    title: "Status",
    description: "What is open, what is under review, and what is committed in cash and equity.",
    roles: ["founder"],
    inputSchema: { type: "object", properties: {} },
  },
];

export function toolsFor(role: Role): Tool[] {
  return TOOLS.filter((t) => t.roles.includes(role));
}

// ─── dispatch ────────────────────────────────────────────────────────────

export type ToolResult = { text: string; isError?: boolean };

/** A doer may only reach work they are on. Enforced once, used by every tool. */
function reachable(session: Session, workId: string): boolean {
  if (session.role === "founder") return true;
  const w = work(workId);
  if (!w) return false;
  return w.data.doers.includes(session.id) || w.data.state === "offered";
}

function rewardLine(reward: ReturnType<typeof cashPart> extends never ? never : Parameters<typeof cashPart>[0]) {
  const cash = cashPart(reward);
  const eq = equityPart(reward);
  const parts = [
    cash ? formatMoney(cash) : null,
    eq ? `${formatMoney(eq)} equity` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "no reward set";
}

export function callTool(
  session: Session,
  name: string,
  args: Record<string, unknown>,
): ToolResult {
  const tool = TOOLS.find((t) => t.name === name);

  if (!tool) {
    logAccess({ actor: session.id, tool: name, allowed: false });
    return { text: `No tool called "${name}".`, isError: true };
  }
  if (!tool.roles.includes(session.role)) {
    logAccess({ actor: session.id, tool: name, allowed: false });
    return { text: `"${name}" is not available to a ${session.role}.`, isError: true };
  }

  const workId = typeof args.work_id === "string" ? args.work_id : undefined;
  if (workId && !reachable(session, workId)) {
    logAccess({ actor: session.id, tool: name, target: workId, allowed: false });
    return {
      text: `You do not have access to ${workId}. A doer reaches only work they are on, plus work that is open.`,
      isError: true,
    };
  }

  logAccess({ actor: session.id, tool: name, target: workId, allowed: true });

  switch (name) {
    case "whoami":
      return {
        text: `${session.name} · ${session.role} · id ${session.id}\n${toolsFor(session.role).length} tools available to you.`,
      };

    // ─── freelancer ──────────────────────────────────────────────────────
    case "my_work": {
      const mine = workFor(session.id);
      if (mine.length === 0) return { text: "Nothing assigned to you. Try open_work." };
      return {
        text: mine
          .map(
            (w) =>
              `${w.id} · ${w.data.title}\n  ${w.data.state} · ${rewardLine(w.data.reward)}`,
          )
          .join("\n\n"),
      };
    }

    case "open_work": {
      const me = PEOPLE.find((p) => p.id === session.id);
      const skill = typeof args.skill === "string" ? args.skill.toLowerCase() : null;

      const rows = openWork().filter((w) => {
        if (skill && !w.data.skills.some((s) => s.toLowerCase().includes(skill))) return false;
        if (me && !appetiteFits(me.appetite, w.data.reward)) return false;
        return true;
      });

      if (rows.length === 0) {
        return {
          text: me
            ? `Nothing open that matches your skills and takes ${me.appetite}. Widen with the skill argument, or check back.`
            : "Nothing open right now.",
        };
      }

      return {
        text: rows
          .map((w) => {
            const o = outcomeOf(w.id);
            const od = o?.data as { text?: string; measure?: string; target?: string } | undefined;
            return (
              `${w.id} · ${w.data.title}\n` +
              `  Pays: ${rewardLine(w.data.reward)}\n` +
              `  Needs: ${w.data.skills.join(", ")}\n` +
              `  Serves: ${od?.text ?? "—"}${od?.measure ? ` (${od.measure} → ${od.target})` : ""}`
            );
          })
          .join("\n\n"),
      };
    }

    case "get_brief": {
      const w = work(workId!);
      if (!w) return { text: "No such work.", isError: true };
      const o = outcomeOf(w.id);
      const od = o?.data as { text?: string; measure?: string; current?: string; target?: string } | undefined;
      const equip = equipmentOf(w.id);

      return {
        text: [
          `# ${w.data.title}`,
          ``,
          w.data.brief,
          ``,
          `## Why this matters`,
          od?.text ?? "—",
          od?.measure ? `Measured by ${od.measure}: ${od.current} → ${od.target}` : "",
          ``,
          `## Done means`,
          ...w.data.criteria.map((c, i) => `${i + 1}. ${c}`),
          ``,
          `## Reward`,
          rewardLine(w.data.reward),
          equity(w) ? `Equity vests on a passing review. No cliff, no schedule.` : "",
          ``,
          equip.length
            ? `## Available to you\n${equip.map((e) => `- ${(e.data as { name: string }).name} (${e.kind})`).join("\n")}`
            : "",
          ``,
          `## State`,
          w.data.state + (w.data.verdict ? ` · ${w.data.verdict}` : ""),
        ]
          .filter((l) => l !== "")
          .join("\n"),
      };
    }

    case "get_context": {
      const w = work(workId!);
      if (!w) return { text: "No such work.", isError: true };
      const chunks = scopedKnowledge(w.id);
      if (chunks.length === 0) {
        return { text: "No context attached to this work yet." };
      }
      return {
        text:
          `Context scoped to ${w.id}. This is what this work needs, not the whole company.\n\n` +
          chunks
            .map((k) => {
              const d = k.data as { title: string; body?: string };
              return `## ${d.title}\n${d.body ?? ""}`;
            })
            .join("\n\n"),
      };
    }

    case "take_work": {
      const r = claimWork(workId!, session.id);
      if ("error" in r) return { text: r.error, isError: true };
      const w = work(workId!)!;
      return {
        text: `Taken. ${w.data.title} is yours, paying ${rewardLine(w.data.reward)}.\nCall get_brief and get_context next — everything you need is there.`,
      };
    }

    case "post_update": {
      const r = postUpdate(workId!, session.name, String(args.text ?? ""));
      return "error" in r
        ? { text: r.error, isError: true }
        : { text: "Posted. The founder sees it without being asked." };
    }

    case "submit_work": {
      const r = submitWork(
        workId!,
        session.id,
        String(args.artefact ?? ""),
        String(args.notes ?? ""),
      );
      if ("error" in r) return { text: r.error, isError: true };
      return {
        text: `Submitted. The Review Agent judges it against the ${work(workId!)!.data.criteria.length} criteria in the brief, and the reward settles on a pass.`,
      };
    }

    case "my_holdings": {
      const me = PEOPLE.find((p) => p.id === session.id);
      if (!me || me.holdings.length === 0) {
        return { text: "No equity yet. Take work that pays in equity and it accrues here." };
      }
      const total = me.holdings.reduce((n, h) => n + h.equity.amount, 0);
      return {
        text:
          me.holdings.map((h) => `${h.company}: ${formatMoney(h.equity)}`).join("\n") +
          `\n\nAcross ${me.holdings.length} ${me.holdings.length === 1 ? "company" : "companies"}, ${formatMoney(money(total, "EQUITY"))} in total.`,
      };
    }

    // ─── founder ─────────────────────────────────────────────────────────
    case "state_outcome": {
      const b = addBlock("outcome", undefined, {
        text: String(args.text ?? ""),
        measure: args.measure ? String(args.measure) : undefined,
        target: args.target ? String(args.target) : undefined,
      });
      return {
        text: `Recorded ${b.id}.${args.measure ? "" : " No measure given — an outcome without one is a wish, so add one."}`,
      };
    }

    case "list_work": {
      const filter = typeof args.state === "string" ? args.state : null;
      const rows = allWork().filter((w) => !filter || w.data.state === filter);
      return {
        text: rows
          .map(
            (w) =>
              `${w.id} · ${w.data.title}\n  ${w.data.state} · ${rewardLine(w.data.reward)} · ${
                w.data.doers.length
                  ? w.data.doers.map(personName).join(", ")
                  : "nobody on it"
              }`,
          )
          .join("\n\n"),
      };
    }

    case "propose_reward": {
      const w = work(workId!);
      if (!w) return { text: "No such work.", isError: true };
      const cash = typeof args.cash_usd === "number" ? args.cash_usd : 0;
      const bps = typeof args.equity_bps === "number" ? args.equity_bps : 0;

      // RULE 2. This is the whole reason the tool is named "propose".
      return {
        text:
          `Proposal for ${w.id} (${w.data.title}):\n` +
          `  ${cash ? formatMoney(money(cash * 100, "USD")) : "no cash"}` +
          `${bps ? ` + ${formatMoney(money(bps, "EQUITY"))} equity` : ""}\n\n` +
          `Nothing is committed. Open the work in the app and confirm it there. ` +
          `No tool on this server can move cash or grant equity, by design.`,
      };
    }

    case "find_doers": {
      const skill = String(args.skill ?? "");
      const appetite = typeof args.appetite === "string" ? args.appetite : null;
      const rows = searchPeople(PEOPLE, skill).filter(
        (p) => !appetite || p.appetite === appetite || p.appetite === "either",
      );
      if (rows.length === 0) return { text: `Nobody matching "${skill}".` };
      return {
        text: rows
          .map(
            (p) =>
              `${p.name} · ${p.skills.join(", ")}\n  takes ${p.appetite} · ${(p.firstPassBps / 100).toFixed(0)}% first pass · ${p.availability}`,
          )
          .join("\n\n"),
      };
    }

    case "status": {
      const all = allWork();
      const open = all.filter((w) => w.data.state === "offered");
      const reviewing = all.filter((w) => w.data.state === "in_review");
      const cash = all.reduce((n, w) => n + (cashPart(w.data.reward)?.amount ?? 0), 0);
      const eq = all.reduce((n, w) => n + (equityPart(w.data.reward)?.amount ?? 0), 0);
      return {
        text:
          `${all.length} pieces of work. ${open.length} open, ${reviewing.length} under review.\n` +
          `Committed: ${formatMoney(money(cash, "USD"))} cash and ${formatMoney(money(eq, "EQUITY"))} equity.\n\n` +
          (open.length
            ? `Open: ${open.map((w) => w.data.title).join("; ")}`
            : "Everything has someone on it."),
      };
    }

    default:
      return { text: `"${name}" is defined but not implemented.`, isError: true };
  }
}

function equity(w: ReturnType<typeof work>) {
  return w ? Boolean(equityPart(w.data.reward)) : false;
}

// ─── resources and prompts ───────────────────────────────────────────────

export function resourcesFor(session: Session) {
  const rows = session.role === "founder" ? allWork() : workFor(session.id);
  return rows.map((w) => ({
    uri: `engine://work/${w.id}/brief`,
    name: `Brief — ${w.data.title}`,
    description: "The full brief, criteria, outcome and reward.",
    mimeType: "text/markdown",
  }));
}

export function readResource(session: Session, uri: string): ToolResult {
  const m = uri.match(/^engine:\/\/work\/([^/]+)\/brief$/);
  if (!m) return { text: `Unknown resource ${uri}.`, isError: true };
  return callTool(session, "get_brief", { work_id: m[1] });
}

export const PROMPTS = [
  {
    name: "start_work",
    title: "Start on a piece of work",
    description:
      "Pull the brief and the scoped context, then plan the work before writing anything.",
    arguments: [{ name: "work_id", description: "The work's id.", required: true }],
  },
  {
    name: "whats_blocked",
    title: "What is blocked",
    description: "Summarise what needs a decision or a person.",
    arguments: [],
  },
];

export function renderPrompt(name: string, args: Record<string, unknown>): string {
  if (name === "start_work") {
    return [
      `Call get_brief and get_context for work ${args.work_id}.`,
      `Read the acceptance criteria carefully — they are what the review is scored against.`,
      `Then write a short plan mapping each criterion to how you will satisfy it.`,
      `Do not start producing until the plan covers every criterion.`,
    ].join("\n");
  }
  return `Call status, then list what needs a human decision and what is waiting on a person.`;
}
