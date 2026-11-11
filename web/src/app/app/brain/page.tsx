"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import type { BrainSection, Connector, Doc, Fact, Gap, Interview, SearchMode, Skill } from "@/lib/engine/types";

import { DocsTab, SearchTab, ToolsTab } from "./parts";

import { ago, useEngine } from "../_ui/use-engine";

export type Brain = {
  company: { name: string; owner: string; onboarded: boolean };
  sections: { id: BrainSection; label: string; hint: string }[];
  facts: Fact[];
  gaps: Gap[];
  interview: Interview;
  docs: Doc[];
  connectors: Connector[];
  skills: Skill[];
  search: { mode: SearchMode; chosen: SearchMode; elasticConfigured: boolean; passages: number; suggestElastic: boolean; suggestAt: number };
};

function source(f: Fact): string {
  switch (f.source.kind) {
    case "interview":
      return "from your interview";
    case "founder":
      return "you added this";
    case "website":
      return "from your website";
    case "review":
      return `learned from a review on ${f.source.jobId}`;
    case "client_answer":
      return `your answer on ${f.source.jobId}`;
    case "paypal":
      return "from PayPal";
    case "document":
      return `from ${f.source.title}`;
  }
}

const TABS = [
  { id: "facts", label: "Facts" },
  { id: "docs", label: "Documents" },
  { id: "tools", label: "Connectors and skills" },
  { id: "search", label: "Search" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function Page() {
  return (
    <Suspense fallback={<p className="soft">Opening the library…</p>}>
      <BrainPage />
    </Suspense>
  );
}

function BrainPage() {
  const { post, toast } = useEngine();
  const [b, setB] = useState<Brain | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [newFact, setNewFact] = useState<{ section: BrainSection; text: string }>({ section: "rules", text: "" });
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return TABS.some((x) => x.id === t) ? (t as Tab) : "facts";
  });
  const chatEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/engine/brain", { cache: "no-store" });
    if (r.ok) setB(await r.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the brain endpoint
    void load();
  }, [load]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [b?.interview.length]);

  async function act(name: string, body: Record<string, unknown>, ok?: string) {
    setBusy(name);
    const r = await post<{ added?: Fact[] }>("/api/engine/brain", body);
    setBusy(null);
    if (r?.added?.length) setFresh(new Set(r.added.map((f) => f.id)));
    if (r && ok) toast(ok);
    await load();
    return r;
  }

  if (!b) return <p className="soft">Opening the library…</p>;

  const live = b.facts;
  const conflicts = live.filter((f) => f.conflictsWith);
  const waiting = live.filter((f) => !f.confirmed && !f.conflictsWith);
  const openGaps = b.gaps.filter((g) => !g.answer);

  return (
    <>
      <p className="label">{b.company.name}</p>
      <h1 className="h1">
        Your Company <em>Brain</em>
      </h1>
      <p className="soft" style={{ marginBottom: 22, maxWidth: 760 }}>
        Everything Engine knows about {b.company.name}, with where each fact came from. Each job gets only the facts it needs, and
        anything under &ldquo;Never shared&rdquo; never leaves.
      </p>

      <div className="seg" role="group" aria-label="Brain sections" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "docs" && b.docs.length ? ` (${b.docs.length})` : ""}
            {t.id === "tools" && b.connectors.length + b.skills.length ? ` (${b.connectors.length + b.skills.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "docs" && <DocsTab b={b} reload={load} />}
      {tab === "tools" && <ToolsTab b={b} reload={load} />}
      {tab === "search" && <SearchTab b={b} reload={load} />}

      <div className="grid2 even" style={{ display: tab === "facts" ? undefined : "none" }}>
        <section className="card pad stack" aria-label="Interview">
          <div className="between">
            <p className="label">Interview</p>
            <span className="faint">
              {(() => {
                const n = b.interview.filter((m) => m.role === "founder").length;
                return `${n} answer${n === 1 ? "" : "s"}`;
              })()}
            </span>
          </div>
          <div className="chat" style={{ maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
            {b.interview.map((m, i) => (
              <div key={i} className={`bub ${m.role === "engine" ? "e" : "f"}`}>
                {m.text}
              </div>
            ))}
            {busy === "answer" && (
              <div className="bub e row">
                <span className="spin" /> Writing that down…
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              const t = text;
              setText("");
              const r = await act("answer", { action: "answer", text: t });
              if (!r) setText(t);
            }}
          >
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Answer in your own words" aria-label="Your answer" />
            <div className="between">
              <span className="faint">Engine files each fact and asks the next useful question.</span>
              <button className="btn p" disabled={busy !== null || !text.trim()}>
                Send
              </button>
            </div>
          </form>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void act("import", { action: "import", url: url.trim() }, "Read your website. New facts wait for you to confirm.");
            }}
          >
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-website.com" aria-label="Website address" />
            <button className="btn" disabled={busy !== null || !url.trim()}>
              {busy === "import" ? <span className="spin" /> : null} Read site
            </button>
          </form>
        </section>

        <section className="stack" aria-label="What Engine believes">
          {conflicts.map((f) => {
            const other = live.find((x) => x.id === f.conflictsWith);
            return (
              <div key={f.id} className="card task" style={{ borderColor: "var(--amber)" }}>
                <span className="pill pa">These disagree</span>
                <p className="why" style={{ marginTop: 8 }}>
                  Pick the one that&apos;s true. The other is retired.
                </p>
                <div className="acts" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <button className="btn s" style={{ justifyContent: "flex-start", height: "auto", padding: "8px 14px", whiteSpace: "normal", textAlign: "left" }} onClick={() => act("r", { action: "resolve", keep: f.id, drop: f.conflictsWith })}>
                    {f.text} <span className="faint">({source(f)})</span>
                  </button>
                  {other && (
                    <button className="btn s" style={{ justifyContent: "flex-start", height: "auto", padding: "8px 14px", whiteSpace: "normal", textAlign: "left" }} onClick={() => act("r", { action: "resolve", keep: other.id, drop: f.id })}>
                      {other.text} <span className="faint">({source(other)})</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {openGaps.length > 0 && (
            <div className="card pad">
              <p className="label">Questions freelancers asked</p>
              {openGaps.map((g) => (
                <GapRow key={g.id} g={g} onAnswer={(t) => act("gap", { action: "answer_gap", id: g.id, text: t }, "Answered and saved.")} />
              ))}
            </div>
          )}

          <div className="huts four" style={{ marginTop: 0 }}>
            <div className="hut">
              <div className="d">Facts</div>
              <div className="h3 num">{live.length}</div>
            </div>
            <div className="hut">
              <div className="d">Confirmed</div>
              <div className="h3 num">{live.filter((f) => f.confirmed).length}</div>
            </div>
            <div className="hut">
              <div className="d">To check</div>
              <div className="h3 num">{waiting.length}</div>
            </div>
            <div className="hut">
              <div className="d">Conflicts</div>
              <div className="h3 num">{conflicts.length}</div>
            </div>
          </div>

          {b.sections.map((s) => {
            const rows = live.filter((f) => f.section === s.id && !f.conflictsWith);
            if (!rows.length) return null;
            return (
              <div key={s.id} className="card pad" style={s.id === "private" ? { background: "var(--sand)" } : undefined}>
                <div className="between">
                  <p className="h3">{s.label}</p>
                  <span className="faint">{s.id === "private" ? "Never leaves the Brain" : s.hint}</span>
                </div>
                <div className="divide" style={{ marginTop: 6 }}>
                  {rows.map((f) => (
                    <div key={f.id} className="fact" style={fresh.has(f.id) ? { background: "var(--blue-wash)", borderRadius: 8, paddingInline: 8 } : undefined}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p>{f.text}</p>
                        <p className="src">
                          {source(f)} · {ago(f.createdAt)}
                          {!f.confirmed && " · not yet confirmed"}
                        </p>
                      </div>
                      {!f.confirmed && (
                        <button className="btn s" onClick={() => act("c", { action: "confirm", id: f.id })}>
                          Confirm
                        </button>
                      )}
                      <button className="btn ghost s" aria-label={`Remove: ${f.text}`} onClick={() => act("x", { action: "retire", id: f.id })}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <form
            className="card pad stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (newFact.text.trim()) {
                void act("add", { action: "add", ...newFact }, "Added.");
                setNewFact({ ...newFact, text: "" });
              }
            }}
          >
            <p className="label">Add a fact yourself</p>
            <div className="row">
              <select value={newFact.section} onChange={(e) => setNewFact({ ...newFact, section: e.target.value as BrainSection })} aria-label="Section" style={{ width: 190 }}>
                {b.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input type="text" value={newFact.text} onChange={(e) => setNewFact({ ...newFact, text: e.target.value })} placeholder="e.g. Ship files as Google Docs" aria-label="Fact" />
              <button className="btn" disabled={!newFact.text.trim()}>
                Add
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

function GapRow({ g, onAnswer }: { g: Gap; onAnswer: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <form
      className="stack"
      style={{ padding: "10px 0" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (t.trim()) onAnswer(t);
      }}
    >
      <p>
        <b>{g.askedBy}</b> asks: {g.question}
      </p>
      <div className="row">
        <input type="text" value={t} onChange={(e) => setT(e.target.value)} aria-label="Answer" placeholder="Your answer" />
        <button className="btn p s" disabled={!t.trim()}>
          Answer
        </button>
      </div>
    </form>
  );
}
