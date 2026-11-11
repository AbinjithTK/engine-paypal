"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Coins, Paperclip } from "lucide-react";
import { toast } from "sonner";

import { AgentDecision } from "@/components/agent-decision";
import { FeeBreakdown } from "@/components/fee-breakdown";
import { StateBadge } from "@/components/money-badge";
import { PaymentTimeline, type TimelineEntry } from "@/components/payment-timeline";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatMoney, money } from "@/lib/money";
import { cn } from "@/lib/utils";

const PRICE = money(45_000, "USD");
const ESCROW = money(450_000_000, "USDC");

const TABS = ["Brief", "Delivery", "Money", "Activity"] as const;
type Tab = (typeof TABS)[number];

const TIMELINE: TimelineEntry[] = [
  { state: "quoted", actor: "Scoping Agent", at: "Mon 2:14 pm" },
  { state: "funded", actor: "Abin J", at: "Mon 2:31 pm" },
  {
    state: "in_escrow",
    actor: "Circle escrow",
    at: "Mon 2:31 pm",
    txHash: "0x9f2c41ab7de0155cc8b31f0aa4e7d2c9b8615a3f",
  },
  { state: "submitted", actor: "Priya N", at: "Wed 11:48 am" },
  { state: "in_review", actor: "Review Agent", at: "Wed 11:49 am", pending: true },
];

const CRITERIA = [
  { text: "Three tiers, monthly and annual toggle", met: true },
  { text: "Annual saving as a percentage", met: false },
  { text: "Brand voice from the Brain", met: true },
  { text: "Accessibility score above 95", met: true },
  { text: "No layout shift on load", met: true },
];

export default function TaskPage() {
  const [tab, setTab] = useState<Tab>("Brief");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        href="/demo"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Overview
      </Link>

      {/* Hero. The three things that matter, nothing else. */}
      <header className="stagger mt-6">
        <StateBadge state="in_review" />
        <h1 className="mt-5 text-[2.5rem] leading-[1.1] font-semibold tracking-tight">
          Redesign the pricing page
        </h1>
        <div className="mt-8 flex flex-wrap items-end gap-x-12 gap-y-6">
          <div>
            <p className="text-sm text-muted-foreground">Held in escrow</p>
            <p
              data-slot="money"
              className="mt-2 text-[2.75rem] leading-none font-semibold tracking-tight"
            >
              {formatMoney(ESCROW)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">PN</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">Priya N</p>
              <p className="text-sm text-muted-foreground">Design</p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() =>
              toast.success("Payment released", {
                description: "450.00 USDC sent to Priya N",
              })
            }
          >
            <Check className="size-4" aria-hidden="true" />
            Release payment
          </Button>
          <Button size="lg" variant="outline" onClick={() => toast("Changes requested")}>
            Request changes
          </Button>
        </div>

        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          Releases automatically on <span className="text-foreground">Fri 15 Aug</span> if
          neither of you acts.
        </p>
      </header>

      {/* Navigation carries the detail. One thing per tab. */}
      <div role="tablist" aria-label="Task sections" className="mt-14 flex gap-8 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "relative -mb-px pb-3 text-sm font-medium",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}
            {tab === t && (
              <span
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>

      <div key={tab} className="animate-in fade-in slide-in-from-bottom-1 py-12 duration-300 ease-[var(--ease-out)]">
        {tab === "Brief" && (
          <div className="max-w-[62ch] space-y-8">
            <p className="text-lg leading-relaxed">
              Three tiers instead of four. Annual saving as a percentage, not a
              struck-through price.
            </p>
            <div>
              <p className="text-sm text-muted-foreground">Why</p>
              <p className="mt-2 leading-relaxed">
                The page converts at 1.2%. Four tiers is one too many, and the annual
                discount sits below the fold.
              </p>
            </div>
            <Button variant="outline">Ask the agent</Button>
          </div>
        )}

        {tab === "Delivery" && (
          <div className="space-y-10">
            <div>
              <p className="text-sm text-muted-foreground">Delivered</p>
              <div className="mt-3 flex items-center justify-between rounded-xl border bg-card px-6 py-5">
                <span className="flex items-center gap-3 font-mono text-sm">
                  <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
                  pricing-page-preview.fig
                </span>
                <span className="tnum text-sm text-muted-foreground">2.4 MB</span>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Criteria · <span className="tnum text-foreground">4 of 5 met</span>
              </p>
              <ul className="mt-3 space-y-2">
                {CRITERIA.map((c) => (
                  <li
                    key={c.text}
                    className="flex items-center gap-4 rounded-xl border bg-card px-6 py-4"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        c.met ? "bg-success" : "bg-warning",
                      )}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{c.text}</span>
                    <span className="text-sm text-muted-foreground">
                      {c.met ? "Met" : "Not met"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {tab === "Money" && (
          <div className="grid gap-10 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Breakdown</p>
              <div className="mt-3 rounded-xl border bg-card p-6">
                <FeeBreakdown price={PRICE} />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Timeline</p>
              <div className="mt-3 rounded-xl border bg-card p-6">
                <PaymentTimeline entries={TIMELINE} />
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Coins className="size-4" aria-hidden="true" />
                Settled on Base
              </p>
            </div>
          </div>
        )}

        {tab === "Activity" && (
          <div className="stagger space-y-4">
            <AgentDecision
              agent="Review Agent"
              at="Wed 11:49 am"
              tone="warning"
              decision="Changes requested — 4 of 5 criteria met."
              reasoning={
                "The annual column renders a struck-through price rather than a percentage. The brief asked for a percentage, and the brand guide reinforces it — struck-through pricing reads as discount-led where the positioning is value-led.\n\nEverything else passes. Accessibility is 97. No layout shift over five loads.\n\nRequesting changes rather than failing: small fix, everything else met."
              }
              model="gemini-flash"
              tokens={{ in: 8_412, out: 622 }}
            />
            <AgentDecision
              agent="Scoping Agent"
              at="Mon 2:14 pm"
              decision="Scoped to 5 criteria, priced at $450.00"
              reasoning={
                "Estimated 6–8 hours. Priced mid-band against $55–70/hr for contractors above 90% first-pass, because the Brain already holds the brand voice and a component library."
              }
              model="gemini-pro"
              tokens={{ in: 12_040, out: 1_180 }}
              onOverride={() => toast("Adjust price")}
              overrideLabel="Adjust"
            />
            <AgentDecision
              agent="Matching Agent"
              at="Mon 2:16 pm"
              decision="Proposed Priya N"
              reasoning={
                "Ranked 6 available contractors. Priya N first: 94% first-pass across 17 tasks, prior work on two pricing surfaces, and a reusable copy-review agent that fits the brand-voice criterion."
              }
              model="gemini-flash"
              tokens={{ in: 3_180, out: 410 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
