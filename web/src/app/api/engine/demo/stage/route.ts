import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { read, reset } from "@/lib/engine/db";
import { body, scoped } from "@/lib/engine/http";
import type { Db } from "@/lib/engine/types";

export const dynamic = "force-dynamic";

/**
 * DEVELOPMENT ONLY. Save the whole store under a name, and load it back, so a
 * demo recording can show each step from the real state the app reached.
 * Refused in production.
 */
const DIR = path.join(process.env.DATA_DIR || path.join(process.cwd(), ".data"), "stages");

async function POST_(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const { action, name } = await body<{ action: "save" | "load"; name: string }>(req);
  if (!/^[a-z0-9-]{1,40}$/.test(name ?? "")) return NextResponse.json({ error: "Bad stage name." }, { status: 400 });
  const file = path.join(DIR, `${name}.json`);
  if (action === "save") {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(read()), "utf8");
    return NextResponse.json({ ok: true });
  }
  if (action === "load") {
    if (!fs.existsSync(file)) return NextResponse.json({ error: "No such stage." }, { status: 404 });
    reset(JSON.parse(fs.readFileSync(file, "utf8")) as Db);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export const POST = scoped(POST_);
