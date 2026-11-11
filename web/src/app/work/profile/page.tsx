"use client";

import { useState } from "react";

import type { Expert } from "@/lib/engine/types";

import { SignIn, Toast, send, useMe, useToast } from "../_ui";

function Form({ me, onSaved }: { me: Expert; onSaved: () => void }) {
  const t = useToast();
  const [f, setF] = useState({
    headline: me.headline,
    skills: me.skills.join(", "),
    pastWork: me.pastWork.join("\n"),
    dayRateUsd: String(me.dayRateUsd),
    available: me.available,
    aiTools: me.aiTools,
  });
  return (
    <form
      className="card pad stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await send("/api/work/me", {
          action: "profile",
          headline: f.headline,
          skills: f.skills.split(","),
          pastWork: f.pastWork.split("\n"),
          dayRateUsd: Number(f.dayRateUsd),
          available: f.available,
          aiTools: f.aiTools,
        });
        t.show(r.ok ? "Saved. The Matcher uses it from the next job." : r.error, !r.ok);
        if (r.ok) onSaved();
      }}
    >
      <label className="stack" style={{ gap: 6 }}>
        <span className="h3">What you do, in one line</span>
        <input type="text" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} />
      </label>
      <label className="stack" style={{ gap: 6 }}>
        <span className="h3">Skills, separated by commas</span>
        <input type="text" value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} />
      </label>
      <label className="stack" style={{ gap: 6 }}>
        <span className="h3">Past work, one per line, with a result where you have one</span>
        <textarea rows={4} value={f.pastWork} onChange={(e) => setF({ ...f, pastWork: e.target.value })} />
      </label>
      <label className="stack" style={{ gap: 6 }}>
        <span className="h3">How you work with AI</span>
        <input type="text" value={f.aiTools} onChange={(e) => setF({ ...f, aiTools: e.target.value })} />
      </label>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="row">
          <span className="soft">Day rate (USD)</span>
          <input type="number" min={50} max={20000} value={f.dayRateUsd} onChange={(e) => setF({ ...f, dayRateUsd: e.target.value })} style={{ width: 120 }} />
        </label>
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} />
          <span>Available for new work</span>
        </label>
      </div>
      <p className="faint">Payouts go to {me.email} through PayPal.</p>
      <div>
        <button className="btn p">Save profile</button>
      </div>
      <Toast msg={t.msg} />
    </form>
  );
}

export default function Profile() {
  const { me, reload } = useMe();
  if (!me) return <p className="soft">Loading…</p>;
  if (!me.me) return <SignIn data={me} onDone={() => void reload()} />;
  return (
    <div style={{ maxWidth: 720 }}>
      <p className="label">Profile</p>
      <h1 className="h1">
        What the Matcher <em>reads</em>
      </h1>
      <p className="soft" style={{ marginBottom: 18 }}>
        Founders never search for you by keyword. The Matcher reads this against each job and explains why you fit, so specifics win.
      </p>
      <Form key={me.me.id} me={me.me} onSaved={() => void reload()} />
    </div>
  );
}
