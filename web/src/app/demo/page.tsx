import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { StateBadge } from "@/components/money-badge";
import { formatMoney, money } from "@/lib/money";
import type { PaymentState } from "@/lib/task-state";

const STATS = [
  { label: "In escrow", value: formatMoney(money(1_120_000_000, "USDC")) },
  { label: "Released in August", value: formatMoney(money(284_000, "USD")) },
  { label: "Live tasks", value: "6" },
];

const TASKS: { title: string; who: string; amount: string; state: PaymentState }[] = [
  {
    title: "Redesign the pricing page",
    who: "Priya N",
    amount: formatMoney(money(45_000, "USD")),
    state: "in_review",
  },
  {
    title: "Onboarding email sequence",
    who: "Marco S",
    amount: formatMoney(money(28_000, "USD")),
    state: "in_escrow",
  },
  {
    title: "Migrate auth to Identity Platform",
    who: "Dee K",
    amount: formatMoney(money(96_000, "USD")),
    state: "submitted",
  },
];

export default function Overview() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">
        Overview
      </h1>

      <div className="stagger mt-10 space-y-10">
        {/* One thing needs a decision. Say it once, large. */}
        <Link
          href="/demo/task"
          className="group block rounded-2xl border bg-card p-8 transition-shadow duration-[var(--dur-panel)] ease-[var(--ease-out)] hover:shadow-md"
        >
          <p className="text-sm text-muted-foreground">Needs you</p>
          <p className="mt-3 text-2xl font-medium tracking-tight">
            One task is waiting on a decision
          </p>
          <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">
            Review it
            <ArrowRight
              className="size-4 transition-transform duration-[var(--dur-press)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </Link>

        <section aria-label="Summary" className="grid gap-6 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p
                data-slot="money"
                className="mt-3 text-[1.75rem] leading-none font-semibold tracking-tight"
              >
                {s.value}
              </p>
            </div>
          ))}
        </section>

        <section aria-labelledby="live-h">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="live-h" className="text-lg font-medium tracking-tight">
              Live work
            </h2>
            <Link
              href="/demo/task"
              className="inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground"
            >
              All tasks
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            {TASKS.map((t, i) => (
              <Link
                key={t.title}
                href="/demo/task"
                className={`flex items-center gap-6 px-6 py-5 transition-colors duration-[var(--dur-press)] ease-[var(--ease-out)] hover:bg-muted/40 ${
                  i > 0 ? "border-t" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {t.who}
                  </span>
                </span>
                <StateBadge state={t.state} className="hidden sm:inline-flex" />
                <span data-slot="money" className="w-24 text-right font-medium">
                  {t.amount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
