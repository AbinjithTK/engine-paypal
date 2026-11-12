import { NextResponse } from "next/server";

import { readSession, saveExpert, workspaces } from "@/lib/engine/accounts";
import { currentWs, DEMO_WS, inWorkspace, read, write } from "@/lib/engine/db";
import { body, expertCookie, fail, scoped } from "@/lib/engine/http";
import { expertById } from "@/lib/engine/work";

export const dynamic = "force-dynamic";

/** The companies an expert works with: every one that invited them or put them on a job, plus the demo company. */
function companiesFor(expertId: string, demo: boolean) {
  const out = [{ ws: DEMO_WS, name: inWorkspace(DEMO_WS, () => read().company.name), demo: true, invites: 0, jobs: 0 }];
  if (demo) return out;
  for (const w of workspaces()) {
    const db = inWorkspace(w.id, () => read());
    const invites = db.jobs.filter((j) => j.invites?.some((x) => x.expertId === expertId && x.status === "invited")).length;
    const jobs = db.jobs.filter((j) => j.doer?.id === expertId).length;
    const open = db.jobs.some((j) => j.state === "funded" && !j.doer && !(j.invites ?? []).some((x) => x.status === "invited"));
    if (invites || jobs || open) out.unshift({ ws: w.id, name: db.company.name, demo: false, invites, jobs });
  }
  return out;
}

/** Who you are on the expert side, and which company you're looking at. */
async function GET_(req: Request) {
  const db = read();
  const s = readSession(req.headers.get("cookie"));
  const me = expertById(db, expertCookie(req));
  return NextResponse.json({
    me: me ?? null,
    demoAccount: Boolean(s?.demo),
    experts: [],
    company: db.company.name,
    ws: currentWs(),
    companies: me ? companiesFor(me.id, Boolean(s?.demo)) : [],
  });
}

type Action =
  | { action: "signout" }
  | { action: "company"; ws: string }
  | { action: "profile"; headline?: string; skills?: string[]; pastWork?: string[]; dayRateUsd?: number; available?: boolean; aiTools?: string };

async function POST_(req: Request) {
  const b = await body<Action>(req);
  try {
    if (b.action === "signout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.delete("engine_session");
      res.cookies.delete("engine_ws");
      return res;
    }
    const id = expertCookie(req);
    const s = readSession(req.headers.get("cookie"));
    if (!id || !expertById(read(), id)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

    if (b.action === "company") {
      const ok = companiesFor(id, Boolean(s?.demo)).some((c) => c.ws === b.ws);
      if (!ok) return NextResponse.json({ error: "You don't work with that company." }, { status: 403 });
      const res = NextResponse.json({ ok: true });
      res.cookies.set("engine_ws", b.ws, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === "production" });
      return res;
    }

    if (b.action === "profile") {
      const clean = (e: { headline: string; skills: string[]; pastWork: string[]; dayRateUsd: number; available: boolean; aiTools: string }) => {
        if (b.headline?.trim()) e.headline = b.headline.trim().slice(0, 140);
        if (b.skills) e.skills = b.skills.map((x) => x.trim()).filter(Boolean).slice(0, 12);
        if (b.pastWork) e.pastWork = b.pastWork.map((x) => x.trim()).filter(Boolean).slice(0, 8);
        if (typeof b.dayRateUsd === "number" && b.dayRateUsd > 0 && b.dayRateUsd < 20000) e.dayRateUsd = Math.round(b.dayRateUsd);
        if (typeof b.available === "boolean") e.available = b.available;
        if (b.aiTools?.trim()) e.aiTools = b.aiTools.trim().slice(0, 200);
      };
      if (s && !s.demo) {
        // A real profile lives with the account, so every company sees the update.
        const cur = { ...expertById(read(), id)! };
        clean(cur);
        const { id: _drop, demo: _d, ...rest } = cur;
        void _drop;
        void _d;
        return NextResponse.json({ me: saveExpert(s.u, rest) });
      }
      const me = await write((db) => {
        const e = db.experts.find((x) => x.id === id)!;
        clean(e);
        return e;
      });
      return NextResponse.json({ me });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}

export const GET = scoped(GET_);
export const POST = scoped(POST_);
