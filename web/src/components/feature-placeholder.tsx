import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Empty state, not a "coming soon". Per DESIGN.md §4.1: never a blank area —
 * say what belongs here and give the one action that fills it.
 */
export function FeaturePlaceholder({
  title,
  line,
  action,
  icon: Icon,
}: {
  title: string;
  line: string;
  action: string;
  icon: LucideIcon;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">
        {title}
      </h1>

      <div className="stagger mt-12">
        <div className="flex flex-col items-center rounded-2xl border bg-card px-8 py-20 text-center">
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-muted"
            aria-hidden="true"
          >
            <Icon className="size-6 text-muted-foreground" />
          </span>
          <p className="mt-6 max-w-sm text-lg leading-relaxed">{line}</p>
          <Button size="lg" className="mt-8">
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}
