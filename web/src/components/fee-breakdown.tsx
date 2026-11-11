"use client";

import { useState } from "react";

import { formatMoney, money, takeRate, type Money } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Fee transparency. Pattern from Dribbble, which toggles between the
 * freelancer's payout and the client's payment over the same milestone, and
 * from Behance, which itemises every fee down to "you get".
 *
 * Rates per prd.md §12.1 — 10% from the founder, 5% from the contractor.
 */
const FOUNDER_BPS = 1_000;
const CONTRACTOR_BPS = 500;

export function FeeBreakdown({ price }: { price: Money }) {
  const [side, setSide] = useState<"contractor" | "founder">("contractor");

  const contractorFee = takeRate(price, CONTRACTOR_BPS);
  const founderFee = takeRate(price, FOUNDER_BPS);

  const rows =
    side === "contractor"
      ? [
          { label: "Task price", value: price },
          { label: "Platform fee (5%)", value: money(-contractorFee.amount, price.currency) },
        ]
      : [
          { label: "Task price", value: price },
          { label: "Platform fee (10%)", value: founderFee },
        ];

  const total =
    side === "contractor"
      ? money(price.amount - contractorFee.amount, price.currency)
      : money(price.amount + founderFee.amount, price.currency);

  return (
    <div>
      <div
        role="group"
        aria-label="Fee view"
        className="mb-3 flex items-center gap-1 rounded-md bg-muted p-0.5"
      >
        {(
          [
            ["contractor", "Contractor receives"],
            ["founder", "Client pays"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSide(key)}
            aria-pressed={side === key}
            className={cn(
              "flex-1 rounded-[5px] px-2 py-1 text-xs font-medium",
              side === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <dl className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd data-slot="money" className="text-xs text-foreground">
              {formatMoney(r.value)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t pt-2">
          <dt className="text-xs font-medium text-foreground">
            {side === "contractor" ? "Payout" : "Total"}
          </dt>
          <dd data-slot="money" className="text-base font-semibold text-foreground">
            {formatMoney(total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
