"use client";

import Link from "next/link";

import { STATE_LABEL, ago, usd, useEngine } from "../_ui/use-engine";

export default function Jobs() {
  const { state } = useEngine();
  if (!state) return <p className="soft">Loading…</p>;
  const jobs = state.jobs;
  const fees = jobs.filter((j) => j.state === "paid").reduce((n, j) => n + j.feeCents, 0);

  return (
    <>
      <div className="between" style={{ alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <p className="label">Jobs and money</p>
          <h1 className="h1">
            Work, and the <em>money</em> behind it
          </h1>
        </div>
        <Link className="btn p" href="/app/jobs/new">
          Post new work
        </Link>
      </div>

      <div className="huts" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", marginBottom: 20 }}>
        <div className="hut">
          <div className="d">Held in PayPal</div>
          <div className="h2 num">{usd(state.heldCents)}</div>
        </div>
        <div className="hut">
          <div className="d">Paid to freelancers</div>
          <div className="h2 num">{usd(state.paidOutCents)}</div>
        </div>
        <div className="hut">
          <div className="d">Engine fees (10%, client side)</div>
          <div className="h2 num">{usd(fees)}</div>
        </div>
        <div className="hut">
          <div className="d">PayPal balance</div>
          <div className="h2 num">{usd(state.balanceCents)}</div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="card pad soft">No work yet. Post something and the Scoper will turn it into a brief with a price.</div>
      ) : (
        <div className="card divide">
          {jobs.map((j) => (
            <Link key={j.id} href={`/app/jobs/${j.id}`} className="between pad" style={{ display: "flex" }}>
              <div style={{ minWidth: 0 }}>
                <p className="h3">{j.title}</p>
                <p className="faint">
                  {j.project ? `${j.project.title} · milestone ${j.project.step} of ${j.project.of} · ` : ""}
                  {j.doer ? `${j.doer.name} · ` : ""}
                  {j.criteria.length} criteria · {j.submissions.length} round{j.submissions.length === 1 ? "" : "s"} · {ago(j.createdAt)}
                </p>
              </div>
              <div className="row">
                <span className="num" style={{ fontWeight: 600 }}>
                  {usd(j.priceCents)}
                </span>
                <span className={`pill ${j.locked ? "pn" : STATE_LABEL[j.state].cls}`}>{j.locked ? "Opens later" : STATE_LABEL[j.state].text}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
