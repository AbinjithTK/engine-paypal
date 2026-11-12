"use client";

import { Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Info = {
  me: { role: "owner" | "expert"; demo: boolean; name?: string; onboarded: boolean } | null;
  demo: { company: string; owner: string; experts: { id: string; name: string; headline: string }[] };
};

async function post(body: unknown): Promise<{ next?: string; error?: string }> {
  try {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: "Couldn't reach Engine. Check your connection and try again." };
  }
}

// A full page load, so every part of the next screen reads the new sign-in.
const go = (path: string) => window.location.assign(new URL(path, window.location.origin).toString());

export default function Login() {
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [role, setRole] = useState<"owner" | "expert">("owner");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Reading who is signed in is the external system this effect syncs with.
    void fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setErr("Couldn't reach Engine. Refresh to try again."));
    if (new URLSearchParams(window.location.search).get("new")) {
      // Arriving from "Create an account" on the landing page.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("create");
    }
  }, []);

  async function run(key: string, body: unknown) {
    setBusy(key);
    setErr(null);
    const r = await post(body);
    setBusy(null);
    if (r.error) return setErr(r.error);
    go(r.next || "/");
  }

  const me = info?.me;

  return (
    <>
      <header className="mw-top">
        <Link href="/" className="mw-logo">
          <i aria-hidden="true" />
          Engine
        </Link>
        <span className="mw-sandbox" title="Payments run on PayPal's test system. No real money moves.">
          PayPal sandbox · test money
        </span>
      </header>
      <main className="mw-main" style={{ maxWidth: 1080 }}>
        <h1 className="h1">
          {mode === "signin" ? (
            <>
              Welcome <em>back</em>
            </>
          ) : (
            <>
              Create your <em>account</em>
            </>
          )}
        </h1>
        <p className="soft" style={{ marginBottom: 32 }}>
          {mode === "signin" ? "Sign in to your company or your expert profile." : "Hire experts for your company, or get hired as one."}
        </p>

        {me && (
          <div className="card pad between" style={{ marginBottom: 24, flexWrap: "wrap" }}>
            <span>
              Signed in as <b>{me.name ?? "you"}</b>
              {me.demo ? " (demo account)" : ""}.
            </span>
            <div className="row">
              <button className="btn s" onClick={() => go(!me.onboarded ? "/welcome" : me.role === "owner" ? "/app" : "/work")}>
                Continue
              </button>
              <button className="btn ghost s" onClick={() => run("out", { action: "signout" })}>
                Sign out
              </button>
            </div>
          </div>
        )}

        {err && (
          <p className="card pad" role="alert" style={{ borderColor: "var(--danger)", color: "var(--danger)", marginBottom: 16 }}>
            {err}
          </p>
        )}

        <div className="login-grid">
          <form
            className="card pad-lg stack-lg"
            aria-label={mode === "signin" ? "Sign in" : "Create an account"}
            onSubmit={(e) => {
              e.preventDefault();
              void run("main", mode === "signin" ? { action: "signin", email: f.email, password: f.password } : { action: "signup", role, ...f });
            }}
          >
            <div className="seg" role="group" aria-label="Sign in or create an account">
              <button type="button" aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>
                Sign in
              </button>
              <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>
                Create account
              </button>
            </div>

            {mode === "create" && (
              <div className="field">
                <span>I want to</span>
                <div className="role-pick">
                  <button type="button" className="role" aria-pressed={role === "owner"} onClick={() => setRole("owner")}>
                    <span className="login-ic" aria-hidden="true">
                      <Briefcase />
                    </span>
                    <b>Hire experts</b>
                    <small>For my company</small>
                  </button>
                  <button type="button" className="role" aria-pressed={role === "expert"} onClick={() => setRole("expert")}>
                    <span className="login-ic sage" aria-hidden="true">
                      <UserRound />
                    </span>
                    <b>Get hired</b>
                    <small>As an expert</small>
                  </button>
                </div>
              </div>
            )}

            {mode === "create" && (
              <label className="field">
                <span>Your name</span>
                <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input type="text" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={mode === "create" ? 8 : undefined}
                required
              />
              {mode === "create" && <small className="faint">At least 8 characters</small>}
            </label>
            <div>
              <button className="btn p" disabled={busy !== null}>
                {busy === "main" ? "One moment…" : mode === "signin" ? "Sign in to Engine" : "Create my account"}
              </button>
            </div>
          </form>

          <section className="card pad-lg stack" aria-label="Demo accounts">
            <div className="between">
              <p className="h3">Try a demo account</p>
              <span className="pill pn">Demo</span>
            </div>
            <p className="soft">A sample company with a real PayPal sandbox run already in it. No sign-up needed.</p>
            <div className="login-list">
              <button className="login-person" onClick={() => run("owner", { action: "demo", as: "owner" })} disabled={busy !== null || !info}>
                <span className="login-av" aria-hidden="true">
                  <Briefcase size={16} />
                </span>
                <span className="login-who">
                  <b>{busy === "owner" ? "Opening…" : `${info?.demo.owner ?? "Maya"}, owner`}</b>
                  <small>{info?.demo.company ?? "Northwind Coffee"} · demo company</small>
                </span>
              </button>
              {(info?.demo.experts ?? []).map((x) => (
                <button key={x.id} className="login-person" onClick={() => run(x.id, { action: "demo", as: x.id })} disabled={busy !== null}>
                  <span className="login-av" aria-hidden="true">
                    {x.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)}
                  </span>
                  <span className="login-who">
                    <b>{busy === x.id ? "Opening…" : x.name}</b>
                    <small>{x.headline}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
