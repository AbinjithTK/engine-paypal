"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Connector, Job, Review, Signoff, Skill } from "@/lib/engine/types";

import { Toast, send, usd, useToast } from "../../_ui";

type View = {
  job: {
    id: string;
    title: string;
    role?: string;
    state: Job["state"];
    priceCents: number;
    skills: string[];
    project?: Job["project"];
    company: string;
    invite?: { status: string; reason: string; score: number };
    brief: string;
    criteria: string[];
    judgement: string[];
    signer?: { name: string; role: string };
    payees: { name: string; amountCents: number; role: string }[];
    releaseAt?: string;
    payoutStatus?: string;
    payoutBatchId?: string;
    held: boolean;
  };
  taken: boolean;
  facts: { id: string; section: string; text: string }[];
  passages: { id: string; title: string; text: string }[];
  skills: Skill[];
  connectors: Connector[];
  questions: { id: string; question: string; askedBy: string; answer?: string; at: string }[];
  rounds: { at: string; content: string; artefact?: string; review?: Review; signoff?: Signoff }[];
  lastReview?: Review;
  team: { id: string; title: string; role?: string; step: number; state: Job["state"]; locked: boolean; who?: string; you: boolean }[];
};

const STAGE = ["Held in PayPal", "You do the work", "AI checks", "Founder signs off", "Paid by PayPal"];
function stage(s: Job["state"]): number {
  return { funded: 0, taken: 1, changes: 1, in_review: 2, signoff: 3, passed: 3, paying: 4, paid: 4, appealed: 3, draft: 0, cancelled: 0 }[s];
}

