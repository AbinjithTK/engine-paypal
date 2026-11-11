"use client";

/**
 * Block faces. Five kinds, see BLOCKS.md.
 *
 * Modes are data, not components: one Doer face renders a person, an agent or a
 * team. A founder sees PERSON / AGENT / TEAM and never the abstraction.
 *
 * Rules:
 *  - 240px fixed width, fixed height per kind. A face that resizes when a
 *    reward lands makes every attached wire jump.
 *  - A face may carry a SAFE action (assign). Never a money action.
 *  - One target handle left, one source handle right.
 */

import { memo } from "react";
import { Position, type Node, type NodeProps } from "@xyflow/react";
import {
  Bot,
  Building2,
  FileText,
  PieChart,
  Plug,
  Sparkle,
  StickyNote,
  Target,
  Users,
  Wrench,
} from "lucide-react";

import { BaseHandle } from "@/components/base-handle";
import { BaseNode } from "@/components/base-node";
import { MoneyAmount } from "@/components/money-badge";
import { AssignPopover } from "@/components/board/assign-popover";
import { useBoardActions } from "@/components/board/board-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  cashPart,
  equityPart,
  WORK_STATE,
  type ConnectionMode,
  type DoerMode,
  type KnowledgeMode,
  type PartyMode,
  type RewardAppetite,
  type Reward,
  type SkillMode,
  type Verdict,
  type WorkState,
} from "@/lib/blocks";
import { personById } from "@/lib/people";
import { cn } from "@/lib/utils";

export type RunStatus = "idle" | "working" | "failed";

function Shell({
  label,
  status = "idle",
  target = true,
  source = true,
  accent,
  children,
}: {
  label: string;
  status?: RunStatus;
  target?: boolean;
  source?: boolean;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <BaseNode
      className={cn(
        "w-[240px] rounded-xl",
        // Working: border opacity pulse, reusing the skeleton row from
        // DESIGN.md §9. No spinner on a face.
        status === "working" && "animate-pulse border-primary/50",
        status === "failed" && "border-destructive/50",
        accent,
      )}
    >
      {target && <BaseHandle type="target" position={Position.Left} />}
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {status === "working" && (
          <Sparkle className="size-3 text-primary" aria-hidden="true" />
        )}
      </div>
      {children}
      {source && <BaseHandle type="source" position={Position.Right} />}
    </BaseNode>
  );
}

/** Equity reads as a share of the thing, so it gets its own quiet treatment. */
export function EquityChip({ value }: { value: Parameters<typeof MoneyAmount>[0]["value"] }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-xs font-medium text-primary">
      <PieChart className="size-3" aria-hidden="true" />
      <span data-slot="money">{formatEquity(value.amount)}</span>
    </span>
  );
}

