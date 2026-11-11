import "server-only";

import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";

/**
 * Gemini, through the Gemini API key in AI_API_KEY (or GEMINI_API_KEY).
 * Every call that feeds a decision asks for JSON against a schema, so the
 * code never parses free prose to decide anything.
 */

export const MODELS = {
  fast: process.env.ENGINE_MODEL_FAST || "gemini-2.5-flash",
  // The free tier gives gemini-2.5-pro no quota; set ENGINE_MODEL_CAREFUL on a paid key.
  careful: process.env.ENGINE_MODEL_CAREFUL || "gemini-2.5-flash",
};

/** Tried in order when a model is out of quota or overloaded. */
const FALLBACKS = ["gemini-2.5-flash", "gemini-3-flash-preview", "gemini-2.5-flash-lite"];

function isQuota(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /\b(429|503)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(m);
}

/** A short, human error. API errors can be kilobytes of JSON. */
export function shortError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (isQuota(e)) return "the AI model is out of quota right now";
  return m.replace(/\s+/g, " ").slice(0, 160);
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!key) throw new Error("No Gemini key. Set AI_API_KEY in .env.local.");
  client ??= new GoogleGenAI({ apiKey: key, apiVersion: "v1beta" });
  return client;
}

export function geminiConfigured() {
  // ENGINE_DISABLE_GEMINI=1 forces the Nebius path, for testing the fallback.
  if (process.env.ENGINE_DISABLE_GEMINI === "1") return false;
  return Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY);
}

export async function json<T>(opts: {
  model?: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<T> {
  if (!geminiConfigured() && nebiusConfigured()) return nebiusJson<T>(opts);
  const first = opts.model ?? MODELS.fast;
  const chain = [first, ...FALLBACKS.filter((m) => m !== first)];
  let lastErr: unknown;
  for (let attempt = 0; attempt < chain.length + 1; attempt++) {
    const model = chain[Math.min(attempt, chain.length - 1)];
    try {
      const r = await ai().models.generateContent({
        model,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          responseJsonSchema: opts.schema,
          temperature: opts.temperature ?? 0.3,
        },
      });
      const text = r.text ?? "";
      const parsed = JSON.parse(text) as T;
      lastModel = model;
      return parsed;
    } catch (e) {
      lastErr = e;
      if (!isQuota(e)) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  // Every Gemini model failed. Fall back to Nebius when a key is set.
  if (nebiusConfigured()) {
    try {
      return await nebiusJson<T>(opts);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ─── Nebius Token Factory (OpenAI-compatible) ────────────────────────────

const NEBIUS_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");
export const NEBIUS_MODEL = process.env.NEBIUS_MODEL || "Qwen/Qwen3-235B-A22B-Instruct-2507";

export function nebiusConfigured() {
  return Boolean(process.env.NEBIUS_API_KEY);
}

/** Pull the first JSON object out of a reply, in case a model wraps it in prose or a fence. */
function firstJson(text: string): string {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : t;
}

async function nebiusJson<T>(opts: { system: string; prompt: string; schema: Record<string, unknown>; temperature?: number }): Promise<T> {
  const res = await fetch(`${NEBIUS_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NEBIUS_MODEL,
      temperature: opts.temperature ?? 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${opts.system}\n\nReply with ONE JSON object only, no prose, matching this JSON Schema exactly:\n${JSON.stringify(opts.schema)}`,
        },
        { role: "user", content: opts.prompt },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Nebius ${res.status}: ${body.slice(0, 200)}`);
  const content = (JSON.parse(body) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(firstJson(content)) as T;
  lastModel = `nebius/${NEBIUS_MODEL}`;
  return parsed;
}

/** The model that actually answered last, for the record shown to users. */
export let lastModel = MODELS.fast;

export type ToolCall = { name: string; args: Record<string, unknown> };

/**
 * A small tool loop. The caller decides which tools exist and executes them;
 * the model only chooses. Used by the Bookkeeper with PayPal toolkit tools.
 */
export async function toolLoop(opts: {
  model?: string;
  system: string;
  prompt: string;
  tools: FunctionDeclaration[];
  execute: (call: ToolCall) => Promise<unknown>;
  maxSteps?: number;
}): Promise<{ text: string; calls: ToolCall[] }> {
  const model = opts.model ?? MODELS.fast;
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [
    { role: "user", parts: [{ text: opts.prompt }] },
  ];
  const calls: ToolCall[] = [];
  const chain = [model, ...FALLBACKS.filter((m) => m !== model)];
  let mi = 0;
  for (let step = 0; step < (opts.maxSteps ?? 6); step++) {
    let r;
    for (;;) {
      try {
        r = await ai().models.generateContent({
          model: chain[mi],
          contents,
          config: { systemInstruction: opts.system, tools: [{ functionDeclarations: opts.tools }], temperature: 0 },
        });
        break;
      } catch (e) {
        if (isQuota(e) && mi < chain.length - 1) {
          mi++;
          continue;
        }
        throw e;
      }
    }
    const fcs = r.functionCalls ?? [];
    if (fcs.length === 0) return { text: r.text ?? "", calls };
    const modelParts = r.candidates?.[0]?.content?.parts ?? fcs.map((f) => ({ functionCall: f }));
    contents.push({ role: "model", parts: modelParts as Record<string, unknown>[] });
    const responses: Record<string, unknown>[] = [];
    for (const fc of fcs) {
      const call = { name: fc.name ?? "", args: (fc.args ?? {}) as Record<string, unknown> };
      calls.push(call);
      let result: unknown;
      try {
        result = await opts.execute(call);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { text: "Stopped after the step limit.", calls };
}
