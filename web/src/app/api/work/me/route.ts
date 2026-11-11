import { NextResponse } from "next/server";

import { read, write } from "@/lib/engine/db";
import { body, expertCookie, fail } from "@/lib/engine/http";
import { expertById } from "@/lib/engine/work";

export const dynamic = "force-dynamic";

/** Who you are on the expert side, and the profiles to choose from (sandbox demo sign-in). */
export async function GET(req: Request) {
  const db = read();
  const me = expertById(db, expertCookie(req));
  return NextResponse.json({
    me: me ?? null,
    experts: db.experts.map((e) => ({ id: e.id, name: e.name, headline: e.headline, available: e.available })),
    company: db.company.name,
  });
}

type Action =
  | { action: "signin"; expertId: string }
  | { action: "signout" }
  | { action: "profile"; headline?: string; skills?: string[]; pastWork?: string[]; dayRateUsd?: number; available?: boolean; aiTools?: string };

export async function POST(req: Request) {
  const b = await body<Action>(req);
  try {
    if (b.action === "signin") {
      if (!expertById(read(), b.expertId)) return NextResponse.json({ error: "No such expert." }, { status: 404 });
      const res = NextResponse.json({ ok: true });
      res.cookies.set("engine_expert", b.expertId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
      return res;
    }
    if (b.action === "signout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete("engine_expert");
      return res;
    }
    if (b.action === "profile") {
      const id = expertCookie(req);
      if (!expertById(read(), id)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
      const me = await write((db) => {
        const e = db.experts.find((x) => x.id === id)!;
        if (b.headline?.trim()) e.headline = b.headline.trim().slice(0, 140);
        if (b.skills) e.skills = b.skills.map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (b.pastWork) e.pastWork = b.pastWork.map((s) => s.trim()).filter(Boolean).slice(0, 8);
        if (typeof b.dayRateUsd === "number" && b.dayRateUsd > 0 && b.dayRateUsd < 20000) e.dayRateUsd = Math.round(b.dayRateUsd);
        if (typeof b.available === "boolean") e.available = b.available;
        if (b.aiTools?.trim()) e.aiTools = b.aiTools.trim().slice(0, 200);
        return e;
      });
      return NextResponse.json({ me });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
