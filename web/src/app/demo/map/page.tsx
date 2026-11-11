/**
 * The Map. A server component, so it reads the store directly and the client
 * gets data rather than a duplicate of the store.
 */

import { BlockMap } from "@/components/map/block-map";
import { buildMap } from "@/lib/map";

export default function MapPage() {
  const data = buildMap();

  const counts = data.edges.reduce<Record<string, number>>((acc, e) => {
    acc[e.tie] = (acc[e.tie] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-[1400px] flex-col">
      <header>
        <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">Map</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The whole company in one picture, left to right: a party wants an outcome,
          it becomes work, a doer does it, equipment tells them how. Click anyone to
          see exactly what they can reach.
        </p>
        <p className="tnum mt-2 text-xs text-muted-foreground">
          {counts.direct ?? 0} direct · {counts.inherited ?? 0} inherited ·{" "}
          {counts.available ?? 0} available
        </p>
      </header>

      <div className="mt-6 min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card">
        <BlockMap data={data} />
      </div>
    </div>
  );
}
