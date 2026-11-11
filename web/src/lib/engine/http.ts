import "server-only";

import { NextResponse } from "next/server";

import { IngestError } from "./ingest";
import { JobError } from "./jobs";
import { PayPalError } from "./paypal";

/**
 * Owner check. When ENGINE_OWNER_KEY is set, founder actions need the
 * engine_owner cookie (set at /app/unlock). Unset means an open demo.
 */
export function isOwner(req: Request): boolean {
  const key = process.env.ENGINE_OWNER_KEY;
  if (!key) return true;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)engine_owner=([^;]+)/);
  return Boolean(m && decodeURIComponent(m[1]) === key);
}

/** The expert signed in on the freelancer side (sandbox demo sign-in). */
export function expertCookie(req: Request): string | null {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)engine_expert=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function denied() {
  return NextResponse.json({ error: "Owner access needed. Unlock at /app/unlock." }, { status: 401 });
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
