import { cn } from "@/lib/utils";

/**
 * Dense label/value rail. Convention taken from Jira, Plane and Linear —
 * all three use a labelled list rather than stacked cards, because it packs
 * more state into less vertical space and scans faster.
 */
export function PropertyRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <dl className={cn("space-y-0", className)}>{children}</dl>;
}

export function Property({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3 py-2">
      <dt className="pt-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Scope disclosure. Borrowed from Qatalog, which states inherited privacy
 * settings at the foot of the rail. Ours has to say what the contractor can
 * see, because context scoping is a security boundary (prd.md §7.2).
 */
export function ScopeNote({ shared, total }: { shared: number; total: number }) {
  return (
    <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
      <span className="tnum font-medium text-foreground">
        {shared} of {total}
      </span>{" "}
      Brain documents are shared with this task. Access is logged per query.
    </p>
  );
}
