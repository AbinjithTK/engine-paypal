import { NextResponse } from "next/server";

import { body } from "@/lib/engine/http";

export const dynamic = "force-dynamic";

/** Sets the owner cookie when ENGINE_OWNER_KEY matches. Unset key means an open demo. */
export async function POST(req: Request) {
  const key = process.env.ENGINE_OWNER_KEY;
  if (!key) return NextResponse.json({ ok: true, open: true });
  const { key: given } = await body<{ key?: string }>(req);
  if (typeof given !== "string" || given !== key) {
    return NextResponse.json({ error: "That key is not right." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("engine_owner", key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
