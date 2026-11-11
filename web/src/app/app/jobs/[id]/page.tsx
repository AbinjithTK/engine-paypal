"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import type { Fact, Job } from "@/lib/engine/types";

import { STATE_LABEL, ago, usd, useEngine } from "../../_ui/use-engine";

type Detail = {
  job: Job;
  shared: Fact[];
  withheld: number;
  access: { at: string; actor: string; tool: string; allowed: boolean; note?: string }[];
  milestones: { id: string; title: string; state: Job["state"]; locked: boolean; step: number; priceCents: number }[];
  passages: { id: string; title: string; text: string }[];
  connectors: { id: string; name: string; kind: string; url?: string; purpose: string }[];
  skills: { id: string; name: string }[];
  privateDocs: number;
};

/** "gemini-2.5-flash" reads as "Gemini 2.5 Flash"; any other model is the fallback. */
function modelName(m?: string) {
  if (!m) return "Gemini";
  if (!m.startsWith("gemini-")) return "the fallback model";
  return m
    .split("-")
    .map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function SignOff({ job, onDone }: { job: Job; onDone: () => void }) {
  const { post, toast } = useEngine();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const who = job.signer?.name || job.signer?.role || "You";
  async function decide(approved: boolean) {
    setBusy(approved ? "yes" : "no");
    const r = await post(`/api/engine/jobs/${job.id}`, { action: "signoff", approved, note });
    setBusy(null);
    if (r) toast(approved ? "Signed off. PayPal is paying out." : "Sent back with your notes. The money stays held.");
    onDone();
  }
  return (
    <div className="card pad stack" style={{ borderColor: "var(--blue)", background: "var(--blue-wash)" }}>
      <div>
        <p className="label">Your call{job.signer && job.signer.role !== "Founder" ? `, as ${job.signer.role}` : ""}</p>
        <p className="h3" style={{ marginTop: 6 }}>
          The AI checks pass. Only a person can judge the rest.
        </p>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Notes for the expert. Needed if you ask for changes."
        aria-label="Notes for the expert"
      />
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn p" disabled={busy !== null} onClick={() => decide(true)}>
          {busy === "yes" ? <span className="spin" /> : null} Sign off and pay
        </button>
        <button className="btn" disabled={busy !== null || !note.trim()} onClick={() => decide(false)}>
          {busy === "no" ? <span className="spin" /> : null} Ask for changes
        </button>
      </div>
      <p className="faint">Signing as {who}. Signing off releases the money through PayPal straight away.</p>
    </div>
  );
}

function Criteria({ job }: { job: Job }) {
  const signer = job.signer?.name ? `${job.signer.name} (${job.signer.role})` : (job.signer?.role ?? "The founder");
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      <div>
        <p className="h3">The AI checks</p>
        <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
          {job.criteria.map((c) => (
            <li key={c} style={{ padding: "3px 0" }}>
              {c}
            </li>
          ))}
        </ol>
      </div>
      {(job.judgement?.length ?? 0) > 0 && (
        <div>
          <p className="h3">{signer} judges</p>
          <ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>
            {job.judgement.map((c) => (
              <li key={c} style={{ padding: "3px 0" }}>
                {c}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Milestones({ d }: { d: Detail }) {
  if (d.milestones.length < 2) return null;
  return (
    <div className="card pad">
      <p className="label">{d.job.project?.title} · {d.milestones.length} milestones, each held and paid on its own</p>
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
        {d.milestones.map((m) => (
          <Link
            key={m.id}
            href={`/app/jobs/${m.id}`}
            className="hut"
            style={{ flex: "1 1 160px", ...(m.id === d.job.id ? { borderColor: "var(--blue)", background: "var(--blue-wash)" } : {}) }}
          >
            <div className="t">
              <span>{m.step}. {m.title}</span>
            </div>
            <div className="d row" style={{ justifyContent: "space-between" }}>
              <span>{usd(m.priceCents)}</span>
              <span className={`pill ${m.locked ? "pn" : STATE_LABEL[m.state].cls}`} style={{ fontSize: 12 }}>
                {m.locked ? "Opens later" : STATE_LABEL[m.state].text}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now === null) return <span className="num">-</span>;
  const s = Math.max(0, Math.round((Date.parse(until) - now) / 1000));
  return (
    <span className="num">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="soft">Loading…</p>}>
      <JobPage />
    </Suspense>
  );
}

function JobPage() {
  const { id } = useParams<{ id: string }>();
  const q = useSearchParams();
  const { post, toast } = useEngine();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [round, setRound] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [edit, setEdit] = useState<{ criteria: string; judgement: string; price: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/engine/jobs/${id}`, { cache: "no-store" });
    if (r.ok) setD(await r.json());
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling the job endpoint
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 3000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (q.get("funded")) toast("PayPal is holding the money. The job is open.");
    if (q.get("error")) toast(q.get("error")!, true);
    if (q.get("cancelled")) toast("PayPal checkout was cancelled. Nothing was held.", true);
  }, [q, toast]);

  if (!d) return <p className="soft">Loading…</p>;
  const { job } = d;
  const total = job.priceCents + job.feeCents;
  const subs = job.submissions;
  const shownRound = round ?? subs.length - 1;
  const sub = subs[shownRound];
  const review = sub?.review;
  const held = Boolean(job.paypal.authorizationId) && !["paid", "cancelled"].includes(job.state);
  const paid = job.state === "paid";

  async function act(name: string, body: Record<string, unknown>, ok?: string) {
    setBusy(name);
    const r = await post<{ approveUrl?: string }>(`/api/engine/jobs/${id}`, body);
    setBusy(null);
    if (r?.approveUrl) {
      window.location.href = r.approveUrl;
      return;
    }
    if (r && ok) toast(ok);
    await load();
  }

  return (
    <>
      <Link href="/app/jobs" className="faint">
        ← All work
      </Link>
      <div className="between" style={{ alignItems: "flex-end", margin: "8px 0 20px", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <p className="label">
            {job.id} · {ago(job.createdAt)}
          </p>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            {job.title}
          </h1>
          <div className="row">
            <span className={`pill ${STATE_LABEL[job.state].cls}`}>{STATE_LABEL[job.state].text}</span>
            {job.role && <span className="pill pb">{job.role}</span>}
            {job.doer && <span className="soft">{job.state === "paid" ? `Done by ${job.doer.name}` : `${job.doer.name} is on it`}</span>}
            <Link className="btn s" href={`/app/team/${job.project?.id ?? job.id}`}>
              {job.doer ? "See the team" : "Build the team"}
            </Link>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="h2 num" style={{ margin: 0 }}>
            {usd(job.priceCents)}
          </div>
          <div className="faint">+ {usd(job.feeCents)} Engine fee, paid by you</div>
        </div>
      </div>

      <div className="grid2">
        <div className="stack">
          <Milestones d={d} />
          {job.state === "signoff" && <SignOff job={job} onDone={load} />}
          {job.state === "draft" ? (
            <>
              {job.question && (
                <div className="card pad" style={{ borderColor: "var(--blue)", background: "var(--blue-wash)" }}>
                  <p className="label">One question from the Scoper</p>
                  <p className="h3" style={{ margin: "6px 0 10px" }}>
                    {job.question}
                  </p>
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (answer.trim()) void act("answer", { action: "edit", answer }, "Saved to the Brain.");
                    }}
                  >
                    <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label="Answer" placeholder="Your answer" />
                    <button className="btn p" disabled={!answer.trim() || busy !== null}>
                      Answer
                    </button>
                  </form>
                </div>
              )}

              <div className="card pad">
                <div className="between">
                  <p className="label">The brief</p>
                </div>
                <p style={{ marginTop: 8 }}>{job.brief}</p>
              </div>

              <div className="card pad">
                <div className="between">
                  <p className="label">Done means</p>
                  {!edit && (
                    <button
                      className="btn ghost s"
                      onClick={() =>
                        setEdit({
                          criteria: job.criteria.join("\n"),
                          judgement: (job.judgement ?? []).join("\n"),
                          price: String(job.priceCents / 100),
                        })
                      }
                    >
                      Edit
                    </button>
                  )}
                </div>
                {edit ? (
                  <div className="stack" style={{ marginTop: 10 }}>
                    <span className="soft">Checks the AI verifies, one per line</span>
                    <textarea value={edit.criteria} onChange={(e) => setEdit({ ...edit, criteria: e.target.value })} rows={5} aria-label="Checks the AI verifies, one per line" />
                    <span className="soft">What a person judges, one per line</span>
                    <textarea value={edit.judgement} onChange={(e) => setEdit({ ...edit, judgement: e.target.value })} rows={3} aria-label="What a person judges, one per line" />
                    <label className="row">
                      <span className="soft" style={{ whiteSpace: "nowrap" }}>
                        Price in dollars
                      </span>
                      <input type="number" min={10} max={10000} step={1} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
                    </label>
                    <div className="row">
                      <button
                        className="btn p s"
                        onClick={async () => {
                          await act("edit", {
                            action: "edit",
                            criteria: edit.criteria.split("\n"),
                            judgement: edit.judgement.split("\n"),
                            priceCents: Math.round(Number(edit.price)) * 100,
                          });
                          setEdit(null);
                        }}
                      >
                        Save
                      </button>
                      <button className="btn s" onClick={() => setEdit(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <Criteria job={job} />
                )}
                {job.priceReason && <p className="faint" style={{ marginTop: 10 }}>Why {usd(job.priceCents)}: {job.priceReason}</p>}
              </div>
            </>
          ) : (
            <>
              <div className="card pad">
                <div className="between" style={{ flexWrap: "wrap" }}>
                  <p className="label">Review</p>
                  {subs.length > 1 && (
                    <div className="seg" role="group" aria-label="Round">
                      {subs.map((_, i) => (
                        <button key={i} aria-pressed={i === shownRound} onClick={() => setRound(i)}>
                          Round {i + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!sub ? (
                  <p className="soft" style={{ marginTop: 8 }}>
                    {job.state === "funded"
                      ? "Waiting for a freelancer or their AI agent to take the job."
                      : "Nothing submitted yet. The Reviewer checks every criterion as soon as work arrives."}
                  </p>
                ) : !review ? (
                  <p className="soft row" style={{ marginTop: 8 }}>
                    <span className="spin" /> The Reviewer is checking round {shownRound + 1}…
                  </p>
                ) : (
                  <>
                    <p className="h3" style={{ margin: "8px 0 4px" }}>
                      {review.results.filter((r) => r.pass).length} of {review.results.length} AI checks met
                      {review.passed ? "" : ". The money stays held."}
                    </p>
                    <div className="divide">
                      {review.results.map((r) => (
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
                    <p className="faint" style={{ marginTop: 6 }}>
                      Checked by the Reviewer on {modelName(review.model)} · {ago(review.at)}
                    </p>
                    {(review.advisory?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <p className="h3">
                          For the person signing off <span className="faint">(notes only, the AI doesn&apos;t decide these)</span>
                        </p>
                        <div className="divide">
                          {review.advisory!.map((a) => (
                            <div className="crit" key={a.criterion}>
                              <span className="mk w" aria-label="Person decides">
                                ?
                              </span>
                              <div>
                                <p style={{ fontWeight: 600 }}>{a.criterion}</p>
                                <p className="soft" style={{ fontSize: 14 }}>
                                  {a.note}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(review.genericSignals?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <p className="h3">Reads as generic AI output</p>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                          {review.genericSignals!.map((g) => (
                            <li key={g} className="soft" style={{ fontSize: 14, padding: "2px 0" }}>
                              &ldquo;{g}&rdquo;
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sub.signoff && (
                      <p className={`pill ${sub.signoff.approved ? "pg" : "pa"}`} style={{ marginTop: 12, whiteSpace: "normal" }}>
                        {sub.signoff.approved ? "Signed off" : "Changes asked"} by {sub.signoff.by}
                        {sub.signoff.note ? `: ${sub.signoff.note}` : ""}
                      </p>
                    )}
                  </>
                )}
                {job.state !== "funded" && !sub && <Criteria job={job} />}
              </div>

              {sub && (
                <details className="card pad">
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    What {job.doer?.name ?? "the freelancer"} delivered in round {shownRound + 1}
                  </summary>
                  {sub.artefact && (
                    <p className="faint" style={{ marginTop: 8 }}>
                      {sub.artefact}
                    </p>
                  )}
                  <pre className="code" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
                    {sub.content}
                  </pre>
                </details>
              )}
            </>
          )}

          <div className="card pad">
            <p className="label" style={{ marginBottom: 12 }}>
              What happened
            </p>
            <ul className="tl">
              {[...job.events].reverse().map((e, i) => (
                <li key={i} className={e.kind ?? ""}>
                  <i aria-hidden="true" />
                  <span className="who">{e.by}</span> <span>{e.text}</span>
                  <div className="faint">{ago(e.at)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="stack">
          <div className="card pad">
            <p className="label">Money</p>
            {job.state === "draft" ? (
              <>
                <p style={{ margin: "8px 0 12px" }}>
                  Approve <b className="num">{usd(total)}</b>. PayPal holds it, and nothing is charged until the work passes review.
                </p>
                <div className="stack">
                  <button className="btn blue" disabled={busy !== null || Boolean(job.question) || Boolean(job.locked)} onClick={() => act("fund", { action: "fund" })}>
                    {busy === "fund" ? <span className="spin" /> : null} Approve with PayPal
                  </button>
                  <button
                    className="btn"
                    disabled={busy !== null || Boolean(job.question) || Boolean(job.locked)}
                    onClick={() => act("fund_card", { action: "fund_card" }, "Held on the sandbox test card.")}
                  >
                    {busy === "fund_card" ? <span className="spin" /> : null} Use the sandbox test card
                  </button>
                  {job.question && <p className="faint">Answer the Scoper&apos;s question first.</p>}
                  {job.project && job.project.step > 1 && (
                    <label className="row" style={{ cursor: "pointer", fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(job.locked)}
                        disabled={busy !== null}
                        onChange={(e) => act("waits", { action: "edit", waits: e.target.checked })}
                      />
                      <span>Wait until milestone {job.project.step - 1} is paid</span>
                    </label>
                  )}
                  {job.locked && (
                    <p className="faint">
                      This milestone opens once milestone {(job.project?.step ?? 2) - 1} is paid. Holding money only then keeps every PayPal hold well
                      inside its 29-day limit.
                    </p>
                  )}
                  <button className="btn ghost s" disabled={busy !== null} onClick={() => act("cancel", { action: "cancel" })}>
                    Discard
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bar" style={{ margin: "12px 0 8px" }} aria-hidden="true">
                  <i style={{ width: paid ? "100%" : "0%", background: "var(--sage)" }} />
                  <i style={{ width: held ? "100%" : "0%", background: "var(--blue)" }} />
                </div>
                <div className="between">
                  <span className="soft">{paid ? "Released" : held ? "Held in PayPal" : job.state === "cancelled" ? "Hold released" : "Not held"}</span>
                  <b className="num">{usd(total)}</b>
                </div>
                {job.payees.length > 0 && (
                  <div className="divide" style={{ marginTop: 12 }}>
                    {job.payees.map((p) => (
                      <div key={p.email} className="between" style={{ padding: "8px 0" }}>
                        <span>
                          {p.name} <span className="faint">· {p.role}</span>
                        </span>
                        <b className="num">{usd(p.amountCents)}</b>
                      </div>
                    ))}
                    <div className="between" style={{ padding: "8px 0" }}>
                      <span className="soft">Engine fee</span>
                      <span className="num">{usd(job.feeCents)}</span>
                    </div>
                  </div>
                )}
                {job.state === "passed" && job.releaseAt && (
                  <div className="stack" style={{ marginTop: 12 }}>
                    <p>
                      Releases in <Countdown until={job.releaseAt} /> unless someone appeals.
                    </p>
                    <button className="btn p" disabled={busy !== null} onClick={() => act("release", { action: "release" }, "Released. PayPal is paying out.")}>
                      {busy === "release" ? <span className="spin" /> : null} Release now
                    </button>
                    <button
                      className="btn s"
                      disabled={busy !== null}
                      onClick={() => {
                        const reason = window.prompt("What's wrong with the work?") ?? "";
                        if (reason.trim()) void act("appeal", { action: "appeal", reason }, "Appealed. The money stays held.");
                      }}
                    >
                      Appeal
                    </button>
                  </div>
                )}
                {job.state === "appealed" && (
                  <div className="stack" style={{ marginTop: 12 }}>
                    <p>A person decides. The money stays held until then.</p>
                    <button className="btn p s" disabled={busy !== null} onClick={() => act("settle", { action: "settle", outcome: "release" })}>
                      Release it anyway
                    </button>
                    <button className="btn s" disabled={busy !== null} onClick={() => act("settle", { action: "settle", outcome: "changes" })}>
                      Send back for changes
                    </button>
                  </div>
                )}
                {["funded", "changes"].includes(job.state) && (
                  <button className="btn ghost s" style={{ marginTop: 12 }} disabled={busy !== null} onClick={() => act("cancel", { action: "cancel" }, "Cancelled. PayPal released the hold.")}>
                    Cancel and release the hold
                  </button>
                )}
              </>
            )}
            <dl className="faint" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12.5 }}>
              {job.paypal.orderId && (
                <>
                  <dt>PayPal order</dt>
                  <dd className="num" style={{ margin: 0 }}>{job.paypal.orderId}</dd>
                </>
              )}
              {job.paypal.authorizationId && (
                <>
                  <dt>Authorization</dt>
                  <dd className="num" style={{ margin: 0 }}>{job.paypal.authorizationId}</dd>
                </>
              )}
              {job.paypal.captureId && (
                <>
                  <dt>Capture</dt>
                  <dd className="num" style={{ margin: 0 }}>{job.paypal.captureId}</dd>
                </>
              )}
              {job.paypal.payoutBatchId && (
                <>
                  <dt>Payout batch</dt>
                  <dd className="num" style={{ margin: 0 }}>{job.paypal.payoutBatchId}</dd>
                </>
              )}
              {job.paypal.invoiceId && (
                <>
                  <dt>Invoice</dt>
                  <dd className="num" style={{ margin: 0 }}>{job.paypal.invoiceId}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="card pad">
            <p className="label">What this job can see</p>
            <p style={{ margin: "8px 0" }}>
              <b>{d.shared.length}</b> facts from the Brain. <span className="soft">{d.withheld} held back, including everything marked never shared.</span>
            </p>
            <div className="divide">
              {d.shared.map((f) => (
                <div key={f.id} className="fact" style={{ padding: "7px 0" }}>
                  <span className="pill pn" style={{ fontSize: 12 }}>
                    {f.section}
                  </span>
                  <span style={{ fontSize: 13.5 }}>{f.text}</span>
                </div>
              ))}
            </div>
            {(d.passages?.length ?? 0) > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                  {d.passages.length} passage{d.passages.length === 1 ? "" : "s"} from your documents
                </summary>
                {d.passages.map((p) => (
                  <div key={p.id} style={{ padding: "8px 0", fontSize: 13.5 }}>
                    <p className="faint" style={{ overflowWrap: "anywhere" }}>
                      {p.title}
                    </p>
                    <p className="soft">{p.text}…</p>
                  </div>
                ))}
              </details>
            )}
            {(d.connectors?.length ?? 0) + (d.skills?.length ?? 0) > 0 && (
              <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {d.connectors.map((c) => (
                  <span key={c.id} className="pill pb" title={c.purpose}>
                    {c.name}
                  </span>
                ))}
                {d.skills.map((s) => (
                  <span key={s.id} className="pill pg">
                    Skill: {s.name}
                  </span>
                ))}
              </div>
            )}
            {d.privateDocs > 0 && (
              <p className="faint" style={{ marginTop: 8 }}>
                {d.privateDocs} private document{d.privateDocs === 1 ? "" : "s"} never searched for any job.
              </p>
            )}
          </div>

          {d.access.length > 0 && (
            <div className="card pad">
              <p className="label" style={{ marginBottom: 8 }}>
                Agent access log
              </p>
              {d.access.map((a, i) => (
                <div key={i} className="between" style={{ fontSize: 13, padding: "3px 0" }}>
                  <span>
                    {a.actor} · <code>{a.tool}</code>
                  </span>
                  <span className={a.allowed ? "faint" : ""} style={a.allowed ? undefined : { color: "var(--danger)" }}>
                    {a.allowed ? ago(a.at) : "blocked"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
