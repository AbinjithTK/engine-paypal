"use client";

/**
 * People. Two ways in, deliberately.
 *
 * Agent search is faster when you know what you need. Browsing portfolios is
 * better when you don't, or when you want to judge taste yourself rather than
 * trust a shortlist. `prd.md` §1.2 is about taste, so the manual path is not a
 * fallback — it is the path where a founder exercises judgement.
 */

import { useMemo, useState } from "react";
import { Bot, Search, Sparkle, X } from "lucide-react";
import { toast } from "sonner";

import { useRegisterCapability } from "@/components/agent/agent-provider";
import { rankForTask } from "@/components/board/assign-popover";
import type { Capability } from "@/lib/agent/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RewardAppetite } from "@/lib/blocks";
import { formatMoney } from "@/lib/money";
import {
  ALL_SKILLS,
  AVAILABILITY,
  firstPassLabel,
  PEOPLE,
  searchPeople,
  type Person,
} from "@/lib/people";
import { TONE_CLASS } from "@/lib/task-state";
import { cn } from "@/lib/utils";

const APPETITE_COPY: Record<RewardAppetite, string> = {
  cash: "Cash only.",
  equity: "Equity, for work on something they want to exist.",
  either: "Cash, equity, or a mix — depends on the vision.",
};

export default function PeoplePage() {
  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState<string | undefined>();
  const [brief, setBrief] = useState("");
  const [shortlist, setShortlist] = useState<
    { person: Person; why: string }[] | null
  >(null);

  const hired = useMemo(() => PEOPLE.filter((p) => p.hired), []);
  const results = useMemo(
    () => searchPeople(PEOPLE, query, { skill }),
    [query, skill],
  );

  function runAgentSearch() {
    const text = brief.trim();
    if (!text) return;
    // SWAP POINT: a Gemini call reading the brief against the Brain in
    // production. See assign-popover.tsx `rankForTask`.
    const ranked = rankForTask(text.split(/[\s,]+/)).slice(0, 3);
    setShortlist(ranked.map((r) => ({ person: r.person, why: r.why })));
  }

  // What the agent can do while this screen is open. It reaches here from any
  // other screen too: the provider navigates first, then replays the intent.
  const capability = useMemo<Capability>(
    () => ({
      id: "people.find",
      surface: "/demo/people",
      describe: "shortlist people for a skill, and read their portfolios",
      can: (i) => i.verb === "find",
      run: (i) => {
        if (i.verb !== "find") return { text: "", tone: "warning" };
        const ranked = rankForTask(i.what.split(/[\s,]+/)).slice(0, 3);
        setBrief(i.what);
        setShortlist(ranked.map((r) => ({ person: r.person, why: r.why })));
        return {
          text:
            `Closest three for ${i.what}:\n\n` +
            ranked.map((r, n) => `${n + 1}. ${r.person.name} — ${r.why}`).join("\n") +
            `\n\nA shortlist is a suggestion. Their portfolios are below.`,
        };
      },
    }),
    [],
  );
  useRegisterCapability(capability);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">
        People
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask the agent to shortlist, or read the portfolios yourself.
      </p>

      {/* Agent path */}
      <section aria-labelledby="agent-h" className="mt-10">
        <h2 id="agent-h" className="sr-only">
          Agent search
        </h2>
        <div className="rounded-2xl border bg-card p-6">
          <label
            htmlFor="brief"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Bot className="size-4 text-primary" aria-hidden="true" />
            Describe the work
          </label>
          <div className="mt-3 flex flex-wrap gap-3">
            <Input
              id="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAgentSearch()}
              placeholder="A pricing page redesign that ships in Webflow"
              className="min-w-0 flex-1"
            />
            <Button onClick={runAgentSearch} disabled={!brief.trim()}>
              Shortlist
            </Button>
          </div>

          {shortlist && (
            <div className="mt-6 border-t pt-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium">
                  Three closest, with reasoning
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShortlist(null)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Clear
                </Button>
              </div>
              <ol className="mt-3 space-y-2">
                {shortlist.map(({ person, why }, i) => (
                  <li
                    key={person.id}
                    className="flex items-start gap-3 rounded-xl border px-4 py-3"
                  >
                    <span className="tnum mt-0.5 text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {person.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {why}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                <Sparkle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                A shortlist is a suggestion. Read the portfolios below before you
                decide.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Manual path */}
      <Tabs defaultValue="directory" className="mt-12">
        <TabsList>
          <TabsTrigger value="directory">
            Directory <span className="tnum ml-1.5">{PEOPLE.length}</span>
          </TabsTrigger>
          <TabsTrigger value="team">
            Your team <span className="tnum ml-1.5">{hired.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-8">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a name, a skill, or something in their past work"
              aria-label="Search people"
              className="pl-10"
            />
          </div>

          <div
            role="group"
            aria-label="Filter by skill"
            className="mt-4 flex flex-wrap gap-2"
          >
            {ALL_SKILLS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={skill === s}
                onClick={() => setSkill(skill === s ? undefined : s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  "transition-colors duration-[var(--dur-press)] ease-[var(--ease-out)]",
                  skill === s
                    ? "border-primary/30 bg-primary/8 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {results.length === 0 ? (
            <div className="mt-8 rounded-2xl border bg-card p-10 text-center">
              <p className="font-medium">Nobody matches that yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Supply is hand-recruited at this stage, so the pool is small and
                real. Clear the filters, or describe the work above and let the
                agent go looking.
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setQuery("");
                  setSkill(undefined);
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <ul className="stagger mt-8 space-y-4">
              {results.map((p) => (
                <li key={p.id}>
                  <PersonCard person={p} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="team" className="mt-8">
          <p className="text-sm text-muted-foreground">
            People who have delivered for you. Verdict history widens what they
            can see next time.
          </p>
          <ul className="stagger mt-6 space-y-4">
            {hired.map((p) => (
              <li key={p.id}>
                <PersonCard person={p} />
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PersonCard({ person }: { person: Person }) {
  const avail = AVAILABILITY[person.availability];

  return (
    <article className="rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
        <Avatar className="size-12 shrink-0">
          <AvatarFallback className="text-sm">{person.initials}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-lg font-medium tracking-tight">{person.name}</h3>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-medium",
                TONE_CLASS[avail.tone],
              )}
            >
              {avail.label}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {person.headline}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{person.location}</p>
        </div>

        <div className="text-right">
          <p data-slot="money" className="font-medium">
            {formatMoney(person.rateFrom)}
            <span className="text-sm font-normal text-muted-foreground">/hr</span>
          </p>
          <p className="tnum mt-1 text-xs text-muted-foreground">
            {firstPassLabel(person.firstPassBps)} · {person.tasksDone} tasks
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {person.skills.map((s) => (
          <span
            key={s}
            className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {s}
          </span>
        ))}
      </div>

      {/* What they will take. Someone who takes equity is betting on a vision,
          which is the whole reason a founder short on cash can move at all. */}
      <div className="mt-5 border-t pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Will take
        </p>
        <p className="mt-2 text-sm">
          {APPETITE_COPY[person.appetite]}
        </p>

        {person.holdings.length > 0 && (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Owns
            </p>
            <ul className="mt-2 space-y-1.5">
              {person.holdings.map((h) => (
                <li
                  key={h.company}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span className="text-muted-foreground">{h.company}</span>
                  <span data-slot="money" className="font-medium">
                    {formatMoney(h.equity)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* The portfolio is the point of browsing manually, so it is not hidden
          behind a disclosure. */}
      <div className="mt-6 border-t pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Past work
        </p>
        <ul className="mt-3 space-y-3">
          {person.portfolio.map((w) => (
            <li key={w.title}>
              <p className="text-sm font-medium">{w.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{w.role}</p>
              <p className="tnum mt-0.5 text-sm text-muted-foreground">
                {w.outcome} · {w.year}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {person.agents.length > 0 && (
        <div className="mt-5 border-t pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Agents they built
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {person.agents.map((a) => (
              <li
                key={a}
                className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs text-primary"
              >
                <Bot className="size-3" aria-hidden="true" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() =>
            toast.success(`${person.name} added to the board`, {
              description: "Drag them onto a task, or onto someone else to group.",
            })
          }
        >
          Add to board
        </Button>
        <Button
          variant="ghost"
          onClick={() => toast(`Message sent to ${person.name}`)}
        >
          Message
        </Button>
      </div>
    </article>
  );
}