function formatEquity(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

// ─── Party ───────────────────────────────────────────────────────────────

export type PartyData = {
  name: string;
  mode: PartyMode;
  detail: string;
  wants: number;
};

export const PartyNode = memo(function PartyNode({ data }: NodeProps<Node<PartyData>>) {
  return (
    <Shell label={data.mode} target={false}>
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex items-center gap-2">
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="truncate text-sm font-medium">{data.name}</p>
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{data.detail}</p>
      </div>
    </Shell>
  );
});

// ─── Outcome ─────────────────────────────────────────────────────────────

export type OutcomeData = {
  text: string;
  measure?: string;
  current?: string;
  target?: string;
  status?: RunStatus;
};

export const OutcomeNode = memo(function OutcomeNode({
  data,
}: NodeProps<Node<OutcomeData>>) {
  return (
    <Shell label="Outcome" status={data.status} accent="border-primary/30">
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="line-clamp-3 text-sm font-medium leading-snug">{data.text}</p>
        </div>

        {data.measure ? (
          <div className="mt-2.5 border-t pt-2">
            <p className="text-xs text-muted-foreground">{data.measure}</p>
            <p className="tnum mt-0.5 text-xs">
              <span className="text-muted-foreground">{data.current ?? "—"} → </span>
              <span className="font-medium">{data.target ?? "—"}</span>
            </p>
          </div>
        ) : (
          // An outcome without a measure is a wish. BLOCKS.md
          <p className="mt-2.5 border-t pt-2 text-xs text-warning">No measure yet</p>
        )}
      </div>
    </Shell>
  );
});

// ─── Work ────────────────────────────────────────────────────────────────

export type WorkData = {
  title: string;
  /** Cash, equity, or both. */
  reward: Reward;
  state: WorkState;
  doers: string[];
  skills?: string[];
  verdict?: Verdict;
  criteriaMet?: [number, number];
  status?: RunStatus;
};

const VERDICT_META: Record<Verdict, { label: string; className: string }> = {
  pass: { label: "Passed review", className: "text-success" },
  changes: { label: "Changes requested", className: "text-warning" },
  fail: { label: "Failed review", className: "text-destructive" },
};

export const WorkNode = memo(function WorkNode({ id, data }: NodeProps<Node<WorkData>>) {
  const { assign } = useBoardActions();
  const cash = cashPart(data.reward);
  const equity = equityPart(data.reward);
  const state = WORK_STATE[data.state];
  const v = data.verdict ? VERDICT_META[data.verdict] : null;

  return (
    <Shell label="Work" status={data.status}>
      <div className="px-3 pb-2.5 pt-1.5">
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug">
          {data.title}
        </p>
      </div>

      {/* Reward. Cash, equity, or both, and it is state — never a button. */}
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
        {cash && <MoneyAmount value={cash} />}
        {equity && <EquityChip value={equity} />}
        {!cash && !equity && (
          <span className="text-xs text-muted-foreground">No reward set</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
        {data.doers.length > 0 ? (
          <Faces ids={data.doers} />
        ) : (
          <span className="text-xs text-muted-foreground">Nobody yet</span>
        )}
        <AssignPopover
          requiredSkills={data.skills ?? []}
          assignedIds={data.doers}
          onAssign={(person, viaAgent) => assign(id, person, viaAgent)}
          label={data.doers.length ? "Add" : "Assign"}
        />
      </div>

      <p className={cn("border-t px-3 py-2 text-xs font-medium", state.tone)}>
        {state.label}
        {data.criteriaMet && (
          <span className="tnum font-normal text-muted-foreground">
            {" "}
            · {data.criteriaMet[0]}/{data.criteriaMet[1]} criteria
          </span>
        )}
      </p>

      {v && (
        <p className={cn("border-t px-3 py-2 text-xs font-medium", v.className)}>
          {v.label}
        </p>
      )}
    </Shell>
  );
});

// ─── Doer ────────────────────────────────────────────────────────────────

export type DoerData = {
  name: string;
  mode: DoerMode;
  initials: string;
  capabilities: string[];
  available?: boolean;
  /** What they will take: cash, equity, or either. */
  appetite?: RewardAppetite;
  /** agent mode */
  model?: string;
  owns?: string;
  runs?: number;
  /**
   * How many actions this agent may chain before a human is required.
   * An agent without a ceiling is an agent that can run away, and prd.md §6.1
   * asks for exactly this guardrail. Borrowed from Relevance AI — see
   * DESIGN.md §15.4.
   */
  autonomyLimit?: number;
  /** What happens when the limit is reached. Never "keep going". */
  onLimit?: "ask" | "stop";
  /** team mode */
  members?: { initials: string; shareBps: number; mode: DoerMode }[];
  readers?: number;
};

const APPETITE_LABEL: Record<RewardAppetite, string> = {
  cash: "Cash only",
  equity: "Takes equity",
  either: "Cash or equity",
};

export const DoerNode = memo(function DoerNode({ data }: NodeProps<Node<DoerData>>) {
  if (data.mode === "agent") {
    return (
      <Shell label="Agent" accent="border-primary/30">
        <div className="px-3 pb-3 pt-1.5">
          <div className="flex items-center gap-2">
            <Bot className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="truncate text-sm font-medium">{data.name}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            Owns: {data.owns ?? "—"}
          </p>
          <p className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
            <span className="font-mono">{data.model ?? "—"}</span>
            <span className="tnum">{(data.runs ?? 0).toLocaleString()} runs</span>
          </p>

          {/* The ceiling is state, and it belongs on the face. An agent whose
              limit you cannot see is an agent you are trusting blindly. */}
          <p className="mt-2 border-t pt-2 text-xs">
            {data.autonomyLimit ? (
              <span className="text-muted-foreground">
                Stops after{" "}
                <span className="tnum text-foreground">{data.autonomyLimit}</span> actions
                and {data.onLimit === "stop" ? "halts" : "asks you"}
              </span>
            ) : (
              <span className="text-warning">No autonomy limit set</span>
            )}
          </p>
        </div>
      </Shell>
    );
  }

  if (data.mode === "team") {
    const members = data.members ?? [];
    return (
      <Shell label="Team" accent="border-primary/30">
        <div className="px-3 pb-3 pt-1.5">
          <div className="flex items-center gap-2">
            <Users className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p className="truncate text-sm font-medium">{data.name}</p>
          </div>

          <ul className="mt-2.5 space-y-1">
            {members.map((m) => (
              <li key={m.initials} className="flex items-center justify-between gap-2 text-xs">
                {m.mode === "agent" ? (
                  <span className="flex size-5 items-center justify-center rounded-full border border-primary/30 bg-primary/8">
                    <Bot className="size-2.5 text-primary" aria-hidden="true" />
                  </span>
                ) : (
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[9px]">{m.initials}</AvatarFallback>
                  </Avatar>
                )}
                <span data-slot="money" className="text-muted-foreground">
                  {(m.shareBps / 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2.5 border-t pt-2 text-xs text-muted-foreground">
            {data.readers ?? members.length} on this brief
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell label="Person">
      <div className="flex items-center gap-3 px-3 pb-2.5 pt-1.5">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback className="text-xs">{data.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{data.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {data.capabilities.slice(0, 2).join(", ")}
          </p>
        </div>
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            data.available ? "bg-success" : "bg-muted-foreground/40",
          )}
          aria-hidden="true"
        />
        <span className="sr-only">{data.available ? "Available" : "Unavailable"}</span>
      </div>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {APPETITE_LABEL[data.appetite ?? "cash"]}
      </p>
    </Shell>
  );
});

// ─── Knowledge ───────────────────────────────────────────────────────────

export type KnowledgeData = {
  title: string;
  mode: KnowledgeMode;
  chunks?: number;
  author?: string;
  status?: RunStatus;
};

export const KnowledgeNode = memo(function KnowledgeNode({
  data,
}: NodeProps<Node<KnowledgeData>>) {
  if (data.mode === "note") {
    return (
      <Shell label="Note" target={false} accent="border-warning/40 bg-warning-subtle">
        <div className="px-3 pb-3 pt-1.5">
          <div className="flex items-start gap-2">
            <StickyNote className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <p className="line-clamp-4 text-xs leading-relaxed">{data.title}</p>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{data.author ?? "You"}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell label="Knowledge" status={data.status} target={false}>
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex items-center gap-2">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="truncate text-sm font-medium">{data.title}</p>
        </div>
        <p className="mt-2 flex items-center justify-between text-xs capitalize text-muted-foreground">
          <span>{data.mode}</span>
          <span className="tnum">{(data.chunks ?? 0).toLocaleString()} chunks</span>
        </p>
      </div>
    </Shell>
  );
});

// ─── Connection ──────────────────────────────────────────────────────────

export type ConnectionData = {
  name: string;
  mode: ConnectionMode;
  /** How many callable tools it exposes. */
  tools: number;
  live?: boolean;
};

export const ConnectionNode = memo(function ConnectionNode({
  data,
}: NodeProps<Node<ConnectionData>>) {
  return (
    <Shell label={data.mode === "mcp" ? "MCP" : "Connection"} target={false}>
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex items-center gap-2">
          <Plug className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="truncate text-sm font-medium">{data.name}</p>
        </div>
        <p className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <span className="tnum">{data.tools} tools</span>
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                data.live ? "bg-success" : "bg-muted-foreground/40",
              )}
              aria-hidden="true"
            />
            {data.live ? "Live" : "Not connected"}
          </span>
        </p>
      </div>
    </Shell>
  );
});

// ─── Skill ───────────────────────────────────────────────────────────────

export type SkillData = {
  name: string;
  mode: SkillMode;
  /** Who built it. A skill is portable — it travels with its author. */
  builtBy: string;
  uses?: number;
};

export const SkillNode = memo(function SkillNode({ data }: NodeProps<Node<SkillData>>) {
  return (
    <Shell label="Skill" target={false} accent="border-primary/30">
      <div className="px-3 pb-3 pt-1.5">
        <div className="flex items-center gap-2">
          <Wrench className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <p className="truncate text-sm font-medium">{data.name}</p>
        </div>
        <p className="mt-1 truncate text-xs capitalize text-muted-foreground">{data.mode}</p>
        <p className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <span className="truncate">by {data.builtBy}</span>
          <span className="tnum">{(data.uses ?? 0).toLocaleString()} uses</span>
        </p>
      </div>
    </Shell>
  );
});

// ─── shared ──────────────────────────────────────────────────────────────

function Faces({ ids }: { ids: string[] }) {
  return (
    <span className="flex items-center -space-x-1.5">
      {ids.slice(0, 3).map((id) => {
        const p = personById(id);
        return (
          <Avatar key={id} className="size-6 ring-2 ring-card">
            <AvatarFallback className="text-[9px]">
              {p?.initials ?? id.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        );
      })}
      {ids.length > 3 && (
        <span className="tnum pl-3 text-xs text-muted-foreground">+{ids.length - 3}</span>
      )}
    </span>
  );
}

export const nodeTypes = {
  party: PartyNode,
  outcome: OutcomeNode,
  work: WorkNode,
  doer: DoerNode,
  knowledge: KnowledgeNode,
  connection: ConnectionNode,
  skill: SkillNode,
};
