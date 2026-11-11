"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Job } from "@/lib/engine/types";

import { useEngine } from "../../_ui/use-engine";

const EXAMPLES = [
  "Rewrite the copy on our subscription page. It reads like a spec sheet and people leave. Make the first-month discount obvious.",
  "Write three short emails for people who started checkout but didn't buy. Friendly, no pressure.",
  "Write the FAQ for our wholesale page: minimum order, delivery days, and how to pay.",
];

export default function NewJob() {
  const { post } = useEngine();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function scope() {
    setBusy(true);
    const r = await post<{ job: Job }>("/api/engine/jobs", { request: text });
    setBusy(false);
    if (r) router.push(`/app/jobs/${r.job.id}`);
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <p className="label">New work</p>
      <h1 className="h1">
        What do you <em>need</em> done?
      </h1>
      <p className="soft" style={{ marginBottom: 18 }}>
        Plain words are fine. The Scoper reads your Company Brain, writes the acceptance criteria and suggests a fair price. You check it
        before any money is held.
      </p>
      <div className="card pad stack">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the work, the way you'd tell a friend."
          aria-label="Describe the work"
          rows={5}
          autoFocus
        />
        <div className="between" style={{ flexWrap: "wrap" }}>
          <span className="faint">{text.trim().length < 10 ? "A sentence or two is enough." : "Ready to scope."}</span>
          <button className="btn p" disabled={busy || text.trim().length < 10} onClick={scope}>
            {busy ? (
              <>
                <span className="spin" /> Scoping with the Brain…
              </>
            ) : (
              "Scope it"
            )}
          </button>
        </div>
      </div>
      <p className="label" style={{ margin: "22px 0 10px" }}>
        Or start from one of these
      </p>
      <div className="stack">
        {EXAMPLES.map((e) => (
          <button key={e} className="card pad" style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setText(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
