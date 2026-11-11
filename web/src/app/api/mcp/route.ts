/**
 * MCP endpoint: JSON-RPC 2.0 over HTTP POST (Streamable HTTP transport).
 * A freelancer's own AI agent connects here with its token. See MCP.md.
 *
 * No tool behind this route can move money. See src/lib/engine/mcp.ts.
 */

import { NextResponse } from "next/server";

import { callTool, INSTRUCTIONS, sessionFor, TOOLS } from "@/lib/engine/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROTOCOL_VERSION = "2025-06-18";

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

function ok(id: RpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function err(id: RpcRequest["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: code === -32001 ? 401 : 200 });
}

function tokenFrom(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-engine-token");
}

export async function GET() {
  return NextResponse.json({
    name: "engine",
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable-http",
    endpoint: "/api/mcp",
    authentication: "Bearer token in the Authorization header",
    tools: TOOLS.map((t) => t.name),
  });
}

export async function POST(req: Request) {
  let body: RpcRequest;
  try {
    body = (await req.json()) as RpcRequest;
  } catch {
    return err(null, -32700, "Parse error.");
  }
  const { id, method, params = {} } = body;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "engine", title: "Engine: get hired and paid through PayPal", version: "0.2.0" },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  if (method === "ping") return ok(id, {});

  const session = sessionFor(tokenFrom(req));
  if (!session) return err(id, -32001, "Unknown or missing token. Send Authorization: Bearer <token>.");

  switch (method) {
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const r = await callTool(session, name, args);
      return ok(id, { content: [{ type: "text", text: r.text }], isError: r.isError ?? false });
    }
    case "resources/list":
      return ok(id, { resources: [] });
    case "prompts/list":
      return ok(id, { prompts: [] });
    default:
      return err(id, -32601, `Method "${method}" is not supported.`);
  }
}
