"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Notice } from "@/lib/engine/types";

import { ago, useEngine } from "./use-engine";

const KIND: Record<Notice["kind"], { text: string; cls: string }> = {
  approval: { text: "Needs you", cls: "pb" },
  suggestion: { text: "Suggestion", cls: "pa" },
  done: { text: "Done for you", cls: "pg" },
};

export function NoticeCard({ n }: { n: Notice }) {
  const { post, toast } = useEngine();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");

  async function go(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const dismiss = () => go(() => post("/api/engine/builders", { action: "dismiss", notice: n.id }));

  return (
    <div className="card task">
      <div className="between" style={{ marginBottom: 8 }}>
        <span className={`pill ${KIND[n.kind].cls}`}>{KIND[n.kind].text}</span>
        <span className="faint">
          {n.builder ? `${n.builder} · ` : ""}
          {ago(n.createdAt)}
        </span>
      </div>
      <p className="q">{n.title}</p>
      <p className="why">{n.why}</p>

      {n.action === "release" && n.ref && (
        <div className="acts">
          <button
            className="btn p s"
            disabled={busy}
            onClick={() =>
              go(async () => {
                const r = await post("/api/engine/jobs/" + n.ref, { action: "release" });
                if (r) toast("Released. PayPal is paying out now.");
              })
            }
          >
            {busy ? <span className="spin" /> : null} Release now
          </button>
          <Link className="btn s" href={`/app/jobs/${n.ref}`}>
            Look first
          </Link>
        </div>
      )}

      {(n.action === "signoff" || n.action === "fund_next") && n.ref && (
        <div className="acts">
          <Link className="btn p s" href={`/app/jobs/${n.ref}`}>
            {n.action === "signoff" ? "Review and sign off" : "Fund it"}
          </Link>
        </div>
      )}

      {n.action === "post_job" && n.ref && (
        <div className="acts">
          <button
            className="btn p s"
            disabled={busy}
            onClick={() =>
              go(async () => {
                const r = await post<{ job: { id: string; project?: { id: string } } }>("/api/engine/jobs", { request: n.ref });
                if (r) {
                  await post("/api/engine/builders", { action: "dismiss", notice: n.id });
                  router.push(`/app/team/${r.job.project?.id ?? r.job.id}`);
                }
              })
            }
          >
            {busy ? <span className="spin" /> : null} Scope it and match a team
          </button>
          <button className="btn ghost s" disabled={busy} onClick={dismiss}>
            Not now
          </button>
        </div>
      )}

      {n.action === "invite" && n.ref && (
        <div className="acts">
          <Link className="btn p s" href={`/app/team/${n.ref}`}>
            Open the team board
          </Link>
          <button className="btn ghost s" disabled={busy} onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}

      {n.action === "answer_gap" && n.ref && (
        <form
          className="acts"
          style={{ flexDirection: "column", alignItems: "stretch" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!answer.trim()) return;
            void go(async () => {
              const r = await post("/api/engine/brain", { action: "answer_gap", id: n.ref, text: answer });
              if (r) toast("Answered and saved to the Brain.");
            });
          }}
        >
          <input type="text" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label="Your answer" />
          <div className="row">
            <button className="btn p s" disabled={busy || !answer.trim()}>
              Answer
            </button>
          </div>
        </form>
      )}

      {n.action === "confirm_fact" && n.ref && (
        <div className="acts">
          <button className="btn p s" disabled={busy} onClick={() => go(() => post("/api/engine/brain", { action: "confirm", id: n.ref }))}>
            Add it
          </button>
          <button className="btn s" disabled={busy} onClick={() => go(() => post("/api/engine/brain", { action: "retire", id: n.ref }))}>
            Not this one
          </button>
        </div>
      )}

      {n.action === "resolve_conflict" && (
        <div className="acts">
          <Link className="btn p s" href="/app/brain">
            Choose
          </Link>
        </div>
      )}

      {n.action === "build_agent" && (
        <div className="acts">
          <button
            className="btn p s"
            disabled={busy}
            onClick={() =>
              go(async () => {
                const r = await post("/api/engine/builders", { action: "accept", notice: n.id });
                if (r) toast("Built. It starts in suggest-only mode.");
              })
            }
          >
            Build it
          </button>
          <button className="btn s" disabled={busy} onClick={dismiss}>
            Not now
          </button>
        </div>
      )}

      {n.action === "open_job" && n.ref && (
        <div className="acts">
          <Link className="btn s" href={`/app/jobs/${n.ref}`}>
            Open
          </Link>
          {n.kind !== "approval" && (
            <button className="btn ghost s" disabled={busy} onClick={dismiss}>
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
