"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Expert, Job } from "@/lib/engine/types";

import { SignIn, Toast, send, usd, useMe, useToast } from "./_ui";

type Card = {
  id: string;
  title: string;
  role?: string;
  state: Job["state"];
  priceCents: number;
  skills: string[];
  project?: Job["project"];
  company: string;
  invite?: { status: string; reason: string; score: number };
  rounds: number;
};
type Home = { me: Expert; invited: Card[]; open: Card[]; mine: Card[]; pendingInvites: number; earnedCents: number; heldCents: number };

const STATE: Record<string, { t: string; c: string }> = {
  funded: { t: "Money held, ready", c: "pb" },
  taken: { t: "You're on it", c: "pb" },
  in_review: { t: "In review", c: "pb" },
  signoff: { t: "Founder signing off", c: "pb" },
  changes: { t: "Changes asked", c: "pa" },
  passed: { t: "Passed, paying soon", c: "pg" },
  paying: { t: "Paying", c: "pg" },
  paid: { t: "Paid", c: "pg" },
  appealed: { t: "Appealed", c: "pd" },
};

function JobRow({ c, children }: { c: Card; children?: React.ReactNode }) {
  return (
    <div className="pad between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0, flex: "1 1 360px" }}>
        <Link href={`/work/jobs/${c.id}`} className="h3">
          {c.title}
        </Link>
        <p className="faint">
          {c.company}
          {c.role ? ` · ${c.role}` : ""}
          {c.project ? ` · milestone ${c.project.step} of ${c.project.of} in ${c.project.title}` : ""}
        </p>
        {c.invite?.reason && c.invite.status === "invited" && (
          <p className="soft" style={{ fontSize: 14, marginTop: 6 }}>
            Why you: {c.invite.reason}
          </p>
        )}
        {children}
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="h3 num">{usd(c.priceCents)}</div>
        {STATE[c.state] && <span className={`pill ${STATE[c.state].c}`}>{STATE[c.state].t}</span>}
      </div>
    </div>
  );
}

export default function WorkHome() {
  const { me, reload } = useMe();
  const [h, setH] = useState<Home | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const t = useToast();

  const load = useCallback(async () => {
    const r = await fetch("/api/work/jobs", { cache: "no-store" });
    if (r.ok) setH(await r.json());
  }, []);
  useEffect(() => {
    if (!me?.me) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling the expert's jobs
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 4000);
    return () => clearInterval(id);
  }, [me?.me, load]);

  if (!me) return <p className="soft">Loading…</p>;
  if (!me.me) return <SignIn data={me} onDone={() => void reload()} />;
  if (!h) return <p className="soft">Loading your work…</p>;

  async function respond(id: string, action: "accept" | "decline") {
    setBusy(id);
    const r = await send(`/api/work/jobs/${id}`, { action });
    setBusy(null);
    if (!r.ok) t.show(r.error, true);
    else t.show(action === "accept" ? "It's yours. The money is already held in PayPal." : "Declined. The founder will pick someone else.");
    await load();
  }

  const active = h.mine.filter((j) => j.state !== "paid");
  const done = h.mine.filter((j) => j.state === "paid");

  return (
    <>
      <p className="label">My work</p>
      <h1 className="h1">
        Hi {h.me.name.split(" ")[0]}.{" "}
        {h.invited.length ? (
          <>
            <em>{h.invited.length === 1 ? "One founder" : `${h.invited.length} founders`}</em> invited you.
          </>
        ) : (
          <>
            Here&apos;s your <em>work</em>.
          </>
        )}
      </h1>
      <div className="huts" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", margin: "14px 0 22px" }}>
        <div className="hut">
          <div className="d">Paid to you</div>
          <div className="h2 num">{usd(h.earnedCents)}</div>
        </div>
        <div className="hut">
          <div className="d">Held for you in PayPal</div>
          <div className="h2 num">{usd(h.heldCents)}</div>
        </div>
        <div className="hut">
          <div className="d">Engine fee for you</div>
          <div className="h2 num">0%</div>
        </div>
      </div>

      <div className="grid2">
        <div className="stack">
          <section className="card divide" aria-label="Invites">
            <div className="pad">
              <p className="label">Invites</p>
              <p className="faint">The Matcher picked you from your profile, and the founder invited you. The money is held before you start.</p>
            </div>
            {h.invited.length === 0 && <p className="pad soft">No invites right now.{h.pendingInvites ? ` ${h.pendingInvites} more will appear once the founder funds them.` : ""}</p>}
            {h.invited.map((c) => (
              <JobRow key={c.id} c={c}>
                <div className="acts">
                  <button className="btn p s" disabled={busy !== null} onClick={() => respond(c.id, "accept")}>
                    {busy === c.id ? <span className="spin" /> : null} Accept
                  </button>
                  <Link className="btn s" href={`/work/jobs/${c.id}`}>
                    Read the brief
                  </Link>
                  <button className="btn ghost s" disabled={busy !== null} onClick={() => respond(c.id, "decline")}>
                    Decline
                  </button>
                </div>
              </JobRow>
            ))}
          </section>

          <section className="card divide" aria-label="Your jobs">
            <div className="pad">
              <p className="label">On your desk</p>
            </div>
            {active.length === 0 && <p className="pad soft">Nothing in progress.</p>}
            {active.map((c) => (
              <JobRow key={c.id} c={c} />
            ))}
          </section>

          {done.length > 0 && (
            <section className="card divide" aria-label="Paid">
              <div className="pad">
                <p className="label">Paid</p>
              </div>
              {done.map((c) => (
                <JobRow key={c.id} c={c} />
              ))}
            </section>
          )}
        </div>

        <aside className="stack">
          <section className="card divide" aria-label="Open jobs">
            <div className="pad">
              <p className="label">Open to anyone</p>
              <p className="faint">Funded jobs with no invites.</p>
            </div>
            {h.open.length === 0 && <p className="pad soft">None right now.</p>}
            {h.open.map((c) => (
              <JobRow key={c.id} c={c}>
                <div className="acts">
                  <button className="btn s" disabled={busy !== null} onClick={() => respond(c.id, "accept")}>
                    Take it
                  </button>
                </div>
              </JobRow>
            ))}
          </section>
          <div className="card pad stack">
            <p className="label">Your profile</p>
            <p className="h3">{h.me.headline}</p>
            <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
              {h.me.skills.map((s) => (
                <span key={s} className="pill pn" style={{ fontSize: 12 }}>
                  {s}
                </span>
              ))}
            </div>
            <p className="faint">The Matcher reads this. Keep it specific.</p>
            <div>
              <Link className="btn s" href="/work/profile">
                Edit profile
              </Link>
            </div>
          </div>
        </aside>
      </div>
      <Toast msg={t.msg} />
    </>
  );
}
