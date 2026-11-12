"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Expert } from "@/lib/engine/types";

export function usd(c: number | null | undefined) {
  if (c === null || c === undefined) return "-";
  return `$${Math.trunc(c / 100).toLocaleString("en-US")}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
}

export type Company = { ws: string; name: string; demo: boolean; invites: number; jobs: number };
export type Me = {
  me: Expert | null;
  /** Signed in with a demo account rather than a real one. */
  demoAccount: boolean;
  experts: { id: string; name: string; headline: string; available: boolean }[];
  company: string;
  ws: string;
  companies: Company[];
};

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/work/me", { cache: "no-store" });
    if (r.ok) setMe(await r.json());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the signed-in expert
    void load();
  }, [load]);
  return { me, reload: load };
}

export async function send<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, data: j as T } : { ok: false, error: j.error || "Something went wrong." };
}

export function Toast({ msg }: { msg: { text: string; err?: boolean } | null }) {
  if (!msg) return null;
  return (
    <div className={`toast${msg.err ? " err" : ""}`} role="status">
      {msg.text}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const show = useCallback((text: string, err?: boolean) => {
    setMsg({ text, err });
    setTimeout(() => setMsg(null), 4200);
  }, []);
  return { msg, show };
}

export function WorkBar() {
  const path = usePathname();
  const { me } = useMe();
  const companies = me?.companies ?? [];
  const here = companies.find((c) => c.ws === me?.ws);
  return (
    <header className="mw-top">
      <Link href="/work" className="mw-logo">
        <i aria-hidden="true" />
        Engine <span className="faint" style={{ fontWeight: 500 }}>for experts</span>
      </Link>
      {me?.demoAccount && (
        <span className="mw-demo" title="A sample expert account. Create your own to get real work.">
          Demo account
        </span>
      )}
      <nav className="mw-nav" aria-label="Expert">
        <Link href="/work" aria-current={path === "/work" ? "page" : undefined}>
          My work
        </Link>
        <Link href="/work/profile" aria-current={path.startsWith("/work/profile") ? "page" : undefined}>
          Profile
        </Link>
        <Link href="/work/agent" aria-current={path.startsWith("/work/agent") ? "page" : undefined}>
          Your AI agent
        </Link>
      </nav>
      <div className="mw-res">
        {me?.me ? (
          <>
            {companies.length > 1 ? (
              <select
                className="mw-company"
                aria-label="Company you're working with"
                value={me.ws}
                onChange={async (e) => {
                  await send("/api/work/me", { action: "company", ws: e.target.value });
                  window.location.reload();
                }}
              >
                {companies.map((c) => (
                  <option key={c.ws} value={c.ws}>
                    {c.name}
                    {c.demo ? " (demo)" : ""}
                    {c.invites ? ` · ${c.invites} invite${c.invites === 1 ? "" : "s"}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              here && (
                <span className="mw-r mw-hide-sm">
                  <small>{here.demo ? "Demo company" : "Company"}</small> <b>{here.name}</b>
                </span>
              )
            )}
            <button
              className="mw-switch"
              style={{ background: "transparent", font: "inherit", cursor: "pointer" }}
              onClick={async () => {
                await send("/api/auth", { action: "signout" });
                // A full reload so every component re-reads who is signed in.
                window.location.assign(new URL("/login", window.location.origin).toString());
              }}
            >
              {me.me.name.split(" ")[0]} · Sign out
            </button>
          </>
        ) : (
          <Link className="mw-switch" href="/login">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

/** Shown on expert pages to someone who isn't signed in as an expert. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SignIn(_: { data: Me; onDone: () => void }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="h1">
        Work that finds <em>you</em>
      </h1>
      <p className="soft" style={{ marginBottom: 32 }}>
        Companies post work, and Engine&rsquo;s Matcher invites the experts whose profiles fit. You&rsquo;re paid through PayPal when the
        work passes review.
      </p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link className="btn p" href="/login?new=1">
          Create an expert profile
        </Link>
        <Link className="btn" href="/login">
          Sign in or try a demo account
        </Link>
      </div>
    </div>
  );
}
