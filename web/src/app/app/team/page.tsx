"use client";

import Link from "next/link";

import type { Job } from "@/lib/engine/types";

import { usd, useEngine } from "../_ui/use-engine";

type Group = { key: string; title: string; jobs: Job[] };

export default function Teams() {
  const { state } = useEngine();
  if (!state) return <p className="soft">Loading…</p>;
  const groups: Group[] = [];
  for (const j of state.jobs) {
    if (j.state === "cancelled") continue;
    const key = j.project?.id ?? j.id;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, title: j.project?.title ?? j.title, jobs: [] }));
    g.jobs.push(j);
  }
  const name = (id: string) => id;

  return (
    <>
      <p className="label">Teams</p>
      <h1 className="h1">
        Who is on <em>each</em> piece of work
      </h1>
      <p className="soft" style={{ marginBottom: 20, maxWidth: 720 }}>
        Every project gets a team: one expert per role, matched from their profiles. Open a project to build or change its team.
      </p>
      {groups.length === 0 ? (
        <div className="card pad soft">
          No work yet. <Link className="link" href="/app/jobs/new">Post some</Link> and the Scoper proposes the roles.
        </div>
      ) : (
        <div className="huts" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", marginTop: 0 }}>
          {groups.map((g) => {
            const roles = [...g.jobs].sort((a, b) => (a.project?.step ?? 1) - (b.project?.step ?? 1));
            const filled = roles.filter((r) => r.doer).length;
            const total = roles.reduce((n, r) => n + r.priceCents, 0);
            return (
              <Link key={g.key} href={`/app/team/${g.key}`} className="hut" style={{ padding: "14px 16px" }}>
                <div className="t">
                  <span>{g.title}</span>
                </div>
                <p className="d">
                  {roles.length} role{roles.length === 1 ? "" : "s"} · {filled} filled · {usd(total)}
                </p>
                <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                  {roles.map((r) => {
                    const invited = (r.invites ?? []).filter((i) => i.status === "invited").length;
                    return (
                      <div key={r.id} className="between" style={{ fontSize: 13 }}>
                        <span className="pill pb" style={{ fontSize: 12 }}>
                          {r.role ?? "Expert"}
                        </span>
                        <span className="faint">{r.doer ? r.doer.name : invited ? `${invited} invited` : name("Open")}</span>
                      </div>
                    );
                  })}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
