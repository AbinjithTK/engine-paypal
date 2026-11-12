"use client";

import { useCallback, useEffect, useState } from "react";

import { SignIn, Toast, usd, useMe, useToast } from "../_ui";

type Agent = {
  url: string;
  token: string | null;
  handed: { id: string; title: string; role?: string; status: string; priceCents: number }[];
  resources: { uri: string; title: string; description: string }[];
  calls: { at: string; tool: string; target?: string; allowed: boolean; note?: string }[];
};

function Copy({ text, label, onCopied }: { text: string; label: string; onCopied: () => void }) {
  return (
    <button
      className="btn s"
      type="button"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        onCopied();
      }}
    >
      {label}
    </button>
  );
}

export default function AgentPage() {
  const { me, reload } = useMe();
  const [a, setA] = useState<Agent | null>(null);
  const [show, setShow] = useState(false);
  const t = useToast();

  const load = useCallback(async () => {
    const r = await fetch("/api/work/agent", { cache: "no-store" });
    if (r.ok) setA(await r.json());
  }, []);
  useEffect(() => {
    if (!me?.me) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling what the expert's agent sees
    void load();
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 5000);
    return () => clearInterval(id);
  }, [me?.me, load]);

  if (!me) return <p className="soft">Loading…</p>;
  if (!me.me) return <SignIn data={me} onDone={reload} />;
  if (!a) return <p className="soft">Loading your agent settings…</p>;

  const token = a.token ?? "";
  const shown = show ? token : token.replace(/.(?=.{4})/g, "•");
  const claude = `claude mcp add --transport http engine ${a.url} \\\n  --header "Authorization: Bearer ${token}"`;
  const json = JSON.stringify({ mcpServers: { engine: { type: "http", url: a.url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

  return (
    <div style={{ maxWidth: 900 }}>
      <p className="label">Your AI agent</p>
      <h1 className="h1">
        Work from <em>your own</em> tools
      </h1>
      <p className="soft" style={{ marginBottom: 22 }}>
        Connect Claude Code, Kiro, Cursor or any MCP client with your own key. When {me.company} hands you a job, its brief, the company
        facts it needs, its playbooks and its tools show up in your agent by themselves. Nobody has to copy anything over.
      </p>

      <div className="stack">
        <section className="card pad stack" aria-label="Your key">
          <div className="between" style={{ flexWrap: "wrap" }}>
            <p className="h3">Your key</p>
            <span className="faint">Only for {me.me.name}. Keep it private.</span>
          </div>
          {token ? (
            <>
              <code className="code" style={{ display: "block", wordBreak: "break-all" }}>
                {shown}
              </code>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn s" type="button" onClick={() => setShow(!show)}>
                  {show ? "Hide" : "Show"}
                </button>
                <Copy text={token} label="Copy key" onCopied={() => t.show("Key copied.")} />
              </div>
            </>
          ) : (
            <p className="soft">This deployment has no signing secret set, so keys can&rsquo;t be issued. The owner sets ENGINE_DOER_TOKEN.</p>
          )}
        </section>

        <section className="card pad stack" aria-label="Connect">
          <div className="between" style={{ flexWrap: "wrap" }}>
            <p className="h3">Claude Code</p>
            <Copy text={claude} label="Copy command" onCopied={() => t.show("Command copied.")} />
          </div>
          <pre className="code">{show ? claude : claude.replace(token, shown)}</pre>
          <div className="between" style={{ flexWrap: "wrap", marginTop: 8 }}>
            <p className="h3">Kiro, Cursor or any MCP client</p>
            <Copy text={json} label="Copy config" onCopied={() => t.show("Config copied.")} />
          </div>
          <pre className="code">{show ? json : json.replace(token, shown)}</pre>
        </section>

        <section className="card" aria-label="What your agent sees">
          <div className="pad">
            <p className="h3">What your agent sees right now</p>
            <p className="faint">This updates on its own as work is handed to you.</p>
          </div>
          {a.handed.length === 0 ? (
            <p className="pad soft" style={{ borderTop: "1px solid var(--line)" }}>
              Nothing handed to you yet. When you&rsquo;re invited to a job or take one, it appears here and in your agent.
            </p>
          ) : (
            <div className="divide" style={{ borderTop: "1px solid var(--line)" }}>
              {a.handed.map((j) => (
                <div key={j.id} className="pad stack" style={{ gap: 8 }}>
                  <div className="between" style={{ flexWrap: "wrap" }}>
                    <p className="h3">{j.title}</p>
                    <span className={`pill ${j.status === "on it" ? "pb" : "pa"}`}>
                      {j.status === "on it" ? "You're on it" : "Invited"} · {usd(j.priceCents)}
                    </span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {a.resources
                      .filter((r) => r.uri.startsWith(`engine://jobs/${j.id}/`))
                      .map((r) => (
                        <li key={r.uri}>
                          {r.title.replace(`${j.title}: `, "")} <span className="faint">· {r.description}</span>
                        </li>
                      ))}
                    <li>
                      A ready prompt: <span className="num">start_{j.id}</span>
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card pad stack" aria-label="Recent agent calls">
          <p className="h3">Your agent&rsquo;s recent calls</p>
          {a.calls.length === 0 ? (
            <p className="soft">No calls yet. Connect your agent and ask it: &ldquo;List the Engine work handed to me and start the first one.&rdquo;</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {a.calls.map((c, i) => (
                <li key={i}>
                  {c.tool}
                  {c.target ? ` on ${c.target}` : ""} <span className="faint">· {c.allowed ? "allowed" : `refused${c.note ? `: ${c.note}` : ""}`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card pad">
          <p className="h3">What your agent can and can&rsquo;t do</p>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>It sees the work handed to you and funded jobs open to everyone. Other jobs are refused and logged.</li>
            <li>It reads only the facts chosen for each job. Private documents never leave the company.</li>
            <li>It can ask the company a question, post updates, split your pay with a helper, and submit work.</li>
            <li>It has no tool that pays or refunds. You&rsquo;re paid through PayPal after the work passes review and sign-off.</li>
          </ul>
        </section>
      </div>
      <Toast msg={t.msg} />
    </div>
  );
}
