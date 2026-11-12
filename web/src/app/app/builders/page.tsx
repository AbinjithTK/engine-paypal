"use client";

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { type BuilderMode } from "@/lib/engine/types";

import { NoticeCard } from "../_ui/notice-card";
import { ago, useEngine } from "../_ui/use-engine";

const MODES: { id: BuilderMode; label: string }[] = [
  { id: "suggest", label: "Suggests" },
  { id: "ask", label: "Asks first" },
  { id: "auto", label: "On its own" },
];

/** These two run when work arrives, not on "Run now". */
const EVENT = new Set(["scoper", "reviewer"]);
const BUILT_IN = new Set(["scoper", "reviewer", "bookkeeper", "librarian", "scout"]);

const READS: Record<string, string> = {
  "brain.read": "Company Brain",
  "documents.read": "documents",
  "playbooks.read": "playbooks",
  "connectors.read": "connectors",
  "paypal.list_transactions": "PayPal sales",
  "jobs.read": "jobs",
};
function reads(tools: string[]) {
  const name = (t: string) =>
    READS[t] ?? (t.startsWith("paypal.") ? "PayPal invoicing" : t.startsWith("brain.") ? "Company Brain" : t.startsWith("email.") ? "email drafts" : t.replace(/[._]/g, " "));
  const r = [...new Set(tools.map(name))];
  return r.length ? r.join(", ") : "nothing";
}

type Options = {
  sections: { id: string; label: string; count: number }[];
  docs: { id: string; title: string }[];
  connectors: { id: string; name: string; purpose: string }[];
  skills: { id: string; name: string }[];
  privateDocs: number;
};

function Pick({ items, value, onChange }: { items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!items.length) return <p className="faint">None yet.</p>;
  return (
    <div className="picks">
      {items.map((i) => {
        const on = value.includes(i.id);
        return (
          <button
            key={i.id}
            type="button"
            className="pick"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i.id) : [...value, i.id])}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

function CreateBuilder({ onClose }: { onClose: () => void }) {
  const { post, toast } = useEngine();
  const [o, setO] = useState<Options | null>(null);
  const [f, setF] = useState({ name: "", job: "", scheduled: false, sections: [] as string[], docIds: [] as string[], connectorIds: [] as string[], skillIds: [] as string[], paypalSales: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Loading what a builder can be given is the external read this effect syncs with.
    void fetch("/api/engine/builders", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Options) => {
        setO(j);
        setF((x) => ({ ...x, sections: j.sections.filter((s) => s.count > 0).map((s) => s.id) }));
      });
  }, []);

  const given = f.sections.length + f.docIds.length + f.connectorIds.length + f.skillIds.length + (f.paypalSales ? 1 : 0);

  return (
    <form
      className="card pad-lg stack-lg"
      aria-label="Create a builder"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post("/api/engine/builders", { action: "create", ...f });
        setBusy(false);
        if (r) {
          toast(`${f.name} is ready. Press Run now to try it.`);
          onClose();
        }
      }}
    >
      <div className="between">
        <p className="h2">New builder</p>
        <button type="button" className="btn ghost s" onClick={onClose}>
          Cancel
        </button>
      </div>

      <label className="field">
        <span>Name</span>
        <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Wholesale follow-up" maxLength={40} />
      </label>
      <label className="field">
        <span>What should it do?</span>
        <textarea
          value={f.job}
          onChange={(e) => setF({ ...f, job: e.target.value })}
          placeholder="Look at our wholesale cafes and suggest which ones to follow up with this week, and what to say."
          maxLength={600}
        />
      </label>

      <div className="field">
        <span>What can it read?</span>
        {!o ? (
          <p className="faint">Loading…</p>
        ) : (
          <div className="stack">
            <div>
              <p className="faint">Company Brain</p>
              <Pick items={o.sections.map((s) => ({ id: s.id, label: `${s.label} · ${s.count}` }))} value={f.sections} onChange={(v) => setF({ ...f, sections: v })} />
            </div>
            <div>
              <p className="faint">Documents</p>
              <Pick items={o.docs.map((d) => ({ id: d.id, label: d.title }))} value={f.docIds} onChange={(v) => setF({ ...f, docIds: v })} />
            </div>
            <div>
              <p className="faint">Playbooks</p>
              <Pick items={o.skills.map((s) => ({ id: s.id, label: s.name }))} value={f.skillIds} onChange={(v) => setF({ ...f, skillIds: v })} />
            </div>
            <div>
              <p className="faint">Connectors</p>
              <Pick items={o.connectors.map((c) => ({ id: c.id, label: c.name }))} value={f.connectorIds} onChange={(v) => setF({ ...f, connectorIds: v })} />
            </div>
            <div>
              <p className="faint">PayPal</p>
              <Pick items={[{ id: "sales", label: "Recent sales" }]} value={f.paypalSales ? ["sales"] : []} onChange={(v) => setF({ ...f, paypalSales: v.length > 0 })} />
            </div>
            {o.privateDocs > 0 && <p className="faint">Private facts and {o.privateDocs} private document{o.privateDocs === 1 ? "" : "s"} are never shared with a builder.</p>}
          </div>
        )}
      </div>

      <label className="row" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={f.scheduled} onChange={(e) => setF({ ...f, scheduled: e.target.checked })} />
        <span>Run every morning at 09:00</span>
        <span className="faint">· each run uses AI credits</span>
      </label>

      <div className="between" style={{ flexWrap: "wrap" }}>
        <p className="faint">It suggests; you decide. No builder can move money.</p>
        <button className="btn p" disabled={busy || f.name.trim().length < 2 || f.job.trim().length < 15 || given === 0}>
          {busy ? "Creating…" : "Create builder"}
        </button>
      </div>
    </form>
  );
}

