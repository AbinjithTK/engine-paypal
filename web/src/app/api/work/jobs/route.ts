import { NextResponse } from "next/server";

import { read } from "@/lib/engine/db";
import { expertCookie } from "@/lib/engine/http";
import { sweep } from "@/lib/engine/jobs";
import { expertById, expertHome } from "@/lib/engine/work";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await sweep();
  const db = read();
  const me = expertById(db, expertCookie(req));
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ me, ...expertHome(db, me.id) });
}
