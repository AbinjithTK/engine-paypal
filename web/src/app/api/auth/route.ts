import { NextResponse } from "next/server";

import {
  accountById,
  addWorkspace,
  AuthError,
  COOKIE,
  forAccount,
  readSession,
  saveExpert,
  sessionCookie,
  signIn,
  signUp,
  type Role,
} from "@/lib/engine/accounts";
import { addFact } from "@/lib/engine/brain";
import { createWorkspace, DEMO_WS, fresh, inWorkspace, read } from "@/lib/engine/db";
import { body, fail } from "@/lib/engine/http";
import type { BrainSection } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

/** Who is signed in, where onboarding stands, and the demo accounts to try. */
export async function GET(req: Request) {
  const s = readSession(req.headers.get("cookie"));
  const a = s && !s.demo ? accountById(s.u) : undefined;
  const demo = inWorkspace(DEMO_WS, () => read());
  return NextResponse.json({
    me: s
      ? {
          role: s.r,
          demo: Boolean(s.demo),
          name: a?.name ?? (s.r === "owner" ? demo.company.owner : demo.experts.find((e) => e.id === s.x)?.name),
          email: a?.email,
          onboarded: s.demo || (s.r === "owner" ? Boolean(s.w) : Boolean(s.x)),
        }
      : null,
    demo: {
      company: demo.company.name,
      owner: demo.company.owner,
      experts: demo.experts.filter((e) => e.demo).map((e) => ({ id: e.id, name: e.name, headline: e.headline })),
    },
  });
}

type Action =
  | { action: "signup"; role: Role; name: string; email: string; password: string }
  | { action: "signin"; email: string; password: string }
  | { action: "demo"; as: "owner" | string }
  | { action: "signout" }
  | {
      action: "onboard_owner";
      company: string;
      about: string;
      customers?: string;
      voice?: string;
      avoid?: string;
      paypalEmail?: string;
    }
  | {
      action: "onboard_expert";
      headline: string;
      skills: string;
      pastWork: string;
      dayRateUsd: number;
      aiTools: string;
      location: string;
      paypalEmail: string;
    };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function withSession(data: unknown, s: Parameters<typeof sessionCookie>[0]) {
  const res = NextResponse.json(data);
  const c = sessionCookie(s);
  res.cookies.set(c.name, c.value, c.options);
  // A new sign-in starts from the person's own company on the expert side.
  res.cookies.delete("engine_ws");
  return res;
}

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const b = await body<Action>(req);
  try {
    switch (b.action) {
      case "signup": {
        const a = signUp({ role: b.role, name: String(b.name ?? ""), email: String(b.email ?? ""), password: String(b.password ?? "") });
        return withSession({ next: "/welcome" }, forAccount(a));
      }
      case "signin": {
        const a = signIn(String(b.email ?? ""), String(b.password ?? ""));
        const onboarded = a.role === "owner" ? Boolean(a.workspaceId) : Boolean(a.expertId);
        return withSession({ next: !onboarded ? "/welcome" : a.role === "owner" ? "/app" : "/work" }, forAccount(a));
      }
      case "demo": {
        if (b.as === "owner") return withSession({ next: "/app" }, { u: "demo", r: "owner", w: DEMO_WS, demo: true });
        const e = inWorkspace(DEMO_WS, () => read().experts.find((x) => x.id === b.as && x.demo));
        if (!e) return bad("No such demo account.");
        return withSession({ next: "/work" }, { u: "demo", r: "expert", x: e.id, demo: true });
      }
      case "signout": {
        const res = NextResponse.json({ next: "/login" });
        res.cookies.delete(COOKIE);
        res.cookies.delete("engine_ws");
        res.cookies.delete("engine_owner");
        return res;
      }
      case "onboard_owner": {
        const s = readSession(req.headers.get("cookie"));
        if (!s || s.demo || s.r !== "owner") return NextResponse.json({ error: "Sign in as a business owner first." }, { status: 401 });
        const a = accountById(s.u)!;
        if (a.workspaceId) return NextResponse.json({ next: "/app" });
        const company = String(b.company ?? "").trim().slice(0, 80);
        const about = String(b.about ?? "").trim().slice(0, 600);
        const paypalEmail = String(b.paypalEmail ?? "").trim();
        if (company.length < 2) return bad("Enter your company's name.");
        if (about.length < 15) return bad("Say what the company does, in a sentence or two.");
        if (paypalEmail && !EMAIL.test(paypalEmail)) return bad("Enter a valid PayPal email, or leave it empty.");
        const ws = addWorkspace(a.id, company);
        const db = fresh();
        db.company = { name: company, owner: a.name.split(" ")[0], ownerEmail: paypalEmail || a.email, onboarded: true, search: "local" };
        // The answers become the first confirmed facts in the Company Brain.
        const facts: [BrainSection, string | undefined][] = [
          ["company", about],
          ["customers", b.customers],
          ["voice", b.voice],
          ["avoid", b.avoid ? `Avoid: ${b.avoid}` : undefined],
        ];
        for (const [section, text] of facts) {
          const t = String(text ?? "").trim().slice(0, 600);
          if (t.length >= 3) addFact(db, { section, text: t, source: { kind: "founder" }, confirmed: true });
        }
        createWorkspace(ws, db);
        return withSession({ next: "/app" }, { ...forAccount(a), w: ws });
      }
      case "onboard_expert": {
        const s = readSession(req.headers.get("cookie"));
        if (!s || s.demo || s.r !== "expert") return NextResponse.json({ error: "Sign in as an expert first." }, { status: 401 });
        const a = accountById(s.u)!;
        const headline = String(b.headline ?? "").trim().slice(0, 140);
        const skills = String(b.skills ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);
        const pastWork = String(b.pastWork ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
        const rate = Math.round(Number(b.dayRateUsd));
        const paypalEmail = String(b.paypalEmail ?? "").trim();
        if (headline.length < 10) return bad("Write a one-line headline about what you do.");
        if (skills.length < 2) return bad("List at least two skills, separated by commas.");
        if (pastWork.length < 1) return bad("Add at least one piece of past work.");
        if (!Number.isFinite(rate) || rate <= 0 || rate > 20000) return bad("Enter a day rate in US dollars.");
        if (!EMAIL.test(paypalEmail)) return bad("Enter the PayPal email where you want to be paid.");
        const e = saveExpert(a.id, {
          name: a.name,
          email: paypalEmail,
          headline,
          skills,
          pastWork,
          dayRateUsd: rate,
          available: true,
          aiTools: String(b.aiTools ?? "").trim().slice(0, 200) || "Not stated",
          location: String(b.location ?? "").trim().slice(0, 60) || "Remote",
        });
        return withSession({ next: "/work" }, { ...forAccount(a), x: e.id });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    if (e instanceof AuthError) return bad(e.message);
    return fail(e);
  }
}