export default function Builders() {
  const { state, post, toast } = useEngine();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
      <div className="page-head">
        <div>
          <h1 className="h1">Builders</h1>
          <p className="soft">AI helpers for routine work. They suggest; you decide. None can move money.</p>
        </div>
        {!creating && (
          <button className="btn p" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" size={16} /> New builder
          </button>
        )}
      </div>

      {creating && <CreateBuilder onClose={() => setCreating(false)} />}

      {suggestions.length > 0 && (
        <div className="stack">
          {suggestions.map((n) => (
            <NoticeCard key={n.id} n={n} />
          ))}
        </div>
      )}

      <div className="builders">
        {state.builders.map((b) => {
          const runnable = !EVENT.has(b.id);
          const last = b.runs[0];
          return (
            <article key={b.id} className="card pad-lg builder">
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div className="row">
                  <span className={`dot ${b.paused ? "idle" : "ok"}`} />
                  <p className="h3">{b.name}</p>
                  {!BUILT_IN.has(b.id) && <span className="pill pn">Yours</span>}
                </div>
                <button className="btn ghost s" onClick={() => post("/api/engine/builders", { action: "pause", id: b.id, paused: !b.paused })}>
                  {b.paused ? "Resume" : "Pause"}
                </button>
              </div>
              <p className="builder-job">{b.job}</p>
              <dl className="meta">
                <div>
                  <dt>Runs</dt>
                  <dd>{runnable ? (b.scheduled ? "Daily at 09:00" : "When you press Run") : b.schedule}</dd>
                </div>
                <div>
                  <dt>Reads</dt>
                  <dd>{reads(b.tools)}</dd>
                </div>
                {last && (
                  <div>
                    <dt>Last run</dt>
                    <dd>
                      {ago(last.at)} · {last.summary}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="builder-foot">
                <div className="seg" role="group" aria-label={`How much ${b.name} does on its own`}>
                  {MODES.map((m) => (
                    <button key={m.id} aria-pressed={b.mode === m.id} onClick={() => post("/api/engine/builders", { action: "mode", id: b.id, mode: m.id })}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="row">
                  {runnable && (
                    <label className="row faint" style={{ cursor: "pointer" }} title={b.usesAi ? "Each run uses AI credits" : undefined}>
                      <input type="checkbox" checked={Boolean(b.scheduled)} onChange={(e) => post("/api/engine/builders", { action: "schedule", id: b.id, scheduled: e.target.checked })} />
                      Daily
                    </label>
                  )}
                  {runnable && (
                    <button className="btn s" disabled={busy !== null || b.paused} onClick={() => run(b.id)}>
                      {busy === b.id ? <span className="spin" /> : null} Run now
                    </button>
                  )}
                  {!BUILT_IN.has(b.id) && (
                    <button
                      className="btn ghost s"
                      onClick={async () => {
                        if (confirm(`Remove ${b.name}? Its suggestions stay on Home.`)) await post("/api/engine/builders", { action: "remove", id: b.id });
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
