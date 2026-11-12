import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";

import { realExperts } from "./accounts";
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

/**
 * One workspace per company. "demo" is the sandbox demo company (Northwind);
 * every owner who signs up gets their own. Each request runs inside scope.run
 * with its workspace, so read() and write() always touch that company only.
 */
export const scope = new AsyncLocalStorage<{ ws: string }>();
export const DEMO_WS = "demo";

export function currentWs(): string {
  return scope.getStore()?.ws ?? DEMO_WS;
}
export function isDemoWs(ws = currentWs()): boolean {
  return ws === DEMO_WS;
}

function fileFor(ws: string) {
  return ws === DEMO_WS ? path.join(DIR, "engine.json") : path.join(DIR, "ws", `${ws.replace(/[^a-z0-9_]/gi, "")}.json`);
}

export function workspaceExists(ws: string): boolean {
  return ws === DEMO_WS || Boolean(g.__engineDbs?.[ws]) || fs.existsSync(fileFor(ws));
}

/** Run fn against another company's data, e.g. to list an expert's work across companies. */
export function inWorkspace<T>(ws: string, fn: () => T): T {
  return scope.run({ ws }, fn);
}

type G = typeof globalThis & { __engineDbs?: Record<string, Db>; __engineLock?: Promise<unknown> };
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

/** Seeded experts are demo accounts; experts who signed up are listed for every company. */
function withExperts(db: Db): Db {
  for (const e of db.experts) if (e.id.startsWith("doer_")) e.demo = true;
  for (const r of realExperts()) {
    const have = db.experts.find((x) => x.id === r.id);
    if (have) Object.assign(have, r);
    else db.experts.push(structuredClone(r));
  }
  return db;
}

function load(ws = currentWs()): Db {
  g.__engineDbs ??= {};
  if (!g.__engineDbs[ws]) {
    try {
      g.__engineDbs[ws] = upgrade(JSON.parse(fs.readFileSync(fileFor(ws), "utf8")) as Db);
    } catch {
      g.__engineDbs[ws] = (ws === DEMO_WS ? demoStart() : null) ?? fresh();
    }
  }
  return withExperts(g.__engineDbs[ws]);
}

/**
 * With ENGINE_DEMO_START=1, an empty store starts as the sandbox demo company
 * (Northwind Coffee after one real paid PayPal sandbox run), so a visitor
 * never lands on an empty app after a restart. It holds no keys.
 */
function demoStart(): Db | null {
  if (process.env.ENGINE_DEMO_START !== "1") return null;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "demo-seed", "start.json"), "utf8");
    return upgrade(JSON.parse(raw) as Db);
  } catch {
    return null;
  }
}

function save(db: Db, ws = currentWs()) {
  const file = fileFor(ws);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, file);
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
    const ws = currentWs();
    const db = structuredClone(load(ws));
    const out = await fn(db);
    save(db, ws);
    g.__engineDbs![ws] = db;
    return out;
  } finally {
    release();
  }
}

export function reset(db?: Db) {
  const ws = currentWs();
  g.__engineDbs ??= {};
  g.__engineDbs[ws] = db ?? fresh();
  save(g.__engineDbs[ws], ws);
}

/** A new owner's company, from onboarding. */
export function createWorkspace(ws: string, db: Db) {
  g.__engineDbs ??= {};
  g.__engineDbs[ws] = db;
  save(db, ws);
}

/** Unique, sortable ids. A counter, not Date.now(): bursts never collide. */
export function nextId(db: Db, prefix: string): string {
  const n = db.seq++;
  return `${prefix}_${n.toString(36).padStart(4, "0")}`;
}

export function now(): string {
  return new Date().toISOString();
}
