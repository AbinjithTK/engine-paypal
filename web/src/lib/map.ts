/**
 * The Map. Columns of blocks, and the ties between them.
 *
 * Inspired by access maps, but the columns mean something different here. An
 * access map shows a permission hierarchy. This shows a VALUE CHAIN, left to
 * right, in the order the four-line model reads:
 *
 *   Party → Outcome → Work → Doer → Equipment
 *
 * Which makes the three tie styles specific to us rather than decorative:
 *
 *   direct     — the link exists. Marco does this work.
 *   inherited  — it reaches them transitively. Marco can read the brand guide
 *                because it informs the outcome his work came from. This is a
 *                real chain in our model, and it is how CONTEXT REACHES A
 *                PERSON, so the map doubles as the answer to "what can they
 *                see?" (prd.md §7.2).
 *   available  — it could be linked. This person's skills fit this work AND
 *                they will take the reward on offer. That is the Matching
 *                Agent drawn as a picture instead of returned as a list.
 *
 * No positions. Columns are computed, so there is nothing for a user to
 * arrange and nothing to persist.
 */

import { appetiteFits, type BlockKind, type Reward, type RewardAppetite } from "./blocks";
import { cashPart, equityPart } from "./blocks";
import { formatMoney } from "./money";
import { allBlocks, allLinks, type Block } from "./store";

export type Tie = "direct" | "inherited" | "available";

export type MapItem = {
  id: string;
  kind: BlockKind;
  mode?: string;
  label: string;
  sub: string;
  /** Right-aligned count or amount. */
  badge?: string;
  /** Equity on offer, rendered distinctly. */
  equity?: string;
};

export type MapColumn = { id: string; label: string; items: MapItem[] };

export type MapEdge = { from: string; to: string; tie: Tie; verb: string };

const COLUMN_SPEC: { id: string; label: string; kinds: BlockKind[] }[] = [
  { id: "parties", label: "Parties", kinds: ["party"] },
  { id: "outcomes", label: "Outcomes", kinds: ["outcome"] },
  { id: "work", label: "Work", kinds: ["work"] },
  { id: "doers", label: "Doers", kinds: ["doer"] },
  { id: "equipment", label: "Equipment", kinds: ["knowledge", "connection", "skill"] },
];

// ─── labels ──────────────────────────────────────────────────────────────

function describe(b: Block, links: ReturnType<typeof allLinks>): MapItem {
  const d = b.data as Record<string, unknown>;
  const degree = links.filter((l) => l.from === b.id || l.to === b.id).length;

  switch (b.kind) {
    case "party":
      return {
        id: b.id,
        kind: b.kind,
        mode: b.mode,
        label: String(d.name ?? b.id),
        sub: String(d.detail ?? b.mode ?? ""),
        badge: `${links.filter((l) => l.from === b.id).length} outcomes`,
      };

    case "outcome":
      return {
        id: b.id,
        kind: b.kind,
        label: String(d.text ?? b.id),
        sub: d.measure
          ? `${d.measure}: ${d.current ?? "—"} → ${d.target ?? "—"}`
          : "no measure yet",
        badge: `${links.filter((l) => l.from === b.id && l.verb === "becomes").length} work`,
      };

    case "work": {
      const reward = (d.reward ?? []) as Reward;
      const cash = cashPart(reward);
      const eq = equityPart(reward);
      const doers = (d.doers ?? []) as string[];
      return {
        id: b.id,
        kind: b.kind,
        label: String(d.title ?? b.id),
        sub: `${String(d.state ?? "")}${doers.length ? ` · ${doers.length} on it` : " · nobody on it"}`,
        badge: cash ? formatMoney(cash) : undefined,
        equity: eq ? formatMoney(eq) : undefined,
      };
    }

    case "doer": {
      const caps = (d.capabilities ?? []) as string[];
      return {
        id: b.id,
        kind: b.kind,
        mode: b.mode,
        label: String(d.name ?? b.id),
        sub:
          b.mode === "agent"
            ? `${String(d.model ?? "")} · ${String(d.runs ?? 0)} runs`
            : `${caps.slice(0, 2).join(", ")}${d.appetite ? ` · takes ${d.appetite}` : ""}`,
        badge: `${links.filter((l) => l.from === b.id && l.verb === "does").length} work`,
      };
    }

    default:
      return {
        id: b.id,
        kind: b.kind,
        mode: b.mode,
        label: String(d.name ?? d.title ?? b.id),
        sub: String(b.mode ?? b.kind),
        badge: degree ? `${degree} links` : undefined,
      };
  }
}

// ─── inheritance ─────────────────────────────────────────────────────────

/**
 * Ties that are not stored but are true.
 *
 * Equipment on an outcome reaches the work that outcome became. Equipment on
 * work reaches whoever does it. That second hop is the important one: it is
 * exactly what a person can read, which is a security question, not a
 * visualisation nicety.
 */
