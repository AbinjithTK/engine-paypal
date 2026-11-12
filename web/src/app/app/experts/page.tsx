import Link from "next/link";

import { read } from "@/lib/engine/db";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

/** Every expert the company can hire, with what they've done for it so far. */
export default function Experts() {
  const db = read();
  const rows = db.experts.map((e) => {
    const done = db.jobs.filter((j) => j.doer?.id === e.id && j.state === "paid");
    const active = db.jobs.filter((j) => j.doer?.id === e.id && !["paid", "cancelled"].includes(j.state));
    const invited = db.jobs.filter((j) => (j.invites ?? []).some((x) => x.expertId === e.id && x.status === "invited"));
    return { e, done, active, invited };
  });

  return (
    <>
      <p className="label">Experts</p>
      <h1 className="h1">
        The people who <em>steer</em> the work
      </h1>
      <p className="soft" style={{ marginBottom: 22, maxWidth: 760 }}>
        Each expert works with their own AI tools and sets the standard for their field. Open a profile to see what they&rsquo;ve done
        and invite them to a job. The Matcher also suggests the best fits on each team board.
      </p>
      <div className="experts">
        {rows.map(({ e, done, active, invited }) => (
          <Link key={e.id} href={`/app/experts/${e.id}`} className="card pad expert">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <span className="login-av" aria-hidden="true">
                {initials(e.name)}
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="h3">{e.name}</p>
                <p className="faint">{e.location}</p>
              </div>
              <span className={`dot ${e.available ? "ok" : "idle"}`} style={{ marginLeft: "auto", marginTop: 6 }} title={e.available ? "Available" : "Busy"} />
            </div>
            <p style={{ marginTop: 10 }}>{e.headline}</p>
            <div style={{ marginTop: 10 }}>
              {e.skills.slice(0, 4).map((s) => (
                <span key={s} className="pill pn" style={{ margin: "0 6px 6px 0" }}>
                  {s}
                </span>
              ))}
            </div>
            <p className="faint" style={{ marginTop: 6 }}>
              {[
                `About $${e.dayRateUsd.toLocaleString("en-US")} a day`,
                done.length ? `${done.length} paid job${done.length === 1 ? "" : "s"} here` : null,
                active.length ? `${active.length} in progress` : null,
                invited.length ? `${invited.length} invite${invited.length === 1 ? "" : "s"} open` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
