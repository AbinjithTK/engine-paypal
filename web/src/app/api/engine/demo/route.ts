import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { FIRST_QUESTION, interviewTurn } from "@/lib/engine/brain";
import { isDemoWs, nextId, now, read, reset, write } from "@/lib/engine/db";
import { denied, fail, isOwner, scoped } from "@/lib/engine/http";
import { extractText, ingest } from "@/lib/engine/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Loads the sample company, Northwind Coffee, so anyone (a judge, a demo
 * recording) can try Engine without setting a business up first. It runs the
 * real pipeline: the interview answer goes through Gemini, and the bundled
 * documents in web/demo-seed are read and indexed like any upload. Only files
 * in that folder are read.
 */

const SEED_DIR = path.join(process.cwd(), "demo-seed");

const INTERVIEW =
  "Northwind Coffee roasts specialty coffee in small batches in Portland. We sell bags online and a 22 dollar monthly subscription, " +
  "mostly to people who brew pour-over at home, and we're starting wholesale to cafes. Our voice is warm, plain and a bit nerdy about origins.";

async function POST_(req: Request) {
  if (!isOwner(req)) return denied();
  // Loading the sample replaces everything, so it only ever touches the demo company.
  if (!isDemoWs()) return NextResponse.json({ error: "The sample company loads only into the demo." }, { status: 403 });
  if (process.env.NODE_ENV === "production" && !process.env.ENGINE_OWNER_KEY && read().jobs.length > 0) {
    return NextResponse.json({ error: "This deployment already has work. Set ENGINE_OWNER_KEY to reload the sample." }, { status: 403 });
  }
  try {
    reset();
    await write((db) => {
      db.company.name = "Northwind Coffee";
      db.company.owner = "Maya";
    });
    await write(async (db) => {
      db.interview.push({ role: "engine", text: FIRST_QUESTION, at: now() });
      db.interview.push({ role: "founder", text: INTERVIEW, at: now() });
      const t = await interviewTurn(db, INTERVIEW);
      db.interview.push({ role: "engine", text: t.next ?? "Thanks, that's enough to start.", at: now() });
      db.company.onboarded = true;
    });

    const files = fs.existsSync(SEED_DIR) ? fs.readdirSync(SEED_DIR) : [];
    const docs: string[] = [];
    for (const name of files) {
      const full = path.join(SEED_DIR, name);
      if (!fs.statSync(full).isFile()) continue;
      const buf = fs.readFileSync(full);
      const text = await extractText(name, name.endsWith(".pdf") ? "application/pdf" : "text/plain", buf);
      await ingest({ title: name, text, origin: "upload", uri: `upload:${name}`, bytes: buf.length, isPrivate: /financ/i.test(name) });
      docs.push(name);
    }

    await write((db) => {
      db.connectors.push(
        { id: nextId(db, "con"), kind: "mcp", name: "Shopify", url: "https://northwind-coffee.myshopify.com/api/mcp", purpose: "The online store: products, prices and the wholesale page", createdAt: now() },
        { id: nextId(db, "con"), kind: "github", name: "northwind-coffee/site", url: "https://github.com/northwind-coffee/site", purpose: "The store theme and the wholesale page code. Coding and design jobs.", createdAt: now() },
      );
      db.skills.push({
        id: nextId(db, "skl"),
        name: "Writing to cafes",
        when: "any email, page or plan written for cafe owners",
        body: "1. Open with the coffee, not the company.\n2. Name the farm and the process.\n3. State the 10 lb minimum and Tuesday delivery plainly.\n4. One clear next step: book a Thursday cupping.",
        createdAt: now(),
      });
    });
    const db = read();
    return NextResponse.json({ ok: true, facts: db.facts.length, docs, chunks: db.chunks.length });
  } catch (e) {
    return fail(e);
  }
}

export const POST = scoped(POST_);
