"use client";

/**
 * The board renders the five blocks. See BLOCKS.md.
 *
 * The board does not own the agent. It registers what it can do; the agent
 * lives in the layout and resolves intents against whatever is registered.
 * Three ways to do everything, one implementation each:
 *   drag a wire · act on a face · ask the agent
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";

import { useRegisterCapability } from "@/components/agent/agent-provider";
import { nodeTypes, type DoerData, type WorkData } from "@/components/board/block-nodes";
import { BoardActionsContext } from "@/components/board/board-context";
import { BoardOutline } from "@/components/board/board-outline";
import { Button } from "@/components/ui/button";
import { matchByName } from "@/lib/agent/parse";
import type { Capability, Intent, Reply } from "@/lib/agent/types";
import {
  cashPart,
  COLUMN,
  equityPart,
  resolveVerb,
  splitEven,
  VERB_LABEL,
  type BlockKind,
} from "@/lib/blocks";
import { formatMoney, money } from "@/lib/money";
import { personById, type Person } from "@/lib/people";

const SEED_NODES: Node[] = [
  {
    id: "party-1",
    type: "party",
    position: { x: COLUMN.party, y: 120 },
    data: { name: "Northwind Tools", mode: "company", detail: "Pre-seed · 2 founders", wants: 1 },
  },
  {
    id: "knowledge-1",
    type: "knowledge",
    position: { x: COLUMN.knowledge, y: 280 },
    data: { title: "Brand and voice guide", mode: "doc", chunks: 42 },
  },
  {
    id: "knowledge-2",
    type: "knowledge",
    position: { x: COLUMN.knowledge, y: 420 },
    data: {
      title: "We have $8k and 18 months of runway. Prefer equity where someone believes in it.",
      mode: "note",
      author: "Abin J",
    },
  },
  {
    id: "outcome-1",
    type: "outcome",
    position: { x: COLUMN.outcome, y: 260 },
    data: {
      text: "Pricing page converts better than it does now",
      measure: "Visit to trial",
      current: "1.2%",
      target: "2.5%",
    },
  },
  {
    id: "work-1",
    type: "work",
    position: { x: COLUMN.work, y: 0 },
    data: {
      title: "Redesign the pricing page",
      reward: [money(45_000, "USD")],
      state: "in_review",
      doers: ["worker-1"],
      skills: ["Design", "Webflow"],
      verdict: "changes",
      criteriaMet: [4, 5],
    },
  },
  {
    id: "work-2",
    type: "work",
    position: { x: COLUMN.work, y: 300 },
    data: {
      // Cash is short, so this one is priced mostly in ownership.
      title: "Rewrite tier copy for value-led positioning",
      reward: [money(60_000, "USD"), money(150, "EQUITY")],
      state: "offered",
      doers: [],
      skills: ["Copy", "Positioning"],
    },
  },
  {
    id: "work-3",
    type: "work",
    position: { x: COLUMN.work, y: 600 },
    data: {
      title: "Instrument the funnel and report a baseline",
      reward: [money(250, "EQUITY")],
      state: "offered",
      doers: [],
      skills: ["Analytics", "SQL"],
    },
  },
  {
    id: "worker-1",
    type: "doer",
    position: { x: COLUMN.doer, y: 100 },
    data: {
      name: "Priya N",
      mode: "human",
      initials: "PN",
      capabilities: ["Design", "Webflow"],
      available: true,
      appetite: "either",
    },
  },
  {
    id: "worker-2",
    type: "doer",
    position: { x: COLUMN.doer, y: 280 },
    data: {
      name: "Marco S",
      mode: "human",
      initials: "MS",
      capabilities: ["Copy", "Positioning"],
      available: true,
      appetite: "equity",
    },
  },
  {
    id: "agent-review",
    type: "doer",
    position: { x: COLUMN.doer, y: 460 },
    data: {
      name: "Review Agent",
      mode: "agent",
      initials: "RA",
      capabilities: ["Review", "Criteria checking"],
      model: "gemini-pro",
      owns: "whether work meets the bar",
      runs: 38,
      autonomyLimit: 6,
      onLimit: "ask",
    },
  },
];

const SEED_EDGES: Edge[] = [
  { id: "e1", source: "party-1", target: "outcome-1", data: { verb: "wants" } },
  { id: "e2", source: "knowledge-1", target: "outcome-1", data: { verb: "informs" } },
  { id: "e3", source: "knowledge-2", target: "outcome-1", data: { verb: "informs" } },
  { id: "e4", source: "outcome-1", target: "work-1", data: { verb: "becomes" } },
  { id: "e5", source: "outcome-1", target: "work-2", data: { verb: "becomes" } },
  { id: "e6", source: "outcome-1", target: "work-3", data: { verb: "becomes" } },
  { id: "e7", source: "worker-1", target: "work-1", data: { verb: "does" } },
  { id: "e8", source: "agent-review", target: "work-1", data: { verb: "does" } },
];

const TEAM_NAMES = ["Pricing pod", "Landing crew", "Funnel squad"];

function Board() {
  const [nodes, setNodes, onNodesChange] = useNodesState(SEED_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(SEED_EDGES);
  const seq = useRef(0);

  const kindOf = useCallback(
    (id: string): BlockKind | null =>
      (nodes.find((n) => n.id === id)?.type as BlockKind) ?? null,
    [nodes],
  );

  const workIndex = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "work")
        .map((n) => ({ id: n.id, name: (n.data as WorkData).title })),
    [nodes],
  );

  const doerIndex = useMemo(
    () =>
      nodes
        .filter((n) => n.type === "doer")
        .map((n) => ({ id: n.id, name: (n.data as DoerData).name })),
    [nodes],
  );

  const allIndex = useMemo(
    () => nodes.map((n) => ({ id: n.id, name: label(n) })),
    [nodes],
  );

  // ─── actions: one implementation, three callers ─────────────────────────

  const assign = useCallback(
    (workId: string, person: Person, viaAgent: boolean) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== workId) return n;
          const d = n.data as WorkData;
          if (d.doers.includes(person.id)) return n;
          return {
            ...n,
            data: {
              ...d,
              doers: [...d.doers, person.id],
              state: d.state === "offered" ? "doing" : d.state,
            },
          };
        }),
      );

      setEdges((eds) =>
        eds.some((e) => e.source === person.id && e.target === workId)
          ? eds
          : [
              ...eds,
              {
                id: `e-${person.id}-${workId}`,
                source: person.id,
                target: workId,
                data: { verb: "does" },
              },
            ],
      );

      toast.success(`${person.name} is on it`, {
        description: viaAgent
          ? "Agent picked the closest fit. Change it from the face."
          : "Brief written. They see only this work's context.",
      });
    },
    [setNodes, setEdges],
  );

  const unassign = useCallback(
    (workId: string, doerId: string) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== workId) return n;
          const d = n.data as WorkData;
          return { ...n, data: { ...d, doers: d.doers.filter((x) => x !== doerId) } };
        }),
      );
      setEdges((eds) => eds.filter((e) => !(e.source === doerId && e.target === workId)));
    },
    [setNodes, setEdges],
  );

  const focus = useCallback(
    (nodeId: string) => {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === nodeId })));
    },
    [setNodes],
  );

  /** Doer to Doer makes a team. A member may be a person or an agent. */
  const formTeam = useCallback(
    (aId: string, bId: string): string | null => {
      const a = nodes.find((n) => n.id === aId);
      const b = nodes.find((n) => n.id === bId);
      if (!a || !b || a.type !== "doer" || b.type !== "doer") return null;

      const da = a.data as DoerData;
      const db = b.data as DoerData;
      const shares = splitEven(2);
      const teamId = `team-${Date.now().toString(36)}-${seq.current++}`;
      const name = TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)];

      setNodes((ns) => [
        ...ns,
        {
          id: teamId,
          type: "doer",
          position: {
            x: Math.round((a.position.x + b.position.x) / 2) + 280,
            y: Math.round((a.position.y + b.position.y) / 2),
          },
          data: {
            name,
            mode: "team",
            initials: name.slice(0, 2).toUpperCase(),
            capabilities: Array.from(new Set([...da.capabilities, ...db.capabilities])),
            members: [
              { initials: da.initials, shareBps: shares[0], mode: da.mode },
              { initials: db.initials, shareBps: shares[1], mode: db.mode },
            ],
            readers: 2,
          } satisfies DoerData,
        },
      ]);

      setEdges((eds) => [
        ...eds,
        { id: `e-${aId}-${teamId}`, source: aId, target: teamId, data: { verb: "teams-with" } },
        { id: `e-${bId}-${teamId}`, source: bId, target: teamId, data: { verb: "teams-with" } },
      ]);

      toast.success(`${name} formed`, {
        description: "One brief, one thread, reward split 50/50 — cash or equity alike.",
      });
      return name;
    },
    [nodes, setNodes, setEdges],
  );

  const createBlock = useCallback(
    (kind: BlockKind, mode: string | undefined, text: string): string => {
      const id = `${kind}-${Date.now().toString(36)}-${seq.current++}`;
      const y = 800 + seq.current * 40;

      const data: Record<string, unknown> =
        kind === "outcome"
          ? { text }
          : kind === "work"
            ? { title: text, reward: [], state: "draft", doers: [], skills: [] }
            : kind === "knowledge"
              ? { title: text, mode: mode ?? "note", author: "You", chunks: 0 }
              : kind === "party"
                ? { name: text, mode: mode ?? "client", detail: "—", wants: 0 }
                : {
                    name: text,
                    mode: mode ?? "human",
                    initials: text.slice(0, 2).toUpperCase(),
                    capabilities: [],
                    available: true,
                    appetite: "either",
                  };

      setNodes((ns) => [...ns, { id, type: kind, position: { x: COLUMN[kind], y }, data }]);
      return id;
    },
    [setNodes],
  );

  // ─── wires ─────────────────────────────────────────────────────────────

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const from = kindOf(c.source);
      const to = kindOf(c.target);
      if (!from || !to || c.source === c.target) return false;
      return resolveVerb(from, to) !== null;
    },
    [kindOf],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const from = kindOf(c.source);
      const to = kindOf(c.target);
      if (!from || !to) return;

      const verb = resolveVerb(from, to);
      if (!verb) return;

      if (verb === "teams-with") {
        formTeam(c.source, c.target);
        return;
      }

      if (verb === "does" && from === "doer") {
        const person = personById(c.source);
        if (person) {
          assign(c.target, person, false);
          return;
        }
      }

      setEdges((eds) => addEdge({ ...c, data: { verb } }, eds));
    },
    [kindOf, setEdges, formTeam, assign],
  );

  // ─── what the agent can do here ────────────────────────────────────────

  function runOnBoard(intent: Intent): Reply {
    switch (intent.verb) {
      case "assign": {
        const d = matchByName(intent.doer, doerIndex);
        const w = matchByName(intent.work, workIndex);
        if (!d) {
          return {
            text: `No doer called "${intent.doer}" here. People has the full directory.`,
            tone: "warning",
          };
        }
        if (!w) {
          return {
            text: `Which work? There are ${workIndex.length}: ${workIndex.map((x) => x.name).join("; ")}.`,
            tone: "warning",
          };
        }
        const person = personById(d.id);
        if (person) assign(w.id, person, false);
        return {
          text: `${d.name} now does "${w.name}". Brief written, and they see only that work's context.`,
          tone: "success",
        };
      }

      case "team": {
        const found = intent.doers.map((q) => matchByName(q, doerIndex));
        const [a, b] = found;
        if (!a || !b) {
          return {
            text: `I need two doers that are both here. Found ${found.filter(Boolean).length} of 2. A doer can be a person or an agent.`,
            tone: "warning",
          };
        }
        const name = formTeam(a.id, b.id);
        return {
          text: `${name ?? "Team"} formed from ${a.name} and ${b.name}. One brief, reward split 50/50.`,
          tone: "success",
        };
      }

      case "connect": {
        const a = matchByName(intent.from, allIndex);
        const b = matchByName(intent.to, allIndex);
        if (!a || !b) return { text: `I couldn't find both of those.`, tone: "warning" };

        const from = kindOf(a.id);
        const to = kindOf(b.id);
        const verb = from && to ? resolveVerb(from, to) : null;
        if (!verb) {
          return {
            text: `A ${from} can't connect to a ${to}. There are only six relationships and that isn't one.`,
            tone: "warning",
          };
        }
        if (verb === "teams-with") formTeam(a.id, b.id);
        else
          setEdges((eds) => [
            ...eds,
            { id: `e-${a.id}-${b.id}`, source: a.id, target: b.id, data: { verb } },
          ]);
        return { text: `${a.name} ${VERB_LABEL[verb]} ${b.name}.`, tone: "success" };
      }

      case "create": {
        const id = createBlock(intent.kind, intent.mode, intent.text);
        focus(id);
        return {
          text:
            intent.kind === "outcome"
              ? `Added it. Give it a measure — an outcome without one is a wish.`
              : intent.kind === "work"
                ? `Added "${intent.text}". No reward set yet: cash, equity, or both.`
                : `Added ${intent.kind}: "${intent.text}".`,
          tone: intent.kind === "work" || intent.kind === "outcome" ? "warning" : "success",
        };
      }

      case "fund": {
        const w = matchByName(intent.work, workIndex);
        if (w) focus(w.id);
        return {
          text: w
            ? `I've selected "${w.name}". Committing cash or granting equity is yours to confirm — I don't move value from a sentence.`
            : `Which work? Either way, committing value needs your confirm.`,
          tone: "warning",
        };
      }

      case "report":
        return report(intent.topic);

      default:
        return { text: "I can't do that here.", tone: "warning" };
    }
  }

  function report(topic: "status" | "money" | "people" | "knowledge"): Reply {
    const work = nodes.filter((n) => n.type === "work");
    const open = work.filter((n) => (n.data as WorkData).doers.length === 0);

    if (topic === "status") {
      const reviewing = work.filter((n) => (n.data as WorkData).state === "in_review");
      return {
        text:
          `${work.length} pieces of work. ${open.length} open, ${reviewing.length} under review.\n\n` +
          (open.length
            ? `Nobody on: ${open.map((n) => (n.data as WorkData).title).join("; ")}.`
            : `Everything has someone on it.`),
      };
    }

    if (topic === "money") {
      const cash = work
        .map((n) => cashPart((n.data as WorkData).reward))
        .filter(Boolean)
        .reduce((n, m) => n + (m?.amount ?? 0), 0);
      const eq = work
        .map((n) => equityPart((n.data as WorkData).reward))
        .filter(Boolean)
        .reduce((n, m) => n + (m?.amount ?? 0), 0);

      return {
        text:
          `Committed across all work: ${formatMoney(money(cash, "USD"))} in cash and ` +
          `${formatMoney(money(eq, "EQUITY"))} in equity.\n\n` +
          `${work.filter((n) => equityPart((n.data as WorkData).reward)).length} of ${work.length} are part-paid in ownership, which is how this gets done on ${formatMoney(money(cash, "USD"))} instead of a raise.`,
      };
    }

    if (topic === "people") {
      const doers = nodes.filter((n) => n.type === "doer");
      return {
        text: doers
          .map((n) => {
            const d = n.data as DoerData;
            const on = work
              .filter((w) => (w.data as WorkData).doers.includes(n.id))
              .map((w) => (w.data as WorkData).title);
            const takes = d.mode === "human" ? ` · ${d.appetite ?? "cash"}` : "";
            return `${d.name} (${d.mode}${takes})${on.length ? ` — on ${on.join("; ")}` : " — free"}`;
          })
          .join("\n"),
      };
    }

    const know = nodes.filter((n) => n.type === "knowledge");
    return {
      text: know.length
        ? know.map((n) => (n.data as { title: string }).title).join("\n")
        : "Nothing in the Brain yet.",
    };
  }

  const capability = useMemo<Capability>(
    () => ({
      id: "board.blocks",
      surface: "/demo/board",
      describe: "create, connect, assign, team up, and report on the board",
      can: (i) =>
        ["create", "connect", "assign", "team", "fund", "report"].includes(i.verb),
      run: runOnBoard,
    }),
    // runOnBoard reads nodes and edges, so it is rebuilt when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges],
  );
  useRegisterCapability(capability);

  const actions = useMemo(() => ({ assign, unassign, focus }), [assign, unassign, focus]);

  return (
    <BoardActionsContext.Provider value={actions}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        fitView
        className="bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </BoardActionsContext.Provider>
  );
}

