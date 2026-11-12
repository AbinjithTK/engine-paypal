"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usd, useEngine } from "./use-engine";

const NAV = [
  { href: "/app", label: "Home" },
  { href: "/app/jobs", label: "Work" },
  { href: "/app/team", label: "Team" },
  { href: "/app/experts", label: "Experts" },
  { href: "/app/brain", label: "Brain" },
  { href: "/app/builders", label: "Builders" },
  { href: "/app/connect", label: "Connect" },
];

export function TopBar() {
  const path = usePathname();
  const { state } = useEngine();
  const busy = state?.builders.filter((b) => b.runs[0] && state.serverNow - Date.parse(b.runs[0].at) < 60_000).length ?? 0;

  return (
    <header className="mw-top">
      <Link href="/app" className="mw-logo">
        <i aria-hidden="true" />
        Engine
      </Link>
      {state?.demo && (
        <span className="mw-demo" title="A shared sample company. Create an account to set up your own.">
          Demo company
        </span>
      )}
      {state?.sandbox && (
        <span className="mw-sandbox mw-hide-sm" title="Payments run on PayPal's test system. No real money moves.">
          PayPal sandbox
        </span>
      )}
      <nav className="mw-nav" aria-label="Main">
        {NAV.map((n) => {
          const on = n.href === "/app" ? path === "/app" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}>
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mw-res">
        <span className="mw-r" title="Available in Engine's PayPal business account">
          <small>PayPal</small> <b>{usd(state?.balanceCents ?? null)}</b>
        </span>
        <span className="mw-r" title="Client money held in PayPal until work passes review">
          <small>Held</small> <b>{usd(state?.heldCents ?? 0)}</b>
        </span>
        <span className="mw-r mw-hide-sm">
          <small>Builders</small> <b>{busy ? `${busy} busy` : state ? `${state.builders.length}` : "-"}</b>
        </span>
        <button
          className="mw-switch"
          style={{ background: "transparent", font: "inherit", cursor: "pointer" }}
          title={state?.demo ? "Leave the demo and sign in or create an account" : "Sign out"}
          onClick={async () => {
            await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "signout" }) }).catch(() => {});
            window.location.assign(new URL("/login", window.location.origin).toString());
          }}
        >
          {state ? `${state.company.owner} · Sign out` : "Sign out"}
        </button>
      </div>
    </header>
  );
}
