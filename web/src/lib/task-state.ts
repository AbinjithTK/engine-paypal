/**
 * Payment and task state. See DESIGN.md §5.3 and prd.md §10.5.
 *
 * Every state carries a label, an icon and a tone. Never colour alone —
 * that fails colour-blind users and screen readers both.
 */

export type PaymentState =
  | "quoted"
  | "funded"
  | "in_escrow"
  | "submitted"
  | "in_review"
  | "released"
  | "settled"
  | "disputed"
  | "refunded";

export type Tone = "neutral" | "brand" | "warning" | "success" | "danger";

export const PAYMENT_STATE: Record<
  PaymentState,
  { label: string; tone: Tone; icon: string }
> = {
  quoted: { label: "Awaiting funding", tone: "neutral", icon: "circle-dashed" },
  funded: { label: "Funded", tone: "brand", icon: "circle-check" },
  in_escrow: { label: "Held in escrow", tone: "brand", icon: "lock" },
  submitted: { label: "Awaiting review", tone: "warning", icon: "clock" },
  in_review: { label: "Under review", tone: "warning", icon: "scan-eye" },
  released: { label: "Released", tone: "success", icon: "check" },
  settled: { label: "Settled", tone: "success", icon: "check-check" },
  disputed: { label: "Disputed", tone: "danger", icon: "triangle-alert" },
  refunded: { label: "Refunded", tone: "neutral", icon: "undo-2" },
};

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary/8 text-primary border-primary/20",
  warning: "bg-warning-subtle text-warning border-warning/25",
  success: "bg-success-subtle text-success border-success/25",
  danger: "bg-destructive-subtle text-destructive border-destructive/25",
};
