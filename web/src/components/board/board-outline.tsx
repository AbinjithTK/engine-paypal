"use client";

/**
 * Outline view.
 *
 * A canvas is pointer-only and DESIGN.md §8 does not bend, so the board ships
 * with a second renderer over the SAME data. Real semantics, nested lists,
 * fully keyboard operable. This is also the layout below 1024px.
 */

import type { Edge, Node } from "@xyflow/react";

import { EquityChip } from "@/components/board/block-nodes";
import { MoneyAmount } from "@/components/money-badge";
import {
  cashPart,
  equityPart,
  VERB_LABEL,
  WORK_STATE,
  type BlockKind,
  type Reward,
  type Verb,
  type Verdict,
  type WorkState,
} from "@/lib/blocks";

type Props = { nodes: Node[]; edges: Edge[] };

const VERDICT_TEXT: Record<Verdict, string> = {
  pass: "passed review",
  changes: "changes requested",
  fail: "failed review",
};

export function BoardOutline({ nodes, edges }: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const verbOf = (e: Edge) => (e.data as { verb?: Verb } | undefined)?.verb;
  const of = (kind: BlockKind) => nodes.filter((n) => n.type === kind);

  const incoming = (id: string, verb: Verb) =>
    edges
      .filter((e) => e.target === id && verbOf(e) === verb)
      .map((e) => byId.get(e.source))
      .filter((n): n is Node => Boolean(n));

  const outgoing = (id: string, verb: Verb) =>
    edges
      .filter((e) => e.source === id && verbOf(e) === verb)
      .map((e) => byId.get(e.target))
      .filter((n): n is Node => Boolean(n));

  return (
    <div className="max-w-[72ch] space-y-12">
      {of("outcome").map((outcome) => {
        const od = outcome.data as {
          text: string;
          measure?: string;
          current?: string;
          target?: string;
        };
        const wants = incoming(outcome.id, "wants");
        const informs = incoming(outcome.id, "informs");

        return (
          <section key={outcome.id} aria-labelledby={`h-${outcome.id}`}>
            <h2
              id={`h-${outcome.id}`}
              className="text-lg font-medium leading-snug tracking-tight"
            >
              {od.text}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {od.measure
                ? `${od.measure}: ${od.current ?? "—"} → ${od.target ?? "—"}`
                : "No measure yet, so this is a wish rather than an outcome."}
            </p>
            {wants.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Wanted by {wants.map(name).join(", ")}
              </p>
            )}
            {informs.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Informed by {informs.map(name).join("; ")}
              </p>
            )}

            <ul className="mt-5 space-y-3">
              {outgoing(outcome.id, "becomes").map((w) => {
                const wd = w.data as {
                  title: string;
                  reward: Reward;
                  state: WorkState;
                  verdict?: Verdict;
                  criteriaMet?: [number, number];
                };
                const doers = incoming(w.id, "does");
                const cash = cashPart(wd.reward);
                const eq = equityPart(wd.reward);

                return (
                  <li key={w.id} className="rounded-xl border bg-card px-5 py-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                      <span className="font-medium">{wd.title}</span>
                      <span className="flex items-center gap-2">
                        {cash && <MoneyAmount value={cash} />}
                        {eq && <EquityChip value={eq} />}
                        {!cash && !eq && (
                          <span className="text-xs text-muted-foreground">
                            No reward set
                          </span>
                        )}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {WORK_STATE[wd.state].label}
                      {wd.criteriaMet &&
                        ` · ${wd.criteriaMet[0]} of ${wd.criteriaMet[1]} criteria met`}
                      {wd.verdict && ` · ${VERDICT_TEXT[wd.verdict]}`}
                    </p>

                    <p className="mt-2 text-sm text-muted-foreground">
                      {doers.length > 0
                        ? doers.map(doerLine).join(" · ")
                        : "Nobody on it yet"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <BlockList
        id="doers"
        heading="Doers"
        items={of("doer").map((n) => ({
          id: n.id,
          primary: name(n),
          secondary: doerDetail(n),
        }))}
      />

      <BlockList
        id="knowledge"
        heading="Knowledge"
        items={of("knowledge").map((n) => {
          const d = n.data as { title: string; mode: string; chunks?: number };
          return {
            id: n.id,
            primary: d.title,
            secondary: `${d.mode}${d.chunks ? ` · ${d.chunks.toLocaleString()} chunks` : ""}`,
          };
        })}
      />

      <BlockList
        id="parties"
        heading="Parties"
        items={of("party").map((n) => {
          const d = n.data as { name: string; mode: string; detail: string };
          return { id: n.id, primary: d.name, secondary: `${d.mode} · ${d.detail}` };
        })}
      />

      <section aria-labelledby="h-grammar" className="border-t pt-8">
        <h2 id="h-grammar" className="text-lg font-medium tracking-tight">
          How this fits together
        </h2>
        <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          {edges.map((e) => {
            const v = verbOf(e);
            const a = byId.get(e.source);
            const b = byId.get(e.target);
            if (!v || !a || !b) return null;
            return (
              <li key={e.id}>
                <span className="text-foreground">{name(a)}</span> {VERB_LABEL[v]}{" "}
                <span className="text-foreground">{name(b)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function name(n: Node): string {
  const d = n.data as Record<string, unknown>;
  return (d.title as string) ?? (d.name as string) ?? (d.text as string) ?? n.id;
}

function doerLine(n: Node): string {
  return name(n);
}

function doerDetail(n: Node): string {
  const d = n.data as {
    mode: string;
    capabilities?: string[];
    available?: boolean;
    appetite?: string;
    model?: string;
    owns?: string;
    members?: { initials: string; shareBps: number }[];
    readers?: number;
  };

  if (d.mode === "agent") return `Agent · ${d.model ?? "—"} · owns ${d.owns ?? "—"}`;
  if (d.mode === "team") {
    const split = (d.members ?? [])
      .map((m) => `${m.initials} ${(m.shareBps / 100).toFixed(0)}%`)
      .join(" / ");
    return `Team · ${split} · ${d.readers ?? 0} on the brief`;
  }
  return `Person · ${(d.capabilities ?? []).join(", ")} · takes ${d.appetite ?? "cash"} · ${
    d.available ? "available" : "unavailable"
  }`;
}

function BlockList({
  id,
  heading,
  items,
}: {
  id: string;
  heading: string;
  items: { id: string; primary: string; secondary: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className="text-lg font-medium tracking-tight">
        {heading}
      </h2>
      <ul className="mt-4 space-y-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-xl border bg-card px-5 py-4">
            <p className="text-sm font-medium">{i.primary}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i.secondary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
