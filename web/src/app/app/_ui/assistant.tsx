"use client";

import { Compass, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { Job } from "@/lib/engine/types";

import { type EngineState, usd, useEngine } from "./use-engine";

/**
 * The assistant: one plain suggestion at a time, read from the company's own
 * state. No AI call, so it costs nothing and is always on. It looks for what
 * is about to go wrong (a PayPal hold running out, two facts that disagree,
 * work waiting on you) before it suggests anything new.
 */

type Tip = {
  /** Changes when the situation changes, so a dismissed tip comes back if it gets worse. */
  key: string;
  /** Lower is more urgent. */
  rank: number;
  /** Pages where this tip matters most. */
  on: string[];
  tone: "danger" | "amber" | "blue";
  title: string;
  why: string;
  go?: { label: string; href: string };
  /** The job this tip is about, if any. */
  ref?: string;
};

const DAY = 86_400_000;

function dayText(ms: number) {
  const d = Math.max(0, Math.round(ms / DAY));
  return d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
}

function who(j: Job) {
  return j.doer?.name ?? "the expert";
}

export function tipsFor(s: EngineState): Tip[] {
  const now = s.serverNow;
  const t: Tip[] = [];
  const open = (j: Job) => `/app/jobs/${j.id}`;

  if (!s.configured.paypal) {
    t.push({
      key: "paypal-missing",
      rank: 0,
      on: ["/app"],
      tone: "danger",
      title: "PayPal isn't connected",
      why: "Work can be scoped, but no money can be held or paid until the PayPal keys are set on the server.",
    });
  }
  if (!s.configured.gemini && !s.configured.nebius) {
    t.push({
      key: "ai-missing",
      rank: 0,
      on: ["/app"],
      tone: "danger",
      title: "No AI key is set",
      why: "The builders can't scope requests or check work without one. Set AI_API_KEY on the server.",
    });
  }

  for (const j of s.jobs) {
    const exp = j.paypal.authorizationExpires ? Date.parse(j.paypal.authorizationExpires) : 0;
    const held = j.paypal.authorizationId && !j.paypal.captureId && !["paid", "cancelled"].includes(j.state);
    if (held && exp && exp - now < 5 * DAY) {
      t.push({
        ref: j.id,
        key: `hold-${j.id}-${Math.round((exp - now) / DAY)}`,
        rank: 1,
        on: ["/app", "/app/jobs"],
        tone: exp - now < 2 * DAY ? "danger" : "amber",
        title: `The PayPal hold on "${j.title}" ends ${dayText(exp - now)}`,
        why: `PayPal returns the ${usd(j.priceCents + j.feeCents)} to the card when a hold expires, and ${who(j)} would not be paid. Get the work reviewed and signed off before then.`,
        go: { label: "Open the job", href: open(j) },
      });
    }
    if (j.state === "signoff") {
      t.push({
        ref: j.id,
        key: `signoff-${j.id}`,
        rank: 2,
        on: ["/app", "/app/jobs"],
        tone: "blue",
        title: `"${j.title}" passed the AI checks and needs your call`,
        why: `Read the notes on the judgement points. Your sign-off is what pays ${who(j)} ${usd(j.priceCents)}.`,
        go: { label: "Review and sign off", href: open(j) },
      });
    }
    if (j.state === "passed" && j.releaseAt) {
      const left = Date.parse(j.releaseAt) - now;
      t.push({
        ref: j.id,
        key: `release-${j.id}`,
        rank: 2,
        on: ["/app", "/app/jobs"],
        tone: "amber",
        title: `"${j.title}" pays out on its own ${dayText(left)}`,
        why: "It passed review. If something is wrong, open it and say so before then.",
        go: { label: "Open the job", href: open(j) },
      });
    }
    const firstOpen = j.project
      ? s.jobs.filter((x) => x.project?.id === j.project!.id && x.state === "draft" && !x.locked).sort((a, b) => a.project!.step - b.project!.step)[0]
      : undefined;
    if (j.state === "draft" && !j.locked && j.project && j.project.step > 1 && firstOpen?.id === j.id) {
      t.push({
        ref: j.id,
        key: `fund-${j.id}`,
        rank: 3,
        on: ["/app", "/app/jobs", "/app/team"],
        tone: "blue",
        title: `Milestone ${j.project.step} of ${j.project.of} is ready to fund`,
        why: `"${j.title}" opens to the ${j.role ?? "next role"} once ${usd(j.priceCents + j.feeCents)} is held in PayPal.`,
        go: { label: "Fund it", href: open(j) },
      });
    }
    const age = now - Date.parse(j.createdAt);
    if (j.state === "funded" && !j.doer && age > 2 * DAY) {
      const pending = (j.invites ?? []).filter((i) => i.status === "invited").length;
      t.push({
        ref: j.id,
        key: `stuck-${j.id}`,
        rank: 4,
        on: ["/app/team", "/app/jobs"],
        tone: "amber",
        title: `Nobody has started "${j.title}" in ${Math.floor(age / DAY)} days`,
        why: pending ? `${pending} invite${pending === 1 ? " is" : "s are"} still unanswered. Invite another of the best fits, so the money isn't held for nothing.` : "Invite one of the best fits from the team board.",
        go: { label: "Open the team", href: j.project ? `/app/team/${j.project.id}` : "/app/team" },
      });
    }
  }

  if (s.brain.total === 0) {
    t.push({
      key: "brain-empty",
      rank: 3,
      on: ["/app", "/app/brain", "/app/jobs"],
      tone: "blue",
      title: "Teach Engine your business first",
      why: "A short interview fills the Company Brain. Without it, every brief starts from nothing and experts ask the same questions again.",
      go: { label: "Start the interview", href: "/app/brain" },
    });
  }
  if (s.brain.conflicts > 0) {
    t.push({
      key: `conflicts-${s.brain.conflicts}`,
      rank: 2,
      on: ["/app", "/app/brain"],
      tone: "amber",
      title: `${s.brain.conflicts} fact${s.brain.conflicts === 1 ? "" : "s"} in the Brain disagree`,
      why: "A brief could quote the wrong one. Pick which is true.",
      go: { label: "Settle them", href: "/app/brain" },
    });
  }
  if (s.brain.waiting > 0) {
    t.push({
      key: `waiting-${Math.ceil(s.brain.waiting / 5)}`,
      rank: 5,
      on: ["/app/brain", "/app"],
      tone: "blue",
      title: `${s.brain.waiting} fact${s.brain.waiting === 1 ? " was" : "s were"} read from your files and not checked yet`,
      why: "A quick look now saves a wrong detail in a brief later. Confirm the right ones and remove the rest.",
      go: { label: "Check them", href: "/app/brain" },
    });
  }

  const scout = s.builders.find((b) => b.id === "scout");
  if (scout && !scout.paused && !scout.scheduled && scout.runs.length === 0) {
    t.push({
      key: "scout-never",
      rank: 6,
      on: ["/app/builders", "/app"],
      tone: "blue",
      title: "Scout hasn't looked for work yet",
      why: "Run it once to see what it suggests from your Brain and PayPal sales. It stays off the daily schedule unless you turn that on, because each run uses AI credits.",
      go: { label: "Go to Scout", href: "/app/builders" },
    });
  }

  if (s.jobs.length === 0 && s.brain.total > 0) {
    t.push({
      key: "first-job",
      rank: 6,
      on: ["/app", "/app/jobs"],
      tone: "blue",
      title: "Post your first piece of work",
      why: "Say what you need in a sentence. The Scoper writes the brief and the checks, and suggests a fair price before any money is held.",
      go: { label: "Post work", href: "/app/jobs/new" },
    });
  }

  return t;
}

const STORE = "engine.assistant.dismissed";

export function Assistant() {
  const { state } = useEngine();
  const path = usePathname();
  const [gone, setGone] = useState<string[]>([]);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      // localStorage is the external system this effect reads from.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGone(JSON.parse(localStorage.getItem(STORE) || "[]"));
    } catch {
      /* private mode: nothing remembered */
    }
  }, []);

  const tips = useMemo(() => {
    if (!state) return [];
    const here = (t: Tip) => t.on.some((p) => (p === "/app" ? path === "/app" : path.startsWith(p)));
    return tipsFor(state)
      .filter((t) => !gone.includes(t.key))
      .filter((t) => !(t.go && path === t.go.href))
      // Home already lists open notices in "Needs you"; don't say the same thing twice.
      .filter((t) => !(path === "/app" && t.ref && state.notices.some((n) => n.ref === t.ref && n.kind === "approval")))
      .sort((a, b) => a.rank - (here(a) ? 0.5 : 0) - (b.rank - (here(b) ? 0.5 : 0)));
  }, [state, gone, path]);

  if (!tips.length) return null;
  const tip = tips[Math.min(i, tips.length - 1)];

  function dismiss() {
    const next = [...gone, tip.key].slice(-200);
    setGone(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      /* not remembered */
    }
  }

  return (
    <section className={`assist ${tip.tone}`} aria-label="Assistant" aria-live="polite">
      <span className="assist-ic" aria-hidden="true">
        <Compass />
      </span>
      <div className="assist-body">
        <p className="assist-t">{tip.title}</p>
        <p className="assist-w">{tip.why}</p>
      </div>
      <div className="assist-acts">
        {tip.go && (
          <Link className="btn p s" href={tip.go.href}>
            {tip.go.label}
          </Link>
        )}
        {tips.length > 1 && (
          <button className="btn s" onClick={() => setI((i + 1) % tips.length)}>
            Next suggestion <span className="faint num">{Math.min(i, tips.length - 1) + 1}/{tips.length}</span>
          </button>
        )}
        <button className="assist-x" onClick={dismiss} aria-label="Not now">
          <X aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
