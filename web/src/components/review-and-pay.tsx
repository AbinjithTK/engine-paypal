"use client";

import { Download, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyAmount } from "@/components/money-badge";
import { formatMoney, type Money } from "@/lib/money";

/**
 * Review and pay. Structure taken from Upwork, which numbers the steps —
 * review the submission, then approve and pay — and states the automatic
 * release condition in plain language rather than burying it in terms.
 *
 * Difference here: the agent has already reached a verdict, so the human
 * action is confirming or overturning it, not evaluating from scratch.
 */
export function ReviewAndPay({
  price,
  funds,
  autoReleaseOn,
  deliverable,
  note,
  onApprove,
  onRequestChanges,
}: {
  price: Money;
  funds: Money;
  autoReleaseOn: string;
  deliverable: { name: string; size: string };
  note: string;
  onApprove: () => void;
  onRequestChanges: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="grid grid-cols-2 divide-x border-b">
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">Task price</p>
          <MoneyAmount value={price} size="md" className="mt-0.5 block" />
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">Funds in escrow</p>
          <MoneyAmount value={funds} size="md" className="mt-0.5 block" />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          The Review Agent has requested changes. If neither of you acts by{" "}
          <span className="font-medium text-foreground">{autoReleaseOn}</span>, the{" "}
          {formatMoney(price)} held in escrow releases to the contractor automatically.
        </p>

        <section aria-labelledby="rp-1">
          <h3 id="rp-1" className="text-sm font-medium text-foreground">
            1. Review submission
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{note}</p>
          <div className="mt-2 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Paperclip className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{deliverable.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tnum text-xs text-muted-foreground">{deliverable.size}</span>
              <Download className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </span>
          </div>
        </section>

        <section aria-labelledby="rp-2">
          <h3 id="rp-2" className="text-sm font-medium text-foreground">
            2. Approve and pay
          </h3>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {/* Equal visual weight — overturning the agent must never be
                harder than agreeing with it. DESIGN.md §10.2 */}
            <Button onClick={onApprove}>Release {formatMoney(price)}</Button>
            <Button variant="outline" onClick={onRequestChanges}>
              Request changes
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
