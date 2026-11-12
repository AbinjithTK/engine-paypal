import Link from "next/link";
import { notFound } from "next/navigation";

import { read } from "@/lib/engine/db";
import { ownerPage } from "@/lib/engine/http";

import { InviteBox } from "./invite";

export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ExpertProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return ownerPage(() => render(id));
}

function render(id: string) {
  const db = read();
  const e = db.experts.find((x) => x.id === id);
  if (!e) notFound();

  const mine = db.jobs.filter((j) => j.doer?.id === e.id);
  const paid = mine.filter((j) => j.state === "paid");
  const paidCents = paid.reduce((n, j) => n + j.priceCents, 0);
  const invited = db.jobs.filter((j) => (j.invites ?? []).some((x) => x.expertId === e.id && x.status === "invited"));
  // Jobs they could still be invited to, best match first.
  const open = db.jobs
    .filter((j) => ["draft", "funded"].includes(j.state) && !j.doer && !j.locked && !invited.includes(j))
    .map((j) => ({ id: j.id, title: j.title, role: j.role, priceCents: j.priceCents, funded: j.state === "funded", score: j.matches?.find((m) => m.expertId === e.id)?.score }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const calls = db.access.filter((a) => a.actor === e.name);

  return (
    <div style={{ maxWidth: 1000 }}>
      <p className="label">
        <Link href="/app/experts">Experts</Link> / {e.name}
      </p>
      <h1 className="h1">
        {e.name} {e.demo && <span className="pill pn" style={{ verticalAlign: "middle" }}>Demo account</span>}
      </h1>
      <p className="soft" style={{ fontSize: 18 }}>
        {e.headline}
      </p>
      <p className="faint" style={{ marginTop: 6, marginBottom: 22 }}>
        {e.location} · about ${e.dayRateUsd.toLocaleString("en-US")} a day · {e.available ? "available now" : "busy right now"}
      </p>

      <div className="grid2">
        <div className="stack">
          <section className="card pad stack" aria-label="Skills">
            <p className="h3">Skills</p>
            <div>
              {e.skills.map((s) => (
                <span key={s} className="pill pn" style={{ margin: "0 6px 6px 0" }}>
                  {s}
                </span>
              ))}
            </div>
          </section>
          <section className="card pad stack" aria-label="Past work">
            <p className="h3">Past work</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {e.pastWork.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
          <section className="card pad stack" aria-label="How they work with AI">
            <p className="h3">How they work with AI</p>
            <p>{e.aiTools}</p>
            <p className="faint">
              {calls.length ? `Their agent is connected to Engine. Last call: ${calls[0].tool}.` : "Their agent hasn't connected to Engine yet."}
            </p>
          </section>
          <section className="card" aria-label={`Work with ${db.company.name}`}>
            <div className="pad between" style={{ flexWrap: "wrap" }}>
              <p className="h3">Work with {db.company.name}</p>
              <span className="faint num">{paid.length ? `${usd(paidCents)} paid through PayPal` : "Not paid for any work yet"}</span>
            </div>
            {mine.length === 0 && invited.length === 0 ? (
              <p className="pad soft" style={{ borderTop: "1px solid var(--line)" }}>
                No jobs yet.
              </p>
            ) : (
              <div className="divide" style={{ borderTop: "1px solid var(--line)" }}>
                {[...mine, ...invited].map((j) => (
                  <Link key={j.id} href={`/app/jobs/${j.id}`} className="pad between" style={{ flexWrap: "wrap", display: "flex" }}>
                    <span>{j.title}</span>
                    <span className={`pill ${j.state === "paid" ? "pg" : invited.includes(j) ? "pa" : "pb"}`}>
                      {j.state === "paid" ? `Paid ${usd(j.priceCents)}` : invited.includes(j) ? "Invited" : "In progress"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="stack">
          <InviteBox expertId={e.id} name={e.name.split(" ")[0]} jobs={open} />
          <section className="card pad stack">
            <p className="h3">What {e.name.split(" ")[0]} gets when you hand over work</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>The brief and every check the Reviewer will run</li>
              <li>Only the Company Brain facts that job needs</li>
              <li>Your playbooks and the tools the job uses</li>
              <li>All of it in their own AI agent, without copying anything over</li>
            </ul>
            <p className="faint">Private documents never leave the company, and nothing they see can move money.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
