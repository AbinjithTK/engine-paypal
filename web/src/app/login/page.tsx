"use client";

import { Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Owner = { company: string; owner: string; needsKey: boolean; signedIn: boolean };
type Expert = { id: string; name: string; headline: string; available: boolean };

async function post(url: string, body: unknown) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? null : j.error || "That didn't go through. Try again.";
  } catch {
    return "Couldn't reach Engine. Check your connection and try again.";
  }
}

// A full page load, so every part of the next dashboard reads the new sign-in.
const go = (path: string) => window.location.assign(new URL(path, window.location.origin).toString());

export default function Login() {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Reading who can sign in is the external system this effect syncs with.
    void fetch("/api/engine/unlock", { cache: "no-store" })
      .then((r) => r.json())
      .then(setOwner)
      .catch(() => setErr("Couldn't reach Engine. Refresh to try again."));
    void fetch("/api/work/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setExperts(j.experts ?? []))
      .catch(() => {});
  }, []);

  async function asOwner(e: React.FormEvent) {
    e.preventDefault();
    setBusy("owner");
    setErr(null);
    const bad = owner?.needsKey && !owner.signedIn ? await post("/api/engine/unlock", { key }) : null;
    setBusy(null);
    if (bad) return setErr(bad);
    go("/app");
  }

  async function asExpert(id: string) {
    setBusy(id);
    setErr(null);
    const bad = await post("/api/work/me", { action: "signin", expertId: id });
    setBusy(null);
    if (bad) return setErr(bad);
    go("/work");
  }

  return (
    <>
      <header className="mw-top">
        <Link href="/" className="mw-logo">
          <i aria-hidden="true" />
          Engine
        </Link>
        <span className="mw-sandbox" title="A demo company on PayPal's test system. No real money moves.">
          PayPal sandbox · test money
        </span>
      </header>
      <main className="mw-main" style={{ maxWidth: 1080 }}>
        <p className="label">Sign in</p>
        <h1 className="h1">
          Who are <em>you</em> today?
        </h1>
        <p className="soft" style={{ marginBottom: 24, maxWidth: 680 }}>
          Engine has two sides. The owner posts work and signs it off. Experts take the work, do it with their own AI tools, and get paid
          through PayPal. This is a sandbox demo, so pick either side and switch whenever you like.
        </p>
        {err && (
          <p className="card pad" role="alert" style={{ borderColor: "var(--danger)", color: "var(--danger)", marginBottom: 16 }}>
            {err}
          </p>
        )}

        <div className="login-grid">
          <form className="card pad stack" onSubmit={asOwner} aria-label="Sign in as the owner">
            <div className="row">
              <span className="login-ic" aria-hidden="true">
                <Briefcase />
              </span>
              <div>
                <p className="h3">I&rsquo;m the business owner</p>
                <p className="faint">{owner ? `${owner.owner} at ${owner.company}` : "Loading…"}</p>
              </div>
            </div>
            <p className="soft">Post work, pick your team, check reviews and release payments.</p>
            {owner?.needsKey && !owner.signedIn && (
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Owner key" aria-label="Owner key" autoComplete="current-password" />
            )}
            <div>
              <button className="btn p" disabled={!owner || busy !== null || (owner.needsKey && !owner.signedIn && !key)}>
                {busy === "owner" ? "Signing in…" : "Open the owner dashboard"}
              </button>
            </div>
          </form>

          <section className="card pad stack" aria-label="Sign in as an expert">
            <div className="row">
              <span className="login-ic sage" aria-hidden="true">
                <UserRound />
              </span>
              <div>
                <p className="h3">I&rsquo;m an expert</p>
                <p className="faint">Freelancers invited to {owner?.company ?? "the company"}&rsquo;s work</p>
              </div>
            </div>
            <p className="soft">See the jobs matched to you, what you&rsquo;ve earned, and what&rsquo;s waiting on review.</p>
            <div className="login-list">
              {experts.length === 0 && <p className="faint">Loading experts…</p>}
              {experts.map((x) => (
                <button key={x.id} className="login-person" onClick={() => asExpert(x.id)} disabled={busy !== null}>
                  <span className="login-av" aria-hidden="true">
                    {x.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="login-who">
                    <b>{busy === x.id ? "Signing in…" : x.name}</b>
                    <small>{x.headline}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <p className="faint" style={{ marginTop: 18 }}>
          Demo sign-in for the hackathon. A real deployment would use each person&rsquo;s own account.
        </p>
      </main>
    </>
  );
}
