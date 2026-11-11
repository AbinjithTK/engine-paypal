import { ExternalLink } from "lucide-react";

import { PAYMENT_STATE, type PaymentState } from "@/lib/task-state";
import { cn } from "@/lib/utils";

export type TimelineEntry = {
  state: PaymentState;
  /** Who or what caused the transition. A person or a named agent. */
  actor: string;
  at: string;
  /** Present once settlement is on-chain. */
  txHash?: string;
  pending?: boolean;
};

/**
 * A permanent record, not a transient toast. See DESIGN.md §5.3.
 * Every transition is timestamped and attributed so either party can
 * scroll back and see exactly what moved the money and when.
 */
export function PaymentTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => {
        const meta = PAYMENT_STATE[entry.state];
        const last = i === entries.length - 1;

        return (
          <li key={`${entry.state}-${entry.at}`} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  entry.pending
                    ? "bg-warning ring-[3px] ring-warning-subtle"
                    : meta.tone === "success"
                      ? "bg-success"
                      : "bg-primary",
                )}
                aria-hidden="true"
              />
              {!last && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
            </div>

            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
              <p className="text-sm font-medium text-foreground">{meta.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.actor} · <time>{entry.at}</time>
              </p>
              {entry.txHash && (
                <a
                  href={`https://basescan.org/tx/${entry.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 rounded-sm font-mono text-xs text-primary hover:underline"
                >
                  {entry.txHash.slice(0, 10)}…{entry.txHash.slice(-6)}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
