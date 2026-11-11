"use client";

/**
 * The freelancer's side of the platform.
 *
 * The order of the tabs is the argument: you see the OUTCOME before the money,
 * because someone taking equity is buying into a vision and has to be able to
 * read it first. A marketplace leads with the rate; this leads with the why.
 */

import { Bot, PieChart, Terminal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RewardAppetite } from "@/lib/blocks";

export type OpenRow = {
  id: string;
  title: string;
  brief: string;
  criteria: string[];
  skills: string[];
  state: string;
  cash: string | null;
  equity: string | null;
  outcome: string | null;
  measure: string | null;
  context: string[];
};

export function FreelancerView({
  name,
  appetite,
  open,
  mine,
  holdings,
  totalEquity,
}: {
  name: string;
  appetite: RewardAppetite;
  open: OpenRow[];
  mine: OpenRow[];
  holdings: { company: string; equity: string }[];
  totalEquity: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-[2.5rem] leading-tight font-semibold tracking-tight">Work</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {name} · takes {appetite === "either" ? "cash or equity" : appetite}
      </p>

      <Tabs defaultValue="open" className="mt-10">
        <TabsList>
          <TabsTrigger value="open">
            Open <span className="tnum ml-1.5">{open.length}</span>
          </TabsTrigger>
          <TabsTrigger value="mine">
            Mine <span className="tnum ml-1.5">{mine.length}</span>
          </TabsTrigger>
          <TabsTrigger value="earnings">Earnings</TabsTrigger>
          <TabsTrigger value="tools">My tools</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-8">
          {open.length === 0 ? (
            <Empty
              title="Nothing open that fits you"
              body="Work appears here when it matches your skills and what you will be paid in. Widen your appetite to see equity-funded work."
            />
          ) : (
            <ul className="stagger space-y-4">
              {open.map((w) => (
                <li key={w.id}>
                  <WorkCard row={w} canTake />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-8">
          {mine.length === 0 ? (
            <Empty
              title="You have not taken anything yet"
              body="Take something from Open, or pull it into your own editor with the MCP server under My tools."
            />
          ) : (
            <ul className="stagger space-y-4">
              {mine.map((w) => (
                <li key={w.id}>
                  <WorkCard row={w} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="earnings" className="mt-8">
          <div className="rounded-2xl border bg-card p-6">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <PieChart className="size-4" aria-hidden="true" />
              Equity owned
            </p>
            <p data-slot="money" className="mt-3 text-[2.75rem] leading-none font-semibold tracking-tight">
              {totalEquity}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Across {holdings.length} {holdings.length === 1 ? "company" : "companies"}. Equity
              vests when work passes review, so there is no cliff and no schedule.
            </p>

            {holdings.length > 0 && (
              <ul className="mt-6 space-y-2 border-t pt-5">
                {holdings.map((h) => (
                  <li
                    key={h.company}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">{h.company}</span>
                    <span data-slot="money" className="font-medium">
                      {h.equity}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-6 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
              These are recorded commitments and their terms, not a cap table of record.
              Share issuance happens with the company&apos;s lawyer and registry.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="tools" className="mt-8">
          <MyTools />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkCard({ row, canTake = false }: { row: OpenRow; canTake?: boolean }) {
  return (
    <article className="rounded-2xl border bg-card p-6">
      {/* The vision first. You cannot judge an equity offer without it. */}
      {row.outcome && (
        <div className="mb-5 border-b pb-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Why it matters
          </p>
          <p className="mt-2 text-sm leading-relaxed">{row.outcome}</p>
          {row.measure && (
            <p className="tnum mt-1 text-sm text-muted-foreground">{row.measure}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h3 className="text-lg font-medium tracking-tight">{row.title}</h3>
        <span className="flex flex-wrap items-center gap-2">
          {row.cash && (
            <span data-slot="money" className="font-medium">
              {row.cash}
            </span>
          )}
          {row.equity && (
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/8 px-2 py-0.5 text-xs font-medium text-primary">
              <PieChart className="size-3" aria-hidden="true" />
              <span data-slot="money">{row.equity}</span>
            </span>
          )}
        </span>
      </div>

      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        {row.brief}
      </p>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Done means
        </p>
        <ol className="mt-2 space-y-1">
          {row.criteria.map((c, i) => (
            <li key={c} className="text-sm text-muted-foreground">
              <span className="tnum">{i + 1}.</span> {c}
            </li>
          ))}
        </ol>
      </div>

      {row.context.length > 0 && (
        <p className="mt-5 text-sm text-muted-foreground">
          Context you get: {row.context.join(", ")}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {canTake ? (
          <Button
            onClick={() =>
              toast.success(`Taken · ${row.title}`, {
                description: row.equity
                  ? `You accept ${row.equity} equity, vesting when the work passes review.`
                  : "Brief and context are yours.",
              })
            }
          >
            Take it
          </Button>
        ) : (
          <Button onClick={() => toast("Submit flow is not built yet — see GAPS.md")}>
            Submit for review
          </Button>
        )}
        <Button variant="outline" onClick={() => toast("Ask the agent with ⌘K")}>
          <Bot className="size-4" aria-hidden="true" />
          Ask about it
        </Button>
      </div>
    </article>
  );
}

function MyTools() {
  const config = `{
  "mcpServers": {
    "engine": {
      "url": "https://your-deployment/api/mcp",
      "headers": { "Authorization": "Bearer doer-demo" }
    }
  }
}`;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Terminal className="size-4 text-primary" aria-hidden="true" />
          Use your own AI, with our context
        </p>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          Point Claude, Cursor, or any MCP client at the Engine server and your
          tools can read your briefs, ask questions about the company, post
          updates and submit work. You never have to open this app to be
          productive, which is the whole point of the context handoff.
        </p>

        <pre className="mt-5 overflow-x-auto rounded-xl border bg-muted/40 p-4 text-xs">
          <code className="font-mono">{config}</code>
        </pre>

        <p className="mt-4 text-xs text-muted-foreground">
          Your token is scoped to you: it reaches work you are on plus work that
          is open, and only the context attached to it. Nothing on the server can
          move cash or grant equity.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <p className="text-sm font-medium">What your AI can call</p>
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {[
            ["my_work", "what you are on, with state and reward"],
            ["open_work", "work that fits your skills and appetite"],
            ["get_brief", "the brief, criteria, outcome and reward"],
            ["get_context", "the company knowledge scoped to that work"],
            ["take_work", "claim open work"],
            ["post_update", "progress the founder sees without asking"],
            ["submit_work", "hand it in for review"],
            ["my_holdings", "equity across every company"],
          ].map(([n, d]) => (
            <li key={n} className="flex flex-wrap gap-x-3">
              <code className="font-mono text-foreground">{n}</code>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-card p-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
