"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usd, useEngine } from "./use-engine";

const NAV = [
  { href: "/app", label: "Home" },
  { href: "/app/jobs", label: "Work" },
  { href: "/app/team", label: "Team" },
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
      {state?.sandbox && <span className="mw-sandbox" title="A demo company on PayPal's test system. No real money moves.">PayPal sandbox · test money</span>}
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
        <Link className="mw-switch" href="/login" title="Sign in as an expert, or as the owner">
          {state ? `${state.company.owner} · Switch` : "Switch"}
        </Link>
      </div>
    </header>
  );
}
