import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Expert } from "./types";

/**
 * Real accounts. Business owners and experts sign up with an email and a
 * password (scrypt, never stored in clear). Each owner gets their own company
 * workspace; each expert gets a profile every company can find and hire.
 *
 * The seeded Northwind company and its experts stay as demo accounts with a
 * one-click sign-in, labelled Demo everywhere.
 */

export type Role = "owner" | "expert";

export type Account = {
  id: string;
  email: string;
  name: string;
  role: Role;
  salt: string;
  hash: string;
  /** Owners: their company workspace, set at the end of onboarding. */
  workspaceId?: string;
  /** Experts: their expert profile id, set at the end of onboarding. */
  expertId?: string;
  createdAt: string;
};

type Store = { accounts: Account[]; experts: Expert[]; workspaces: { id: string; name: string; ownerId: string }[] };

const DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "accounts.json");

type G = typeof globalThis & { __engineAccounts?: Store };
const g = globalThis as G;

function load(): Store {
  if (g.__engineAccounts) return g.__engineAccounts;
  try {
    g.__engineAccounts = JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    g.__engineAccounts = { accounts: [], experts: [], workspaces: [] };
  }
  g.__engineAccounts.workspaces ??= [];
  return g.__engineAccounts;
}

function save() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

export class AuthError extends Error {}

const id = (p: string) => `${p}_${randomBytes(6).toString("hex")}`;
const norm = (email: string) => email.trim().toLowerCase();

function hashOf(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export function accountById(uid: string): Account | undefined {
  return load().accounts.find((a) => a.id === uid);
}

export function signUp(input: { email: string; password: string; name: string; role: Role }): Account {
  const email = norm(input.email);
  const name = input.name.trim().slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email.");
  if (name.length < 2) throw new AuthError("Enter your name.");
  if (input.password.length < 8) throw new AuthError("Use a password of at least 8 characters.");
  if (input.role !== "owner" && input.role !== "expert") throw new AuthError("Pick owner or expert.");
  const s = load();
  if (s.accounts.some((a) => a.email === email)) throw new AuthError("There's already an account with that email. Sign in instead.");
  const salt = randomBytes(16).toString("hex");
  const a: Account = { id: id("usr"), email, name, role: input.role, salt, hash: hashOf(input.password, salt), createdAt: new Date().toISOString() };
  s.accounts.push(a);
  save();
  return a;
}

// A few tries per email per 10 minutes, so a password can't be guessed by brute force.
const tries = new Map<string, number[]>();

export function signIn(emailIn: string, password: string): Account {
  const email = norm(emailIn);
  const now = Date.now();
  const recent = (tries.get(email) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 8) throw new AuthError("Too many tries. Wait a few minutes and try again.");
  const a = load().accounts.find((x) => x.email === email);
  const ok = a && timingSafeEqual(Buffer.from(hashOf(password, a.salt), "hex"), Buffer.from(a.hash, "hex"));
  if (!a || !ok) {
    tries.set(email, [...recent, now]);
    throw new AuthError("That email and password don't match.");
  }
  tries.delete(email);
  return a;
}

/** Experts with real accounts. Every company's directory and Matcher sees them. */
export function realExperts(): Expert[] {
  return load().experts;
}

export function saveExpert(uid: string, e: Omit<Expert, "id">): Expert {
  const s = load();
  const a = s.accounts.find((x) => x.id === uid);
  if (!a || a.role !== "expert") throw new AuthError("Sign in as an expert first.");
  const existing = a.expertId ? s.experts.find((x) => x.id === a.expertId) : undefined;
  if (existing) Object.assign(existing, e);
  else {
    const ex: Expert = { id: id("exp"), ...e };
    s.experts.push(ex);
    a.expertId = ex.id;
  }
  save();
  return s.experts.find((x) => x.id === a.expertId)!;
}

export function addWorkspace(uid: string, name: string): string {
  const s = load();
  const a = s.accounts.find((x) => x.id === uid);
  if (!a || a.role !== "owner") throw new AuthError("Sign in as a business owner first.");
  if (a.workspaceId) return a.workspaceId;
  const ws = id("ws");
  s.workspaces.push({ id: ws, name, ownerId: uid });
  a.workspaceId = ws;
  save();
  return ws;
}

export function workspaces() {
  return load().workspaces;
}

// ─── sessions ───────────────────────────────────────────────────────────

/** What the signed session cookie carries. Demo sessions have no account behind them. */
export type Session = { u: string; r: Role; w?: string; x?: string; demo?: boolean; exp: number };

function secret(): string {
  const s = process.env.ENGINE_SESSION_SECRET || process.env.CRON_SECRET || process.env.ENGINE_DOER_TOKEN;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return "engine-dev-session-secret";
  throw new Error("Set ENGINE_SESSION_SECRET.");
}

export const COOKIE = "engine_session";
const DAYS = 30;

export function sessionCookie(s: Omit<Session, "exp">): { name: string; value: string; options: Record<string, unknown> } {
  const body = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + DAYS * 86_400_000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return {
    name: COOKIE,
    value: `${body}.${sig}`,
    options: { httpOnly: true, sameSite: "lax", path: "/", maxAge: DAYS * 86_400, secure: process.env.NODE_ENV === "production" },
  };
}

export function forAccount(a: Account): Omit<Session, "exp"> {
  return { u: a.id, r: a.role, w: a.workspaceId, x: a.expertId };
}

export function readSession(cookieHeader: string | null | undefined): Session | null {
  const m = (cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [body, sig] = decodeURIComponent(m[1]).split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", secret()).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (!s.exp || s.exp < Date.now()) return null;
    if (s.demo) return s;
    // A real session follows its account, which may have finished onboarding since.
    const a = accountById(s.u);
    return a ? { ...s, w: a.workspaceId, x: a.expertId } : null;
  } catch {
    return null;
  }
}
