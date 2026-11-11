import "server-only";

import fs from "node:fs";
import path from "node:path";

import { seedBuilders, seedCompany, seedExperts } from "./seed";
import type { Db } from "./types";

/**
 * A single JSON file, written through on every change.
 *
 * Small on purpose: one company, a few dozen jobs. It survives a server
 * restart (unlike the old in-memory store) and is the seam where Postgres goes.
 * DATA_DIR points it at a persistent disk on Render.
 */

const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "engine.json");

type G = typeof globalThis & { __engineDb?: Db; __engineLock?: Promise<unknown> };
const g = globalThis as G;

export function fresh(): Db {
  return {
    version: 1,
    company: seedCompany(),
    facts: [],
    gaps: [],
    jobs: [],
    notices: [],
    builders: seedBuilders(),
    access: [],
    interview: [],
    docs: [],
    chunks: [],
    connectors: [],
    skills: [],
    experts: seedExperts(),
    seq: 1,
  };
}

/** Older data files predate documents, connectors and skills. */
function upgrade(db: Db): Db {
  db.docs ??= [];
  db.chunks ??= [];
  db.connectors ??= [];
  db.skills ??= [];
  db.experts ??= seedExperts();
  for (const b of db.builders) {
    if (b.id === "scout") {
      b.usesAi ??= true;
      b.scheduled ??= false;
    } else if (b.id === "bookkeeper" || b.id === "librarian") {
      b.usesAi ??= false;
      b.scheduled ??= true;
    }
  }
  for (const j of db.jobs) j.judgement ??= [];
  return db;
}

function load(): Db {
  if (g.__engineDb) return g.__engineDb;
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    g.__engineDb = upgrade(JSON.parse(raw) as Db);
  } catch {
    g.__engineDb = fresh();
  }
  return g.__engineDb;
}

function save(db: Db) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

export function read(): Db {
  return load();
}

/**
 * Every write goes through here, one at a time, so two requests can never
 * interleave a read-modify-write (e.g. two release clicks).
 */
export async function write<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const prev = g.__engineLock ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  g.__engineLock = prev.then(() => mine);
  await prev;
  try {
    // Work on a copy and commit only on success, so a throw halfway through
    // (a failed PayPal or Gemini call) leaves no half-applied change behind.
    const db = structuredClone(load());
    const out = await fn(db);
    save(db);
    g.__engineDb = db;
    return out;
  } finally {
    release();
  }
}

export function reset(db?: Db) {
  g.__engineDb = db ?? fresh();
  save(g.__engineDb);
}

/** Unique, sortable ids. A counter, not Date.now(): bursts never collide. */
export function nextId(db: Db, prefix: string): string {
  const n = db.seq++;
  return `${prefix}_${n.toString(36).padStart(4, "0")}`;
}

export function now(): string {
  return new Date().toISOString();
}
