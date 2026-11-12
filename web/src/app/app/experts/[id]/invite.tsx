"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEngine } from "../../_ui/use-engine";

type Open = { id: string; title: string; role?: string; priceCents: number; funded: boolean; score?: number };

const usd = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;

export function InviteBox({ expertId, name, jobs }: { expertId: string; name: string; jobs: Open[] }) {
  const { post, toast } = useEngine();
  const router = useRouter();
  const [pick, setPick] = useState(jobs[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const job = jobs.find((j) => j.id === pick);

  return (
    <section className="card pad stack" aria-label={`Invite ${name}`}>
      <p className="h3">Hand {name} a job</p>
      {jobs.length === 0 ? (
        <p className="soft">No open jobs to hand over. Post new work first, then invite {name} from here or from the team board.</p>
      ) : (
        <>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Job">
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.role ? ` (${j.role})` : ""} · {usd(j.priceCents)}
                {j.score !== undefined ? ` · fit ${j.score}` : ""}
              </option>
            ))}
          </select>
          {job && !job.funded && (
            <p className="faint">This job isn&rsquo;t funded yet. {name} sees the invite once the money is held in PayPal.</p>
          )}
          <div>
            <button
              className="btn p"
              disabled={!pick || busy}
              onClick={async () => {
                setBusy(true);
                const r = await post(`/api/engine/jobs/${pick}`, { action: "invite", expertId });
                setBusy(false);
                if (r) {
                  toast(`Invited ${name}. The brief and resources are in their agent now.`);
                  router.refresh();
                }
              }}
            >
              {busy ? "Inviting…" : `Invite ${name}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
