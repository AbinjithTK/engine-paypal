"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { Expert } from "@/lib/engine/types";

export function usd(c: number | null | undefined) {
  if (c === null || c === undefined) return "-";
  return `$${Math.trunc(c / 100).toLocaleString("en-US")}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
}

export type Me = { me: Expert | null; experts: { id: string; name: string; headline: string; available: boolean }[]; company: string };

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
  return (
    <header className="mw-top">
      <Link href="/work" className="mw-logo">
        <i aria-hidden="true" />
        Engine <span className="faint" style={{ fontWeight: 500 }}>for experts</span>
      </Link>
      <span className="mw-sandbox" title="A demo company on PayPal's test system. No real money moves.">PayPal sandbox · test money</span>
      <nav className="mw-nav" aria-label="Expert">
        <Link href="/work" aria-current={path === "/work" ? "page" : undefined}>
          My work
        </Link>
        <Link href="/work/profile" aria-current={path.startsWith("/work/profile") ? "page" : undefined}>
          Profile
        </Link>
        <Link href="/app/connect">Use your AI agent</Link>
      </nav>
      <div className="mw-res">
        {me?.me ? (
          <>
            <span className="mw-r mw-keep">
              <small>Signed in as</small> <b>{me.me.name.split(" ")[0]}</b>
            </span>
            <button
              className="mw-switch"
              style={{ background: "transparent", font: "inherit", cursor: "pointer" }}
              onClick={async () => {
                await send("/api/work/me", { action: "signout" });
                // A full reload so every component re-reads who is signed in.
                window.location.assign(new URL("/login", window.location.origin).toString());
              }}
            >
              Sign out
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

export function SignIn({ data, onDone }: { data: Me; onDone: () => void }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <p className="label">Engine for experts</p>
      <h1 className="h1">
        Work that finds <em>you</em>
      </h1>
      <p className="soft" style={{ marginBottom: 18 }}>
        Founders post work; Engine&apos;s Matcher invites the experts whose profiles fit. Pick a profile to see the sandbox demo from their side.
      </p>
      <div className="huts" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", marginTop: 0 }}>
        {data.experts.map((e) => (
          <button
            key={e.id}
            className="hut"
            style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", padding: "14px 16px" }}
            onClick={async () => {
              await send("/api/work/me", { action: "signin", expertId: e.id });
              onDone();
            }}
          >
            <div className="t">
              <span>{e.name}</span>
              <span className={`dot ${e.available ? "ok" : "idle"}`} />
            </div>
            <div className="d">{e.headline}</div>
          </button>
        ))}
      </div>
      <p className="faint" style={{ marginTop: 14 }}>
        Sandbox demo sign-in. Real accounts would sign in with their own login. Running the company instead?{" "}
        <Link href="/app">Open the owner dashboard</Link>.
      </p>
    </div>
  );
}
