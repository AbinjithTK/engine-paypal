"use client";

/**
 * The Map. See lib/map.ts for the model.
 *
 * Columns are computed from block kind, so there are no positions to arrange
 * and nothing to persist. Cards are real buttons, so the whole map is
 * keyboard operable — clicking one focuses it and Escape clears.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bot, PieChart, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  readableBy,
  reachFrom,
  TIE_LABEL,
  type MapData,
  type MapEdge,
  type Tie,
} from "@/lib/map";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };
type Anchors = Record<string, { left: Point; right: Point }>;

const TIE_STYLE: Record<Tie, { stroke: string; dash?: string; width: number }> = {
  direct: { stroke: "var(--primary)", width: 1.5 },
  inherited: { stroke: "var(--muted-foreground)", dash: "5 4", width: 1.25 },
  available: { stroke: "var(--muted-foreground)", dash: "1 5", width: 1.25 },
};

/**
 * `data` is required and built on the server, so the store never gets bundled
 * into the client. One source of truth, unlike the board (GAPS.md gap 2).
 */
export function BlockMap({ data: map }: { data: MapData }) {

  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [anchors, setAnchors] = useState<Anchors>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const matches = useCallback(
    (label: string, sub: string) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return label.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
    },
    [query],
  );

  // Measure once laid out, and again on resize. Cheap: a handful of rects.
  const measure = useCallback(() => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;

    const next: Anchors = {};
    cardRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next[id] = {
        left: { x: r.left - box.left, y: r.top - box.top + r.height / 2 },
        right: { x: r.right - box.left, y: r.top - box.top + r.height / 2 },
      };
    });
    setAnchors(next);
    setSize({ w: box.width, h: containerRef.current?.scrollHeight ?? box.height });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, map, query]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && focus) setFocus(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  const reach = useMemo(
    () => (focus ? reachFrom(focus, map.edges) : null),
    [focus, map.edges],
  );

  const active = focus ?? hover;

  const visibleEdges = useMemo(
    () =>
      map.edges.filter((e) => {
        // "Available" is a suggestion, so it only appears when you ask.
        if (e.tie === "available") return focus === e.from || focus === e.to;
        if (!focus) return true;
        return reach?.has(e.from) && reach?.has(e.to);
      }),
    [map.edges, focus, reach],
  );

  const focusedItem = useMemo(() => {
    if (!focus) return null;
    for (const c of map.columns) {
      const i = c.items.find((x) => x.id === focus);
      if (i) return i;
    }
    return null;
  }, [focus, map.columns]);

  const readable = useMemo(
    () => (focusedItem?.kind === "doer" ? readableBy(focusedItem.id, map) : null),
    [focusedItem, map],
  );

  return (
    <div className="flex h-full flex-col">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the map"
            aria-label="Search the map"
            className="h-9 pl-9"
          />
        </div>

        {focus && (
          <Button variant="outline" size="sm" onClick={() => setFocus(null)}>
            <X className="size-3.5" aria-hidden="true" />
            Clear focus
          </Button>
        )}
      </div>

      {/* the answer bar: what does focusing actually tell you */}
      {focusedItem && (
        <div className="border-b bg-muted/30 px-5 py-3" aria-live="polite">
          <p className="text-sm">
            <span className="font-medium">{focusedItem.label}</span>
            <span className="text-muted-foreground">
              {" "}
              touches {(reach?.size ?? 1) - 1} other blocks
            </span>
          </p>
          {readable && (
            <p className="mt-1 text-sm text-muted-foreground">
              Can read{" "}
              <span className="tnum text-foreground">
                {readable.count} of {readable.total}
              </span>{" "}
              pieces of company context
              {readable.titles.length > 0 && `: ${readable.titles.join(", ")}`}. Nothing
              else about the company is reachable.
            </p>
          )}
        </div>
      )}

      {/* the map */}
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto p-5">
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          aria-hidden="true"
        >
          {visibleEdges.map((e, i) => {
            const a = anchors[e.from];
            const b = anchors[e.to];
            if (!a || !b) return null;
            return (
              <Curve
                key={`${e.from}-${e.to}-${e.tie}-${i}`}
                from={a.right}
                to={b.left}
                tie={e.tie}
                lit={Boolean(active && (e.from === active || e.to === active))}
                dimmed={Boolean(active && e.from !== active && e.to !== active)}
              />
            );
          })}
        </svg>

        <div className="relative flex gap-6">
          {map.columns.map((col) => (
            <section key={col.id} className="w-[220px] shrink-0" aria-labelledby={`c-${col.id}`}>
              <h3
                id={`c-${col.id}`}
                className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {col.label}
                <span className="tnum ml-1.5 opacity-60">{col.items.length}</span>
              </h3>

              <ul className="space-y-2">
                {col.items.map((item) => {
                  const filteredOut = !matches(item.label, item.sub);
                  const outOfReach = Boolean(reach && !reach.has(item.id));

                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) cardRefs.current.set(item.id, el);
                          else cardRefs.current.delete(item.id);
                        }}
                        onClick={() => setFocus(focus === item.id ? null : item.id)}
                        onMouseEnter={() => setHover(item.id)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(item.id)}
                        onBlur={() => setHover(null)}
                        aria-pressed={focus === item.id}
                        className={cn(
                          "w-full rounded-xl border bg-card p-3 text-left",
                          "transition-[opacity,border-color] duration-[var(--dur-panel)] ease-[var(--ease-out)]",
                          focus === item.id && "border-primary",
                          (filteredOut || outOfReach) && "opacity-25",
                        )}
                      >
                        <span className="flex items-start gap-2">
                          {item.mode === "agent" && (
                            <Bot
                              className="mt-0.5 size-3 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {item.label}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {item.sub}
                            </span>
                          </span>
                        </span>

                        {(item.badge || item.equity) && (
                          <span className="mt-2 flex flex-wrap items-center gap-1.5">
                            {item.badge && (
                              <span
                                data-slot="money"
                                className="text-xs text-muted-foreground"
                              >
                                {item.badge}
                              </span>
                            )}
                            {item.equity && (
                              <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/8 px-1.5 text-xs font-medium text-primary">
                                <PieChart className="size-2.5" aria-hidden="true" />
                                <span data-slot="money">{item.equity}</span>
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-5 py-3 text-xs text-muted-foreground">
        <span>Click a block to focus. Escape clears.</span>
        {(["direct", "inherited", "available"] as Tie[]).map((t) => (
          <span key={t} className="flex items-center gap-2">
            <svg width="26" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="26"
                y2="3"
                stroke={TIE_STYLE[t].stroke}
                strokeWidth={TIE_STYLE[t].width}
                strokeDasharray={TIE_STYLE[t].dash}
              />
            </svg>
            {TIE_LABEL[t]}
            {t === "inherited" && " (context reaching a person)"}
            {t === "available" && " (would take this work)"}
          </span>
        ))}
      </div>
    </div>
  );
}

function Curve({
  from,
  to,
  tie,
  lit,
  dimmed,
}: {
  from: Point;
  to: Point;
  tie: Tie;
  lit: boolean;
  dimmed: boolean;
}) {
  const s = TIE_STYLE[tie];
  // Backward links (a doer to earlier work) still read cleanly with a wide bow.
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 30);

  return (
    <path
      d={`M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`}
      fill="none"
      stroke={s.stroke}
      strokeWidth={lit ? s.width + 0.75 : s.width}
      strokeDasharray={s.dash}
      opacity={dimmed ? 0.12 : lit ? 0.95 : 0.4}
      className="transition-opacity duration-[var(--dur-panel)] ease-[var(--ease-out)]"
    />
  );
}

export type { MapEdge };
