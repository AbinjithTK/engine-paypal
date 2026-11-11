"use client";

import { useState } from "react";

import { areaName, type BuilderMode } from "@/lib/engine/types";

import { NoticeCard } from "../_ui/notice-card";
import { ago, useEngine } from "../_ui/use-engine";

const MODES: { id: BuilderMode; label: string }[] = [
  { id: "suggest", label: "Suggest only" },
  { id: "ask", label: "Ask first" },
  { id: "auto", label: "Do it and tell me" },
];

const RUNNABLE = new Set(["scout", "bookkeeper", "librarian"]);

export default function Builders() {
  const { state, post, toast } = useEngine();
  const [busy, setBusy] = useState<string | null>(null);
  if (!state) return <p className="soft">Loading…</p>;
  const suggestions = state.notices.filter((n) => n.action === "build_agent");

  async function run(id: string) {
    setBusy(id);
    const r = await post<{ summary: string }>("/api/engine/builders", { action: "run", id });
    setBusy(null);
    if (r) toast(r.summary);
  }

  return (
    <>
      <p className="label">Builders</p>
      <h1 className="h1">
        AI helpers for the <em>routine</em> work
      </h1>
      <p className="soft" style={{ marginBottom: 22, maxWidth: 780 }}>
        Each builder owns one part of the business and runs on a schedule or when something happens. None of them can move money:
        payments follow a passed review, in code no model can call. You choose how much each one does on its own.
      </p>

      {suggestions.length > 0 && (
        <div className="stack" style={{ marginBottom: 20 }}>
          {suggestions.map((n) => (
            <NoticeCard key={n.id} n={n} />
          ))}
        </div>
      )}

      <div className="stack">
        {state.builders.map((b) => (
          <div key={b.id} className="card pad">
            <div className="between" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: "1 1 360px" }}>
                <div className="row">
                  <span className={`dot ${b.paused ? "idle" : "ok"}`} />
                  <p className="h3">{b.name}</p>
                  <span className="faint">Looks after {areaName(b.building)}</span>
                </div>
                <p style={{ marginTop: 6 }}>{b.job}</p>
                <p className="faint" style={{ marginTop: 6 }}>
                  Runs: {RUNNABLE.has(b.id) ? (b.scheduled ? "daily at 09:00, and when you press Run now" : "only when you press Run now") : b.schedule} · Tools:{" "}
                  {b.tools.join(", ") || "none"} · Can move money: no{b.usesAi ? " · Uses AI credits each run" : ""}
                </p>
                {RUNNABLE.has(b.id) && (
                  <label className="row" style={{ marginTop: 8, cursor: "pointer", fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(b.scheduled)}
                      onChange={(e) => post("/api/engine/builders", { action: "schedule", id: b.id, scheduled: e.target.checked })}
                    />
                    <span>
                      Run every morning at 09:00{b.usesAi ? " (each run calls the AI model, so it costs credits)" : ""}
                    </span>
                  </label>
                )}
              </div>
              <div className="stack" style={{ alignItems: "flex-end" }}>
                <div className="seg" role="group" aria-label={`How much ${b.name} does on its own`}>
                  {MODES.map((m) => (
                    <button key={m.id} aria-pressed={b.mode === m.id} onClick={() => post("/api/engine/builders", { action: "mode", id: b.id, mode: m.id })}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="row">
                  {RUNNABLE.has(b.id) && (
                    <button className="btn s" disabled={busy !== null || b.paused} onClick={() => run(b.id)}>
                      {busy === b.id ? <span className="spin" /> : null} Run now
                    </button>
                  )}
                  <button className="btn ghost s" onClick={() => post("/api/engine/builders", { action: "pause", id: b.id, paused: !b.paused })}>
                    {b.paused ? "Resume" : "Pause"}
                  </button>
                </div>
              </div>
            </div>
            {b.approvedUnchanged >= 10 && b.mode !== "auto" && (
              <p className="pill pb" style={{ marginTop: 10 }}>
                You approved {b.approvedUnchanged} of its suggestions unchanged. You could let it act on its own.
              </p>
            )}
            {b.runs.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="faint" style={{ cursor: "pointer" }}>
                  Last run {ago(b.runs[0].at)}: {b.runs[0].summary}
                </summary>
                <ul className="tl" style={{ marginTop: 10 }}>
                  {b.runs.slice(0, 8).map((r, i) => (
                    <li key={i} className={r.ok ? "ai" : ""}>
                      <i aria-hidden="true" />
                      {r.summary}
                      <div className="faint">
                        {ago(r.at)}
                        {r.tools.length ? ` · ${r.tools.join(", ")}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