export default function ExpertJob() {
  const { id } = useParams<{ id: string }>();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [work, setWork] = useState({ content: "", artefact: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const t = useToast();

  const load = useCallback(async () => {
    const r = await fetch(`/api/work/jobs/${id}`, { cache: "no-store" });
    const j = await r.json();
    if (r.ok) setV(j);
    else setErr(j.error);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling the job
    void load();
    const t2 = setInterval(() => document.visibilityState === "visible" && void load(), 4000);
    return () => clearInterval(t2);
  }, [load]);

  async function act(name: string, body: Record<string, unknown>, ok: string) {
    setBusy(name);
    const r = await send<View>(`/api/work/jobs/${id}`, body);
    setBusy(null);
    if (!r.ok) t.show(r.error, true);
    else {
      setV(r.data);
      t.show(ok);
    }
    return r.ok;
  }

  if (err)
    return (
      <div className="card pad">
        <p>{err}</p>
        <Link className="link" href="/work">
          Back to my work
        </Link>
      </div>
    );
  if (!v) return <p className="soft">Loading…</p>;
  const { job } = v;
  const st = stage(job.state);
  const canSubmit = v.taken && ["taken", "changes"].includes(job.state);
  const last = v.rounds[v.rounds.length - 1];

  return (
    <>
      <Link href="/work" className="faint">
        ← My work
      </Link>
      <div className="between" style={{ alignItems: "flex-end", margin: "8px 0 16px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <p className="label">
            {job.company}
            {job.role ? ` · ${job.role}` : ""}
          </p>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            {job.title}
          </h1>
          {job.project && (
            <p className="soft">
              Milestone {job.project.step} of {job.project.of} in {job.project.title}
            </p>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="h2 num" style={{ margin: 0 }}>
            {usd(job.priceCents)}
          </div>
          <div className="faint">{job.held ? "Held in PayPal for this job" : job.state === "paid" ? "Paid through PayPal" : ""} · you pay 0%</div>
        </div>
      </div>

      <ol className="mw-steps" aria-label="Where this job is">
        {STAGE.map((s, i) => (
          <li key={s} className={i < st ? "done" : i === st ? "now" : ""}>
            <i aria-hidden="true" />
            {s}
          </li>
        ))}
      </ol>

      {!v.taken && job.state === "funded" && (
        <div className="card pad between" style={{ borderColor: "var(--blue)", background: "var(--blue-wash)", marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <p className="h3">{job.invite?.status === "invited" ? "You were invited to this job" : "This job is open"}</p>
            {job.invite?.reason && <p className="soft">Why you: {job.invite.reason}</p>}
          </div>
          <div className="row">
            <button className="btn p" disabled={busy !== null} onClick={() => act("accept", { action: "accept" }, "It's yours. The money is held.")}>
              {busy === "accept" ? <span className="spin" /> : null} Accept the job
            </button>
            {job.invite?.status === "invited" && (
              <button className="btn" disabled={busy !== null} onClick={() => act("decline", { action: "decline" }, "Declined.")}>
                Decline
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="stack">
          <div className="card pad">
            <p className="label">The brief</p>
            <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{job.brief}</p>
          </div>
          <div className="card pad">
            <p className="h3">Engine&apos;s AI checks</p>
            <ol style={{ margin: "6px 0 12px", paddingLeft: 20 }}>
              {job.criteria.map((c) => (
                <li key={c} style={{ padding: "3px 0" }}>
                  {c}
                </li>
              ))}
            </ol>
            {job.judgement.length > 0 && (
              <>
                <p className="h3">
                  {job.signer?.name || job.signer?.role || "The founder"} judges <span className="faint">(you are the expert: steer toward these)</span>
                </p>
                <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  {job.judgement.map((c) => (
                    <li key={c} style={{ padding: "3px 0" }}>
                      {c}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>

          {v.skills.length > 0 && (
            <div className="card pad">
              <p className="label">How {job.company} wants it done</p>
              {v.skills.map((s) => (
                <div key={s.id} style={{ marginTop: 10 }}>
                  <p className="h3">{s.name}</p>
                  <pre className="code" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
                    {s.body}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {v.taken && (
            <div className="card pad stack">
              <div className="between">
                <p className="label">Your work</p>
                {v.rounds.length > 0 && <span className="faint">{v.rounds.length} round{v.rounds.length === 1 ? "" : "s"} so far</span>}
              </div>
              {last?.review && (
                <div>
                  <p className="h3">
                    Round {v.rounds.length}: {last.review.results.filter((r) => r.pass).length} of {last.review.results.length} checks met
                  </p>
                  <div className="divide">
                    {last.review.results.map((r) => (
                      <div className="crit" key={r.criterion}>
                        <span className={`mk ${r.pass ? "y" : "n"}`} aria-label={r.pass ? "Pass" : "Fail"}>
                          {r.pass ? "✓" : "✕"}
                        </span>
                        <div>
                          <p style={{ fontWeight: 600 }}>{r.criterion}</p>
                          <p className="soft" style={{ fontSize: 14 }}>
                            {r.reason}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(last.review.genericSignals?.length ?? 0) > 0 && (
                    <p className="soft" style={{ fontSize: 14 }}>
                      Reads as generic, worth rewriting in your own voice: {last.review.genericSignals!.map((g) => `"${g}"`).join(", ")}
                    </p>
                  )}
                  {last.signoff && (
                    <p className={`pill ${last.signoff.approved ? "pg" : "pa"}`} style={{ whiteSpace: "normal", marginTop: 8 }}>
                      {last.signoff.approved ? "Signed off" : "Changes asked"} by {last.signoff.by}
                      {last.signoff.note ? `: ${last.signoff.note}` : ""}
                    </p>
                  )}
                </div>
              )}
              {job.state === "in_review" && (
                <p className="soft row">
                  <span className="spin" /> The Reviewer is checking your work…
                </p>
              )}
              {job.state === "signoff" && <p className="soft">Every check passed. {job.signer?.name || "The founder"} is judging the rest now.</p>}
              {job.state === "paid" && (
                <p className="pill pg" style={{ whiteSpace: "normal" }}>
                  Paid {usd(job.payees.reduce((n, p) => n + p.amountCents, 0))} through PayPal Payouts{job.payoutStatus ? ` (${job.payoutStatus.toLowerCase()})` : ""}.
                </p>
              )}
              {canSubmit && (
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await act("submit", { action: "submit", ...work }, "Submitted. Here's the review.");
                    if (ok) setWork({ content: "", artefact: "" });
                  }}
                >
                  <textarea
                    rows={10}
                    value={work.content}
                    onChange={(e) => setWork({ ...work, content: e.target.value })}
                    placeholder="Paste the deliverable itself. The AI checks the text you submit."
                    aria-label="Your deliverable"
                  />
                  <input type="url" value={work.artefact} onChange={(e) => setWork({ ...work, artefact: e.target.value })} placeholder="Link to the file or page (optional)" aria-label="Link" />
                  <div className="row">
                    <button className="btn p" disabled={busy !== null || work.content.trim().length < 20}>
                      {busy === "submit" ? (
                        <>
                          <span className="spin" /> Checking against every criterion…
                        </>
                      ) : v.rounds.length ? (
                        "Submit the fixed version"
                      ) : (
                        "Submit for review"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <aside className="stack">
          {v.team.length > 0 && (
            <div className="card pad">
              <p className="label">The team on this project</p>
              <div className="divide" style={{ marginTop: 6 }}>
                {v.team.map((m) => (
                  <div key={m.id} className="between" style={{ padding: "8px 0", fontSize: 14 }}>
                    <span>
                      <span className="pill pb" style={{ fontSize: 11 }}>
                        {m.role ?? "Expert"}
                      </span>{" "}
                      {m.title}
                    </span>
                    <span className={m.you ? "" : "faint"} style={m.you ? { fontWeight: 600 } : undefined}>
                      {m.you ? "You" : m.who ?? (m.locked ? "Later" : "Being matched")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card pad stack">
            <p className="label">Ask {job.company}</p>
            {v.questions.length === 0 && <p className="faint">No questions yet. Anything you ask is answered once and saved for everyone.</p>}
            {v.questions.map((x) => (
              <div key={x.id}>
                <p style={{ fontWeight: 600 }}>
                  {x.askedBy}: {x.question}
                </p>
                <p className={x.answer ? "soft" : "faint"}>{x.answer ? `Answer: ${x.answer}` : "Waiting for the founder"}</p>
              </div>
            ))}
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (q.trim().length >= 5 && (await act("ask", { action: "ask", question: q }, "Asked. The founder sees it on their Village."))) setQ("");
              }}
            >
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about the job" aria-label="Your question" />
              <button className="btn" disabled={busy !== null || q.trim().length < 5}>
                Ask
              </button>
            </form>
          </div>

          <div className="card pad">
            <p className="label">What {job.company} shared for this job</p>
            <div className="divide" style={{ marginTop: 6 }}>
              {v.facts.map((f) => (
                <div key={f.id} className="fact" style={{ padding: "7px 0" }}>
                  <span className="pill pn" style={{ fontSize: 11 }}>
                    {f.section}
                  </span>
                  <span style={{ fontSize: 13.5 }}>{f.text}</span>
                </div>
              ))}
            </div>
            {v.passages.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                  {v.passages.length} passage{v.passages.length === 1 ? "" : "s"} from their documents
                </summary>
                {v.passages.map((p) => (
                  <div key={p.id} style={{ padding: "8px 0", fontSize: 13.5 }}>
                    <p className="faint" style={{ overflowWrap: "anywhere" }}>
                      {p.title}
                    </p>
                    <p className="soft" style={{ whiteSpace: "pre-wrap" }}>
                      {p.text}
                    </p>
                  </div>
                ))}
              </details>
            )}
            {v.connectors.length > 0 && (
              <div className="stack" style={{ marginTop: 10, gap: 6 }}>
                <p className="h3">Tools this job touches</p>
                {v.connectors.map((c) => (
                  <p key={c.id} style={{ fontSize: 13.5 }}>
                    <b>{c.name}</b> <span className="faint">· {c.purpose}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <p className="faint">Prefer your own AI agent? Connect it over MCP from the Use your AI agent page; it sees exactly this.</p>
        </aside>
      </div>
      <Toast msg={t.msg} />
    </>
  );
}
