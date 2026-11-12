"use client";

import { BookOpen, Flag, Hammer, Landmark, Mail, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { NoticeCard } from "./_ui/notice-card";
import { usd, useEngine } from "./_ui/use-engine";

export default function Home() {
  const { state } = useEngine();
  const router = useRouter();

  if (!state) return <p className="soft">Loading your company…</p>;

  const needs = state.notices.filter((n) => n.kind === "approval");
  const suggestions = state.notices.filter((n) => n.kind === "suggestion");
  const done = state.notices.filter((n) => n.kind === "done").slice(0, 4);
  const active = state.jobs.filter((j) => !["paid", "cancelled", "draft"].includes(j.state));
  const reviewing = state.jobs.filter((j) => j.state === "in_review").length;
  const toRelease = state.jobs.filter((j) => j.state === "passed");
  const gaps = state.notices.filter((n) => n.action === "answer_gap").length;
  const brainNeeds = state.brain.waiting + state.brain.conflicts;
  const emptyBrain = state.brain.total === 0;
  const scoutDaily = !!state.builders.find((b) => b.id === "scout")?.scheduled;

  const buildings = [
    {
      id: "workshop",
      name: "Jobs",
      icon: Hammer,
      href: "/app/jobs",
      desc: active.length ? `${active.length} job${active.length === 1 ? "" : "s"} in progress` : "Post work for freelancers and their agents",
      work: reviewing ? "Reviewer checking a submission" : active[0] ? active[0].title : null,
      badge: toRelease.length,
    },
    {
      id: "vault",
      name: "Money",
      icon: Landmark,
      href: "/app/jobs?view=money",
      desc: `${usd(state.heldCents)} held in PayPal, ${usd(state.paidOutCents)} paid out`,
      work: toRelease.length ? `${toRelease.length} payment${toRelease.length === 1 ? "" : "s"} ready to release` : null,
      badge: 0,
    },
    {
      id: "library",
      name: "Company Brain",
      icon: BookOpen,
      href: "/app/brain",
      desc: emptyBrain ? "Your Company Brain is empty. Start here." : `Company Brain: ${state.brain.total} facts`,
      work: brainNeeds ? `${brainNeeds} fact${brainNeeds === 1 ? "" : "s"} to check` : null,
      badge: brainNeeds + (emptyBrain ? 1 : 0),
    },
    {
      id: "post",
      name: "Questions",
      icon: Mail,
      href: "/app#needs",
      desc: "Questions from freelancers, answered once",
      work: gaps ? `${gaps} question${gaps === 1 ? "" : "s"} waiting` : null,
      badge: gaps,
    },
    {
      id: "townhall",
      name: "Ideas",
      icon: Flag,
      href: "/app/builders",
      desc: scoutDaily ? "Scout suggests the work worth doing next, every morning" : "Scout suggests the work worth doing next, when you run it",
      work: suggestions.filter((s) => s.action === "build_agent" || s.action === "post_job").length ? "Scout has ideas for you" : null,
      badge: suggestions.filter((s) => s.action === "build_agent" || s.action === "post_job").length,
    },
  ];

  const total = needs.length + suggestions.length;

  return (
    <>
      {state.demo && (
        <div className="card pad between" style={{ marginBottom: 24, flexWrap: "wrap" }}>
          <span className="soft">You&rsquo;re in the demo company. Everything works, on PayPal sandbox test money.</span>
          <Link className="btn p s" href="/login?new=1">
            Create your own company
          </Link>
        </div>
      )}
      <p className="label">{state.company.name}</p>
      <h1 className="h1">
        {total ? (
          <>
            <em>{total === 1 ? "One thing" : `${total} things`}</em> {total === 1 ? "needs" : "need"} you.
          </>
        ) : (
          <>
            Everything is <em>handled</em>.
          </>
        )}
      </h1>
      <p className="soft" style={{ marginBottom: 22 }}>
        Your builders handle the rest. Money moves only after work passes review, through PayPal.
      </p>

      <div className="grid2">
        <section aria-label="Your company">
          <div className="village">
            {buildings.map((b) => {
              const Icon = b.icon;
              return (
                <button key={b.id} className={`bld${b.badge ? " need" : ""}`} onClick={() => router.push(b.href)}>
                  {b.badge > 0 && <span className="badge">{b.badge}</span>}
                  <div className="ic">
                    <Icon aria-hidden="true" />
                  </div>
                  <div className="nm">{b.name}</div>
                  <div className="ds">{b.desc}</div>
                  {b.work && <div className="work">{b.work}</div>}
                </button>
              );
            })}
            <Link href="/app/jobs/new" className="bld" style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="ic">
                <Plus aria-hidden="true" />
              </div>
              <div className="nm">Post new work</div>
              <div className="ds">Say what you need in plain words</div>
            </Link>
          </div>

          <div className="between" style={{ marginTop: 22 }}>
            <h2 className="h3">Builders</h2>
            <Link className="faint" href="/app/builders">
              Manage
            </Link>
          </div>
          <div className="huts">
            {state.builders.map((b) => {
              const last = b.runs[0];
              const recent = last && state.serverNow - Date.parse(last.at) < 60_000;
              return (
                <Link key={b.id} href="/app/builders" className="hut">
                  <div className="t">
                    <span className="row" style={{ gap: 0 }}>
                      <span className={`dot ${b.paused ? "idle" : recent ? "busy" : "ok"}`} />
                      {b.name}
                    </span>
                    <span className="pill pn" style={{ fontSize: 12 }}>
                      {b.mode === "auto" ? "On its own" : b.mode === "ask" ? "Asks you first" : "Only suggests"}
                    </span>
                  </div>
                  <div className="d">{last ? last.summary : b.schedule}</div>
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="stack" id="needs" aria-label="Needs you">
          {emptyBrain && (
            <div className="card task" style={{ borderColor: "var(--blue)", background: "var(--blue-wash)" }}>
              <span className="pill pb">Start here</span>
              <p className="q" style={{ marginTop: 8 }}>
                Teach Engine your business in about ten minutes
              </p>
              <p className="why">A short chat builds your Company Brain, so every freelancer starts with the right context.</p>
              <div className="acts">
                <Link className="btn p s" href="/app/brain">
                  Start the interview
                </Link>
              </div>
            </div>
          )}
          {[...needs, ...suggestions].map((n) => (
            <NoticeCard key={n.id} n={n} />
          ))}
          {!emptyBrain && total === 0 && (
            <div className="card pad soft">Nothing needs you. Post work when you have some, and the builders take it from there.</div>
          )}
          {done.length > 0 && (
            <>
              <p className="label" style={{ marginTop: 8 }}>
                Done for you
              </p>
              {done.map((n) => (
                <NoticeCard key={n.id} n={n} />
              ))}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
