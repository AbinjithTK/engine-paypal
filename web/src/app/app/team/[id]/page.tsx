"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Expert, Invite, Job, Match } from "@/lib/engine/types";

import { STATE_LABEL, usd, useEngine } from "../../_ui/use-engine";

type Role = {
  jobId: string;
  title: string;
  role: string;
  step: number;
  state: Job["state"];
  locked: boolean;
  priceCents: number;
  skills: string[];
  matches: Match[];
  invites: Invite[];
  doer: { id: string; name: string } | null;
  paidCents: number;
};
type Board = { title: string; projectId?: string; roles: Role[]; experts: Expert[]; totalCents: number };

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, size = 34, tone = "sand" }: { name: string; size?: number; tone?: "sand" | "blue" | "sage" }) {
  const bg = tone === "blue" ? "var(--blue-wash)" : tone === "sage" ? "var(--sage-wash)" : "var(--sand)";
  const fg = tone === "blue" ? "var(--blue-deep)" : tone === "sage" ? "var(--sage)" : "var(--ink)";
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, display: "grid", placeItems: "center", fontWeight: 700, fontSize: size * 0.36, flex: `0 0 ${size}px` }}
    >
      {initials(name)}
    </span>
  );
}

function Score({ n }: { n: number }) {
  return (
    <span className="row" style={{ gap: 6 }} title={`Fit ${n} of 100`}>
      <span className="bar" style={{ width: 54, height: 6 }} aria-hidden="true">
        <i style={{ width: `${Math.max(4, Math.min(100, n))}%`, background: n >= 70 ? "var(--sage)" : n >= 45 ? "var(--blue)" : "var(--line-strong)" }} />
      </span>
      <span className="num faint" style={{ fontSize: 12 }}>
        {n}
      </span>
    </span>
  );
}

