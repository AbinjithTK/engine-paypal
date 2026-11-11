"use client";

/**
 * The agent, everywhere. Cmd+K from any screen.
 *
 * A command surface with a transcript, not a chat app: no bubbles, no
 * left/right split, no avatars. It is a work record. DESIGN.md §10.5.
 *
 * Opening is keyboard-initiated, so it is not animated. DESIGN.md §1 rule 5.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, X } from "lucide-react";

import { useAgent } from "@/components/agent/agent-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SUGGESTIONS } from "@/lib/agent/parse";
import { cn } from "@/lib/utils";

export function AgentLauncher() {
  const { open, setOpen } = useAgent();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="agent-panel"
    >
      <Bot className="size-4" aria-hidden="true" />
      Ask
      <kbd className="ml-1 hidden rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
        ⌘K
      </kbd>
    </Button>
  );
}

export function AgentPanel() {
  const { turns, send, open, setOpen, capabilities, busy } = useAgent();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  // Cmd+K anywhere. Escape closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
      if (e.key === "Escape" && open) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Follow the transcript, but stop the moment the user scrolls up and never
  // resume without them asking. DESIGN.md §6.1.
  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  if (!open) return null;

  function submit(text: string) {
    const t = text.trim();
    if (!t) return;
    stick.current = true;
    send(t);
    setDraft("");
  }

  return (
    <aside
      id="agent-panel"
      aria-label="Agent"
      className="fixed inset-y-0 right-0 z-40 flex w-[360px] flex-col border-l bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-primary" aria-hidden="true" />
          Agent
        </span>
        <span className="flex items-center gap-2">
          <span className="tnum text-xs text-muted-foreground">
            {capabilities.length} {capabilities.length === 1 ? "ability" : "abilities"} here
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            aria-label="Close agent"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {turns.length === 0 ? (
          <div>
            <p className="text-sm text-muted-foreground">
              I work on blocks, not screens. Ask from anywhere and I&apos;ll go to
              the right place.
            </p>
            <ul className="mt-4 space-y-1.5">
              {SUGGESTIONS.map((line) => (
                <li key={line}>
                  <button
                    type="button"
                    onClick={() => submit(line)}
                    className={cn(
                      "w-full rounded-md border border-dashed px-3 py-2 text-left text-xs",
                      "text-muted-foreground",
                      "transition-colors duration-[var(--dur-press)] ease-[var(--ease-out)]",
                      "hover:border-solid hover:text-foreground",
                    )}
                  >
                    {line}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          turns.map((t) => (
            <div key={t.id}>
              <p className="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.from}
                {t.via && t.from === "agent" && (
                  <span className="font-mono text-[10px] normal-case tracking-normal opacity-70">
                    {t.via}
                  </span>
                )}
              </p>
              <p
                className={cn(
                  "mt-1 whitespace-pre-line text-sm leading-relaxed",
                  t.from === "agent" && "border-l-2 pl-3",
                  t.from === "agent" &&
                    (t.tone === "success"
                      ? "border-l-success/50"
                      : t.tone === "warning"
                        ? "border-l-warning/50"
                        : "border-l-primary/40"),
                )}
              >
                {t.text}
              </p>
            </div>
          ))
        )}

        {busy && (
          <p className="text-xs text-muted-foreground">Opening the right screen…</p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="border-t p-3"
      >
        <div className="relative">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(draft);
              }
            }}
            placeholder="Ask, create, assign, team up, or check the money"
            aria-label="Message the agent"
            rows={2}
            className="resize-none pr-11"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!draft.trim()}
            aria-label="Send"
            className="absolute bottom-2 right-2 size-7"
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </aside>
  );
}
