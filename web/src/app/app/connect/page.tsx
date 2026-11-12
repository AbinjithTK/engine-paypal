import Link from "next/link";

import { read } from "@/lib/engine/db";
import { handedTo } from "@/lib/engine/mcp";

export const dynamic = "force-dynamic";

/**
 * The owner's view of experts' AI agents. Each expert connects with their own
 * key from their own dashboard, so no key is ever shown here.
 */
export default function Connect() {
  const db = read();
  const rows = db.experts.map((e) => {
    const calls = db.access.filter((a) => a.actor === e.name);
    return { e, handed: handedTo(db, e.id), last: calls[0], refused: calls.filter((c) => !c.allowed).length };
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <p className="label">Connect</p>
      <h1 className="h1">
        Experts work from their <em>own</em> AI agents
      </h1>
      <p className="soft" style={{ marginBottom: 22 }}>
        When you hand an expert a job, its brief, facts, playbooks and tools appear in their Claude Code, Kiro or Cursor by themselves.
      </p>

      <div className="card">
        <div className="divide">
          {rows.map(({ e, handed, last, refused }) => (
            <div key={e.id} className="pad between" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                <Link href={`/app/experts/${e.id}`} className="h3">
                  {e.name}
                </Link>
                <p className="faint">{e.aiTools}</p>
                <p className="soft" style={{ marginTop: 4 }}>
                  {handed.length ? `In their agent now: ${handed.map((j) => j.title).join(", ")}` : "Nothing handed to them right now."}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span className={`pill ${last ? "pg" : "pn"}`}>{last ? "Agent connected" : "Not connected yet"}</span>
                {last && (
                  <p className="faint" style={{ marginTop: 6 }}>
                    Last call: {last.tool}
                    {refused ? ` · ${refused} refused` : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <p className="h3">What an expert&rsquo;s agent can and can&rsquo;t do</p>
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>It sees the work handed to that expert and funded jobs open to everyone. Other jobs are refused and logged.</li>
          <li>It reads only the Brain facts chosen for each job. Documents marked private are never sent.</li>
          <li>It can ask you a question, post updates, split the expert&rsquo;s pay with a helper, and submit work.</li>
          <li>It has no tool that captures, pays or refunds. Money moves only after review and your sign-off.</li>
        </ul>
      </div>
    </div>
  );
}