function inheritedEdges(links: ReturnType<typeof allLinks>): MapEdge[] {
  const out: MapEdge[] = [];
  const equips = links.filter(
    (l) => l.verb === "informs" || l.verb === "powers" || l.verb === "teaches",
  );
  const becomes = links.filter((l) => l.verb === "becomes");
  const does = links.filter((l) => l.verb === "does");

  // equipment → outcome, inherited by the work it became
  for (const e of equips) {
    for (const b of becomes.filter((x) => x.from === e.to)) {
      if (!equips.some((x) => x.from === e.from && x.to === b.to)) {
        out.push({ from: e.from, to: b.to, tie: "inherited", verb: e.verb });
      }
    }
  }

  // equipment on work → inherited by the doers on that work
  const workEquip = [...equips, ...out];
  for (const e of workEquip) {
    for (const d of does.filter((x) => x.to === e.to)) {
      if (!out.some((x) => x.from === e.from && x.to === d.from)) {
        out.push({ from: e.from, to: d.from, tie: "inherited", verb: e.verb });
      }
    }
  }

  return out;
}

/**
 * What could be linked but is not.
 *
 * Only doer↔work, only for open work, and only when the reward actually suits
 * them. Showing a match to someone who will not take equity is noise.
 */
function availableEdges(blocks: Block[], links: ReturnType<typeof allLinks>): MapEdge[] {
  const out: MapEdge[] = [];
  const work = blocks.filter((b) => b.kind === "work");
  const doers = blocks.filter((b) => b.kind === "doer");

  for (const w of work) {
    const wd = w.data as { state?: string; skills?: string[]; reward?: Reward };
    if (wd.state !== "offered") continue;

    for (const d of doers) {
      if (links.some((l) => l.from === d.id && l.to === w.id)) continue;

      const dd = d.data as { capabilities?: string[]; appetite?: RewardAppetite };
      const overlap = (dd.capabilities ?? []).some((c) =>
        (wd.skills ?? []).some((s) => s.toLowerCase() === c.toLowerCase()),
      );
      if (!overlap) continue;
      if (dd.appetite && !appetiteFits(dd.appetite, wd.reward ?? [])) continue;

      out.push({ from: d.id, to: w.id, tie: "available", verb: "could do" });
    }
  }

  return out;
}

// ─── build ───────────────────────────────────────────────────────────────

export type MapData = { columns: MapColumn[]; edges: MapEdge[] };

export function buildMap(): MapData {
  const blocks = allBlocks();
  const links = allLinks();

  const columns: MapColumn[] = COLUMN_SPEC.map((spec) => ({
    id: spec.id,
    label: spec.label,
    items: blocks
      .filter((b) => spec.kinds.includes(b.kind))
      .map((b) => describe(b, links))
      // Most-connected first, so the busy things are easy to find.
      .sort(
        (a, z) =>
          links.filter((l) => l.from === z.id || l.to === z.id).length -
          links.filter((l) => l.from === a.id || l.to === a.id).length,
      ),
  }));

  const direct: MapEdge[] = links.map((l) => ({
    from: l.from,
    to: l.to,
    tie: "direct" as const,
    verb: l.verb,
  }));

  return {
    columns,
    edges: [...direct, ...inheritedEdges(links), ...availableEdges(blocks, links)],
  };
}

// ─── focus ───────────────────────────────────────────────────────────────

/**
 * Everything a block touches, following direct and inherited ties in both
 * directions. `available` is excluded: it is a suggestion, not a fact.
 */
export function reachFrom(id: string, edges: MapEdge[]): Set<string> {
  const real = edges.filter((e) => e.tie !== "available");
  const seen = new Set([id]);
  const queue = [id];

  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of real) {
      const next = e.from === cur ? e.to : e.to === cur ? e.from : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * The security answer, and the reason this view earns its place: what can this
 * person actually read? Direct plus inherited, never the whole company.
 */
export function readableBy(doerId: string, data: MapData): { count: number; total: number; titles: string[] } {
  const equipmentIds = new Set(
    data.columns.find((c) => c.id === "equipment")?.items.map((i) => i.id) ?? [],
  );

  const titles = data.edges
    .filter((e) => e.tie !== "available" && e.to === doerId && equipmentIds.has(e.from))
    .map((e) => {
      const col = data.columns.find((c) => c.id === "equipment");
      return col?.items.find((i) => i.id === e.from)?.label ?? e.from;
    });

  const unique = Array.from(new Set(titles));
  return { count: unique.length, total: equipmentIds.size, titles: unique };
}

export const TIE_LABEL: Record<Tie, string> = {
  direct: "Direct",
  inherited: "Inherited",
  available: "Available",
};
