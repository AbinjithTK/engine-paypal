import { NextResponse } from "next/server";

import { read } from "@/lib/engine/db";
import { body, isOwner, scoped } from "@/lib/engine/http";

export const dynamic = "force-dynamic";

/** What the sign-in page needs to know: who the owner is, and whether a key is asked for. */
async function GET_(req: Request) {
  const db = read();
  return NextResponse.json({
    company: db.company.name,
    owner: db.company.owner,
    needsKey: Boolean(process.env.ENGINE_OWNER_KEY),
    signedIn: isOwner(req),
  });
}

/** Sets the owner cookie when ENGINE_OWNER_KEY matches. Unset key means an open demo. */
async function POST_(req: Request) {
  const b = await body<{ key?: string; action?: string }>(req);
  if (b.action === "signout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.delete("engine_owner");
    return res;
  }
  const key = process.env.ENGINE_OWNER_KEY;
  if (!key) return NextResponse.json({ ok: true, open: true });
  if (typeof b.key !== "string" || b.key !== key) {
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

export const GET = scoped(GET_);
export const POST = scoped(POST_);
