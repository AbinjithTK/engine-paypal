"use client";

import { useState } from "react";
import { ChevronRight, Sparkle } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Every agent decision renders through this. See DESIGN.md §10.2.
 *
 * Reasoning is always available but never forced. The override control sits
 * at the same visual weight as accepting — disagreeing with the agent must
 * never be harder than agreeing with it.
 */
export function AgentDecision({
  agent,
  decision,
  at,
  reasoning,
  model,
  tokens,
  onOverride,
  overrideLabel = "Override",
  tone = "neutral",
}: {
  agent: string;
  decision: string;
  at: string;
  reasoning: string;
  model?: string;
  tokens?: { in: number; out: number };
  onOverride?: () => void;
  overrideLabel?: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        // A left rule and a label. No gradients, no glow. DESIGN.md §10.2
        "border-l-2",
        tone === "neutral" && "border-l-primary/40",
        tone === "success" && "border-l-success/50",
        tone === "warning" && "border-l-warning/50",
      )}
    >
      <div className="flex items-start justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkle className="size-3" aria-hidden="true" />
            <span className="font-medium text-foreground">{agent}</span>
            <span aria-hidden="true">·</span>
            <time>{at}</time>
          </div>
          <p className="mt-1.5 text-sm text-foreground">{decision}</p>
        </div>

        {onOverride ? (
          <Button variant="outline" size="sm" onClick={onOverride} className="shrink-0">
            {overrideLabel}
          </Button>
        ) : null}
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 border-t px-4 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform duration-[var(--dur-panel)] ease-[var(--ease-out)]",
                open && "rotate-90",
              )}
              aria-hidden="true"
            />
            {open ? "Hide reasoning" : "Why?"}
          </button>
        </CollapsibleTrigger>

        {/* grid-template-rows rather than height:auto — DESIGN.md §9 */}
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-none">
          <div className="border-t bg-muted/40 px-4 py-3">
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {reasoning}
            </p>
            {(model || tokens) && (
              <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-muted-foreground/80">
                {model && <span className="font-mono">{model}</span>}
                {tokens && (
                  <span className="tnum">
                    {tokens.in.toLocaleString()} in · {tokens.out.toLocaleString()} out
                  </span>
                )}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
