import "server-only";

import { NextResponse } from "next/server";

import { readSession, type Session } from "./accounts";
import { currentWs, DEMO_WS, isDemoWs, scope, workspaceExists } from "./db";
import { IngestError } from "./ingest";
import { JobError } from "./jobs";
import { PayPalError } from "./paypal";

/** The signed-in person, from the signed session cookie. */
export function sessionOf(req: Request): Session | null {
  return readSession(req.headers.get("cookie"));
}

/** Which company an owner request reaches: their own, or the demo company when not signed in as an owner. */
export function ownerWs(cookie: string | null | undefined): string {
  const s = readSession(cookie);
  return s?.r === "owner" && s.w ? s.w : DEMO_WS;
}

/** Which company an expert is looking at: the one they picked (engine_ws), else the demo company. */
export function expertWs(cookie: string | null | undefined): string {
  const s = readSession(cookie);
  if (s?.r !== "expert") return DEMO_WS;
  const m = (cookie ?? "").match(/(?:^|;\s*)engine_ws=([^;]+)/);
  const ws = m ? decodeURIComponent(m[1]) : "";
  return ws && workspaceExists(ws) ? ws : DEMO_WS;
}

/**
 * Runs a route handler inside its company. /api/work and /api/mcp are the
 * expert side; everything else is the owner side.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoped<T extends (req: Request, ...rest: any[]) => any>(h: T): T {
  return ((req: Request, ...rest: unknown[]) => {
    const p = new URL(req.url).pathname;
    const cookie = req.headers.get("cookie");
    const ws = p.startsWith("/api/work") ? expertWs(cookie) : p.startsWith("/api/mcp") ? DEMO_WS : ownerWs(cookie);
    return scope.run({ ws }, () => h(req, ...rest));
  }) as T;
}

/** Server-rendered owner pages: run fn inside the signed-in owner's company. */
export async function ownerPage<T>(fn: () => T): Promise<T> {
  const { headers } = await import("next/headers");
  const cookie = (await headers()).get("cookie");
  return scope.run({ ws: ownerWs(cookie) }, fn);
}

/**
 * Owner check. A real company answers only to its owner's session. The demo
 * company is open, unless ENGINE_OWNER_KEY locks it behind /app/unlock.
 */
export function isOwner(req: Request): boolean {
  const ws = currentWs();
  if (!isDemoWs(ws)) {
    const s = sessionOf(req);
    return s?.r === "owner" && s.w === ws;
  }
  const key = process.env.ENGINE_OWNER_KEY;
  if (!key) return true;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)engine_owner=([^;]+)/);
  return Boolean(m && decodeURIComponent(m[1]) === key);
}

/** The expert signed in on the expert side: a real account, or a demo expert. */
export function expertCookie(req: Request): string | null {
  const s = sessionOf(req);
  return s?.r === "expert" ? (s.x ?? null) : null;
}

export function denied() {
  return NextResponse.json({ error: "Sign in as this company's owner to do that." }, { status: 401 });
}

export function fail(e: unknown) {
  if (e instanceof JobError) return NextResponse.json({ error: e.message }, { status: 409 });
  if (e instanceof IngestError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof PayPalError) {
    return NextResponse.json({ error: `PayPal: ${e.message}`, debugId: e.debugId }, { status: 502 });
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[engine]", msg);
  return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function originOf(req: Request): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3000";
  return `${proto}://${host}`;
}
