"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { Builder, Company, Job, Notice } from "@/lib/engine/types";

export type EngineState = {
  /** Server clock at the last poll; render code uses it instead of Date.now(). */
  serverNow: number;
  company: Company;
  sandbox: boolean;
  configured: { paypal: boolean; gemini: boolean; nebius: boolean };
  balanceCents: number | null;
  heldCents: number;
  paidOutCents: number;
  jobs: Job[];
  notices: Notice[];
  recentDone: Notice[];
  builders: Builder[];
  brain: { total: number; confirmed: number; waiting: number; conflicts: number; gaps: number };
  access: { at: string; actor: string; tool: string; target?: string; allowed: boolean; note?: string }[];
};

type Ctx = {
  state: EngineState | null;
  refresh: () => Promise<void>;
  toast: (text: string, err?: boolean) => void;
  post: <T = unknown>(url: string, body: unknown) => Promise<T | null>;
};

const C = createContext<Ctx | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EngineState | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [misses, setMisses] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/engine/state", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setState(await r.json());
      setMisses(0);
    } catch {
      // The next poll retries; after two misses in a row the banner says so.
      setMisses((m) => m + 1);
    }
  }, []);

  const toast = useCallback((text: string, err?: boolean) => {
    setMsg({ text, err });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4200);
  }, []);

  const post = useCallback(
    async <T,>(url: string, body: unknown): Promise<T | null> => {
      let r: Response;
      try {
        r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } catch {
        toast("Couldn't reach Engine, so nothing changed. Check your connection and try again.", true);
        return null;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast(j.error || (r.status >= 500 ? "Engine hit a problem, so nothing changed. Try again in a moment." : "That didn't go through. Nothing changed."), true);
        return null;
      }
      void refresh();
      return j as T;
    },
    [refresh, toast],
  );

  useEffect(() => {
    // Polling a server endpoint is the external system this effect syncs with.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <C.Provider value={{ state, refresh, toast, post }}>
      {children}
      {misses >= 2 && (
        <div className="mw-offline" role="status">
          Can&rsquo;t reach Engine right now. Retrying every few seconds. Nothing you&rsquo;ve saved is lost.
        </div>
      )}
      {msg && (
        <div className={`toast${msg.err ? " err" : ""}`} role="status">
          {msg.text}
        </div>
      )}
    </C.Provider>
  );
}

export function useEngine(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("useEngine outside EngineProvider");
  return c;
}

export function usd(cents: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (cents === null || cents === undefined) return "-";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.trunc(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}$${whole}${opts.whole && frac === "00" ? "" : `.${frac}`}`;
}

export function ago(iso: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const STATE_LABEL: Record<Job["state"], { text: string; cls: string }> = {
  draft: { text: "Needs funding", cls: "pa" },
  funded: { text: "Open, money held", cls: "pb" },
  taken: { text: "Being worked on", cls: "pb" },
  in_review: { text: "In review", cls: "pb" },
  signoff: { text: "Needs your sign-off", cls: "pb" },
  changes: { text: "Changes asked", cls: "pa" },
  passed: { text: "Passed, releasing", cls: "pg" },
  paying: { text: "Paying", cls: "pg" },
  paid: { text: "Paid", cls: "pg" },
  appealed: { text: "Appealed", cls: "pd" },
  cancelled: { text: "Cancelled", cls: "pn" },
};
