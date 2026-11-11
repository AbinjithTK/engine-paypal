import "server-only";

import type { FunctionDeclaration } from "@google/genai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";

import { dollars } from "./paypal";
import { toolLoop, type ToolCall } from "./gemini";
import type { Job } from "./types";

/**
 * The Bookkeeper builder: Gemini driving the official PayPal Agent Toolkit.
 *
 * It is given ONLY paperwork tools. Invoices and transaction reads cannot move
 * money, so a confused or manipulated model can at worst write a wrong
 * invoice, which the founder can cancel. Money itself moves in ./jobs.ts.
 */

const ALLOWED = new Set(["create_invoice", "send_invoice", "record_payment_for_invoice", "list_transactions"]);

let kit: PayPalAgentToolkit | null = null;
function toolkit(): PayPalAgentToolkit {
  kit ??= new PayPalAgentToolkit({
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    configuration: {
      actions: {
        invoices: { create: true, send: true, recordPayment: true },
        transactions: { list: true },
      },
      context: { sandbox: (process.env.PAYPAL_ENVIRONMENT || "SANDBOX").toUpperCase() !== "LIVE" },
    },
  });
  return kit;
}

/** Gemini's schema dialect is stricter than draft-07; drop what it rejects. */
function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "$schema" || k === "additionalProperties" || k === "default" || k === "pattern") continue;
    if (k === "anyOf" || k === "not") continue;
    out[k] = clean(v);
  }
  if (!out.type && (schema as Record<string, unknown>).anyOf) out.type = "string";
  return out;
}

function declarations(names: string[]): FunctionDeclaration[] {
  return toolkit()
    .getTools()
    .filter((t) => names.includes(t.function.name))
    .map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parametersJsonSchema: clean(t.function.parameters),
    }));
}

let callSeq = 0;
async function run(call: ToolCall): Promise<unknown> {
  if (!ALLOWED.has(call.name)) throw new Error(`${call.name} is not a Bookkeeper tool.`);
  const r = await toolkit().handleToolCall({
    id: `call_${++callSeq}`,
    type: "function",
    function: { name: call.name, arguments: JSON.stringify(call.args) },
  });
  const content = typeof r.content === "string" ? r.content : JSON.stringify(r.content);
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function invoiceIdFrom(x: unknown): string | undefined {
  const s = typeof x === "string" ? x : JSON.stringify(x ?? "");
  return s.match(/INV2-[A-Z0-9-]{10,}/)?.[0];
}

export type InvoiceResult = { invoiceId?: string; tools: string[]; via: "agent" | "fallback"; note: string };

/**
 * Write the invoice for a paid job, send it to the client marked as a record,
 * and record the PayPal capture as its payment.
 */
export async function invoicePaidJob(job: Job, clientEmail: string, companyName: string): Promise<InvoiceResult> {
  const total = dollars(job.priceCents + job.feeCents);
  const work = dollars(job.priceCents);
  const fee = dollars(job.feeCents);
  const criteria = job.criteria.map((c, i) => `${i + 1}. ${c}`).join("; ");
  const today = new Date().toISOString().slice(0, 10);
  const facts =
    `Job id: ${job.id}\nTitle: ${job.title}\nClient email: ${clientEmail}\nCompany: ${companyName}\n` +
    `Line 1: "${job.title}" quantity 1 at ${work} USD\nLine 2: "Engine fee (10%)" quantity 1 at ${fee} USD\n` +
    `Total ${total} USD, already paid through PayPal, capture id ${job.paypal.captureId}, on ${today}.\n` +
    `Passed criteria: ${criteria}`;

  try {
    const r = await toolLoop({
      system:
        "You are the Bookkeeper for a small company. Use the PayPal tools to: 1) create an invoice to the client with exactly the two lines given, " +
        "reference set to the job id and the passed criteria in the note; 2) send it with send_to_recipient false (it is a receipt, the client already paid); " +
        "3) record the payment for the full total with method PAYPAL, payment_id set to the capture id and payment_date today. " +
        "Use only the numbers given. Never change an amount. Stop when the payment is recorded.",
      prompt: facts,
      tools: declarations(["create_invoice", "send_invoice", "record_payment_for_invoice"]),
      execute: run,
      maxSteps: 6,
    });
    const invoiceId = r.calls.map((c) => c.args.invoice_id as string | undefined).find(Boolean);
    const recorded = r.calls.some((c) => c.name === "record_payment_for_invoice");
    if (invoiceId && recorded) {
      return { invoiceId, tools: r.calls.map((c) => c.name), via: "agent", note: r.text.slice(0, 300) };
    }
  } catch {
    // fall through to the deterministic path below
  }

  // Same toolkit, same tools, called in a fixed order with fixed arguments.
  const created = await run({
    name: "create_invoice",
    args: {
      currency_code: "USD",
      reference: job.id,
      note: `Work passed review against: ${criteria}`.slice(0, 4000),
      invoicer_business_name: companyName,
      primary_recipients: [{ billing_info: { email_address: clientEmail } }],
      items: [
        { name: job.title.slice(0, 200), quantity: "1", unit_amount: { currency_code: "USD", value: work } },
        { name: "Engine fee (10%)", quantity: "1", unit_amount: { currency_code: "USD", value: fee } },
      ],
    },
  });
  const invoiceId = invoiceIdFrom(created);
  if (!invoiceId) return { tools: ["create_invoice"], via: "fallback", note: "Invoice was not created." };
  await run({ name: "send_invoice", args: { invoice_id: invoiceId, send_to_recipient: false } });
  await run({
    name: "record_payment_for_invoice",
    args: {
      invoice_id: invoiceId,
      payment_id: job.paypal.captureId,
      payment_date: today,
      method: "PAYPAL",
      amount: { currency_code: "USD", value: total },
    },
  });
  return {
    invoiceId,
    tools: ["create_invoice", "send_invoice", "record_payment_for_invoice"],
    via: "fallback",
    note: "Invoice created, sent as a receipt and marked paid.",
  };
}

/** Recent completed PayPal transactions, read through the toolkit. */
export async function recentTransactions(): Promise<
  { id: string; amount: string; note: string; date: string }[]
> {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400_000);
  const r = (await run({
    name: "list_transactions",
    args: { start_date: start.toISOString(), end_date: end.toISOString(), page_size: 100 },
  })) as { transaction_details?: { transaction_info?: Record<string, unknown> }[] } | string;
  if (typeof r === "string" || !r.transaction_details) return [];
  return r.transaction_details
    .map((t) => t.transaction_info ?? {})
    .map((i) => ({
      id: String(i.transaction_id ?? ""),
      amount: String((i.transaction_amount as { value?: string } | undefined)?.value ?? ""),
      note: String(i.transaction_subject ?? i.transaction_note ?? i.invoice_id ?? ""),
      date: String(i.transaction_initiation_date ?? ""),
    }));
}
