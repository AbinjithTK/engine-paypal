import {
  Check,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  Clock,
  Lock,
  ScanEye,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { formatMoney, type Money } from "@/lib/money";
import { PAYMENT_STATE, TONE_CLASS, type PaymentState } from "@/lib/task-state";
import { cn } from "@/lib/utils";

const ICON = {
  "circle-dashed": CircleDashed,
  "circle-check": CircleCheck,
  lock: Lock,
  clock: Clock,
  "scan-eye": ScanEye,
  check: Check,
  "check-check": CheckCheck,
  "triangle-alert": TriangleAlert,
  "undo-2": Undo2,
} as const;

export function StateBadge({
  state,
  className,
}: {
  state: PaymentState;
  className?: string;
}) {
  const meta = PAYMENT_STATE[state];
  const Icon = ICON[meta.icon as keyof typeof ICON];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        // Colour change only — no movement near money. DESIGN.md §5.4
        "transition-[background-color,color,border-color] duration-[140ms] ease-[var(--ease-out)]",
        TONE_CLASS[meta.tone],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function MoneyAmount({
  value,
  size = "md",
  className,
}: {
  value: Money;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      data-slot="money"
      title={formatMoney(value, { precision: "full" })}
      className={cn(
        "font-medium text-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-xl tracking-tight",
        className,
      )}
    >
      {formatMoney(value)}
    </span>
  );
}
