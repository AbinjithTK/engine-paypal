import { NextResponse } from "next/server";

import { read } from "@/lib/engine/db";
import { expertCookie, scoped } from "@/lib/engine/http";
import { handedTo, resourcesFor, tokenForExpert } from "@/lib/engine/mcp";
import { expertById } from "@/lib/engine/work";

export const dynamic = "force-dynamic";

/** The signed-in expert's own MCP key, and what their agent will see right now. */
async function GET_(req: Request) {
  const db = read();
  const me = expertById(db, expertCookie(req));
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "127.0.0.1:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? (/^(127\.|localhost)/.test(host) ? "http" : "https");
  const url = `${process.env.PUBLIC_URL?.replace(/\/$/, "") || `${proto}://${host}`}/api/mcp`;
  const session = { id: me.id, name: me.name, email: me.email };
  // The key belongs to the company the expert is looking at.

  return NextResponse.json({
    url,
    token: tokenForExpert(me.id),
    handed: handedTo(db, me.id).map((j) => ({
      id: j.id,
      title: j.title,
      role: j.role,
      status: j.doer?.id === me.id ? "on it" : "invited",
      priceCents: j.priceCents,
    })),
    resources: resourcesFor(session).map((r) => ({ uri: r.uri, title: r.title, description: r.description })),
    calls: db.access.filter((a) => a.actor === me.name).slice(0, 8),
  });
}

export const GET = scoped(GET_);