function label(n: Node): string {
  const d = n.data as Record<string, unknown>;
  return (d.title as string) ?? (d.name as string) ?? (d.text as string) ?? n.id;
}

export default function BoardPage() {
  const [view, setView] = useState<"board" | "outline">("board");

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-[1400px] flex-col">
      <header className="flex flex-wrap items-baseline justify-between gap-6">
        <div>
          <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">
            Board
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Someone wants an outcome. It becomes work. A person or an agent does
            it, and gets paid in cash, equity, or both.
          </p>
        </div>

        <div role="group" aria-label="View" className="flex gap-1">
          <Button
            variant={view === "board" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("board")}
            aria-pressed={view === "board"}
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
            Board
          </Button>
          <Button
            variant={view === "outline" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setView("outline")}
            aria-pressed={view === "outline"}
          >
            <List className="size-4" aria-hidden="true" />
            Outline
          </Button>
        </div>
      </header>

      <div className="mt-8 min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">
        {view === "board" ? (
          <ReactFlowProvider>
            <Board />
          </ReactFlowProvider>
        ) : (
          <div className="h-full overflow-auto p-8">
            <BoardOutline nodes={SEED_NODES} edges={SEED_EDGES} />
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Outline carries the same graph, keyboard operable, and is the layout below
        1024px. Press ⌘K to ask the agent from any screen.
      </p>
    </div>
  );
}