export default function TeamBoard() {
  const { id } = useParams<{ id: string }>();
  const { post, toast } = useEngine();
  const [b, setB] = useState<Board | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/engine/team/${id}`, { cache: "no-store" });
    if (r.ok) setB(await r.json());
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling the team endpoint
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  async function act(jobId: string, body: Record<string, unknown>, ok?: string) {
    setBusy(jobId);
    const r = await post(`/api/engine/jobs/${jobId}`, body);
    setBusy(null);
    if (r && ok) toast(ok);
    if (r && body.action === "invite") setFresh(`${jobId}:${body.expertId}`);
    await load();
  }

  if (!b) return <p className="soft">Loading the team…</p>;
  const byId = new Map(b.experts.map((e) => [e.id, e]));
  const filled = b.roles.filter((r) => r.doer).length;
  const invitedCount = b.roles.filter((r) => !r.doer && r.invites.some((i) => i.status === "invited")).length;
  const pickedExpert = picked ? byId.get(picked) : undefined;

  function dropOn(role: Role, expertId: string | null) {
    setOver(null);
    setDrag(null);
    if (!expertId) return;
    const e = byId.get(expertId);
    if (role.doer) return toast(`${role.role} is already filled by ${role.doer.name}.`, true);
    if (!["draft", "funded"].includes(role.state)) return toast("This role can't take invites now.", true);
    void act(role.jobId, { action: "invite", expertId }, `Invited ${e?.name ?? "them"} as ${role.role}.`);
    setPicked(null);
  }

  return (
    <>
      <Link href="/app/team" className="faint">
        ← All teams
      </Link>
      <div className="between" style={{ alignItems: "flex-end", margin: "8px 0 18px", flexWrap: "wrap" }}>
        <div>
          <p className="label">Team builder</p>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Build the <em>team</em> for {b.title}
          </h1>
          <p className="soft">
            {b.roles.length} role{b.roles.length === 1 ? "" : "s"} · {filled} filled · {invitedCount} waiting on an invite · {usd(b.totalCents)} across the project
          </p>
        </div>
        <p className="faint" style={{ maxWidth: 380 }}>
          Drag an expert onto a role, or press Invite under a suggestion. The Matcher ranks people from their profiles; you decide.
        </p>
      </div>

      <section className="mw-org" aria-label="Team">
        <div className="mw-org-root">
          <Avatar name="You" size={40} tone="blue" />
          <div>
            <p className="h3">You, the founder</p>
            <p className="faint">Set the direction and sign off the judgement calls</p>
          </div>
        </div>
        <div className="mw-org-row">
          {b.roles.map((r) => {
            const invites = r.invites.filter((i) => i.status === "invited");
            const declined = r.invites.filter((i) => i.status === "declined");
            const isOver = over === r.jobId;
            const canDrop = !r.doer && ["draft", "funded"].includes(r.state);
            return (
              <div key={r.jobId} className="mw-org-slot">
                <div
                  className={`card pad mw-drop${isOver && canDrop ? " over" : ""}${r.doer ? " filled" : ""}`}
                  onDragOver={(e) => {
                    if (canDrop) {
                      e.preventDefault();
                      setOver(r.jobId);
                    }
                  }}
                  onDragLeave={() => setOver((o) => (o === r.jobId ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropOn(r, e.dataTransfer.getData("text/plain") || drag);
                  }}
                >
                  <div className="between">
                    <span className="pill pb">{r.role}</span>
                    <span className={`pill ${r.locked ? "pn" : STATE_LABEL[r.state].cls}`} style={{ fontSize: 12 }}>
                      {r.locked ? "Opens later" : STATE_LABEL[r.state].text}
                    </span>
                  </div>
                  <Link href={`/app/jobs/${r.jobId}`} className="h3" style={{ display: "block", margin: "8px 0 2px" }}>
                    {b.roles.length > 1 ? `${r.step}. ` : ""}
                    {r.title}
                  </Link>
                  <p className="faint">
                    {usd(r.priceCents)} · {r.skills.slice(0, 3).join(", ")}
                  </p>

                  <div className="mw-seat">
                    {r.doer ? (
                      <div className="row mw-pop">
                        <Avatar name={r.doer.name} tone="sage" />
                        <div>
                          <p style={{ fontWeight: 600 }}>{r.doer.name}</p>
                          <p className="faint">{r.state === "paid" ? `Paid ${usd(r.paidCents)}` : "On the job"}</p>
                        </div>
                      </div>
                    ) : invites.length ? (
                      invites.map((i) => {
                        const e = byId.get(i.expertId);
                        return (
                          <div key={i.expertId} className={`stack${fresh === `${r.jobId}:${i.expertId}` ? " mw-pop" : ""}`} style={{ gap: 6 }}>
                            <span className="row">
                              <Avatar name={e?.name ?? "?"} tone="blue" />
                              <span style={{ minWidth: 0 }}>
                                <span style={{ fontWeight: 600 }}>{e?.name}</span>
                                <span className="faint" style={{ display: "block" }}>
                                  {r.state === "draft" ? "Invited · sees it once funded" : "Invited · waiting for them"}
                                </span>
                              </span>
                            </span>
                            <button className="btn ghost s" style={{ alignSelf: "flex-start" }} disabled={busy === r.jobId} onClick={() => act(r.jobId, { action: "uninvite", expertId: i.expertId })}>
                              Withdraw invite
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="faint mw-empty">{canDrop ? (pickedExpert ? "" : "Drop an expert here") : "No invite needed now"}</p>
                    )}
                    {pickedExpert && canDrop && (
                      <button className="btn p s" onClick={() => dropOn(r, pickedExpert.id)}>
                        Invite {pickedExpert.name.split(" ")[0]} here
                      </button>
                    )}
                    {declined.length > 0 && <p className="faint">Declined: {declined.map((d) => byId.get(d.expertId)?.name).join(", ")}</p>}
                  </div>
                </div>

                {!r.doer && r.matches.length > 0 && (
                  <div className="card pad" style={{ marginTop: 10 }}>
                    <div className="between">
                      <p className="label">Best fits</p>
                      <button className="btn ghost s" disabled={busy === r.jobId} onClick={() => act(r.jobId, { action: "rematch" }, "Matched again.")}>
                        {busy === r.jobId ? <span className="spin" /> : null} Re-rank
                      </button>
                    </div>
                    <div className="divide">
                      {r.matches.filter((m) => m.score >= 20).slice(0, 3).map((m) => {
                        const e = byId.get(m.expertId);
                        if (!e) return null;
                        const already = r.invites.some((i) => i.expertId === m.expertId && i.status === "invited");
                        return (
                          <div
                            key={m.expertId}
                            className={canDrop && !already ? "mw-drag" : undefined}
                            style={{ padding: "10px 0" }}
                            draggable={canDrop && !already}
                            onDragStart={(ev) => {
                              ev.dataTransfer.setData("text/plain", m.expertId);
                              ev.dataTransfer.effectAllowed = "copy";
                              setDrag(m.expertId);
                            }}
                            onDragEnd={() => {
                              setDrag(null);
                              setOver(null);
                            }}
                          >
                            <div className="between">
                              <span className="row">
                                <Avatar name={e.name} size={28} />
                                <span style={{ fontWeight: 600 }}>{e.name}</span>
                              </span>
                              <Score n={m.score} />
                            </div>
                            <p className="soft" style={{ fontSize: 13, margin: "4px 0 6px" }}>
                              {m.reason}
                            </p>
                            {canDrop && (
                              <button className="btn s" disabled={already || busy === r.jobId} onClick={() => dropOn(r, m.expertId)}>
                                {already ? "Invited" : "Invite"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 28 }} aria-label="Experts">
        <div className="between" style={{ marginBottom: 10, flexWrap: "wrap" }}>
          <h2 className="h2" style={{ margin: 0 }}>
            The <em>bench</em>
          </h2>
          <p className="faint">{pickedExpert ? `${pickedExpert.name} picked: press "Invite here" on a role, or pick again to cancel.` : "Drag a card onto a role, or pick it and choose a role."}</p>
        </div>
        <div className="huts" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", marginTop: 0 }}>
          {b.experts.map((e) => {
            const onTeam = b.roles.some((r) => r.doer?.id === e.id);
            return (
              <div
                key={e.id}
                className={`hut mw-drag${picked === e.id ? " picked" : ""}${drag === e.id ? " lifting" : ""}`}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData("text/plain", e.id);
                  ev.dataTransfer.effectAllowed = "copy";
                  setDrag(e.id);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                style={{ padding: "12px 14px" }}
              >
                <div className="row" style={{ alignItems: "flex-start" }}>
                  <Avatar name={e.name} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="between">
                      <b>{e.name}</b>
                      <span className="row faint" style={{ gap: 4, fontSize: 12 }}>
                        <span className={`dot ${e.available ? "ok" : "idle"}`} style={{ margin: 0 }} />
                        {e.available ? "Available" : "Busy"}
                      </span>
                    </div>
                    <p className="d" style={{ fontSize: 13 }}>
                      {e.headline}
                    </p>
                  </div>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 4, margin: "8px 0" }}>
                  {e.skills.slice(0, 4).map((s) => (
                    <span key={s} className="pill pn" style={{ fontSize: 12 }}>
                      {s}
                    </span>
                  ))}
                </div>
                <p className="faint" style={{ fontSize: 12 }}>
                  About {usd(e.dayRateUsd * 100, { whole: true })} a day · {e.location}
                  {onTeam ? " · on this team" : ""}
                </p>
                <p className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                  AI: {e.aiTools}
                </p>
                <button className="btn s" style={{ marginTop: 8 }} onClick={() => setPicked((p) => (p === e.id ? null : e.id))} aria-pressed={picked === e.id}>
                  {picked === e.id ? "Picked" : "Pick"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
