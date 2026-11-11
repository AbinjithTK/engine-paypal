"use client";

/**
 * Inline assignment, straight off a Task node face.
 *
 * Two paths on purpose, because founders want both and the product should not
 * force a choice: let the agent shortlist, or browse and pick yourself.
 *
 * Everything interactive inside a React Flow node needs `nodrag nopan`, or the
 * canvas swallows the pointer and the control feels broken.
 */

import { useMemo, useRef, useState } from "react";
import { Check, Search, Sparkle, UserPlus } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AVAILABILITY,
  firstPassLabel,
  PEOPLE,
  searchPeople,
  type Person,
} from "@/lib/people";
import { cn } from "@/lib/utils";

/**
 * Ranking for the "let the agent pick" path.
 *
 * SWAP POINT: in production this is a Gemini call that reads the task spec
 * against the Brain and returns a ranked shortlist with written reasoning
 * (`prd.md` §6, Matching Agent). Until the Vertex project exists this is a
 * deterministic score, so nothing on screen pretends to be a model.
 */
export function rankForTask(
  requiredSkills: string[],
  people: Person[] = PEOPLE,
): { person: Person; score: number; why: string }[] {
  return people
    .map((person) => {
      const overlap = person.skills.filter((s) =>
        requiredSkills.some((r) => r.toLowerCase() === s.toLowerCase()),
      );
      const availabilityScore =
        person.availability === "open" ? 2 : person.availability === "limited" ? 1 : 0;
      const score =
        overlap.length * 10 + availabilityScore * 3 + person.firstPassBps / 1_000;

      const why = [
        overlap.length > 0 ? `${overlap.join(" and ")} match` : "no direct skill match",
        firstPassLabel(person.firstPassBps),
        AVAILABILITY[person.availability].label.toLowerCase(),
      ].join(", ");

      return { person, score, why };
    })
    .sort((a, b) => b.score - a.score);
}

export function AssignPopover({
  requiredSkills = [],
  assignedIds,
  onAssign,
  label = "Assign",
}: {
  requiredSkills?: string[];
  assignedIds: string[];
  onAssign: (person: Person, viaAgent: boolean) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const ranked = useMemo(() => rankForTask(requiredSkills), [requiredSkills]);
  const results = useMemo(() => {
    const pool = query.trim() ? searchPeople(PEOPLE, query) : ranked.map((r) => r.person);
    return pool;
  }, [query, ranked]);

  const top = ranked[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "nodrag nopan inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1",
            "text-xs text-muted-foreground",
            "transition-colors duration-[var(--dur-press)] ease-[var(--ease-out)]",
            "hover:border-solid hover:text-foreground",
          )}
        >
          <UserPlus className="size-3" aria-hidden="true" />
          {label}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="nodrag nopan w-[320px] p-0"
        onOpenAutoFocus={(e) => {
          // Let the search field take focus rather than the first row, so
          // typing narrows the list instead of activating someone.
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        {/* Agent path */}
        {top && !query.trim() && (
          <button
            type="button"
            onClick={() => {
              onAssign(top.person, true);
              setOpen(false);
            }}
            className="flex w-full items-start gap-2.5 border-b p-3 text-left hover:bg-muted/50"
          >
            <Sparkle className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs font-medium">
                Let the agent pick — {top.person.name}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {top.why}
              </span>
            </span>
          </button>
        )}

        {/* Manual path */}
        <div className="relative border-b">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, skill or past work"
            aria-label="Search people"
            className="h-10 border-0 pl-9 shadow-none focus-visible:ring-0"
          />
        </div>

        <ScrollArea className="max-h-[264px]">
          {results.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              Nobody matches “{query}”. Try a skill, or browse the full directory
              on People.
            </p>
          ) : (
            <ul>
              {results.map((person) => {
                const already = assignedIds.includes(person.id);
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => {
                        onAssign(person, false);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
                        already
                          ? "cursor-default opacity-50"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <Avatar className="size-7 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {person.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {person.name}
                        </span>
                        <span className="tnum block truncate text-xs text-muted-foreground">
                          {person.skills.slice(0, 2).join(", ")} ·{" "}
                          {firstPassLabel(person.firstPassBps)}
                        </span>
                      </span>
                      {already ? (
                        <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            person.availability === "open" && "bg-success",
                            person.availability === "limited" && "bg-warning",
                            person.availability === "booked" && "bg-muted-foreground/40",
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <span className="sr-only">
                        {AVAILABILITY[person.availability].label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
