import "server-only";

/**
 * PayPal REST, called directly for everything that moves money.
 *
 * Checked against the official specs in docs/paypal (orders_v2, payments_v2,
 * payouts_v1). The Agent Toolkit has no authorize, capture or payouts tools,
 * and money must never depend on a model's tool call anyway, so these are
 * plain functions. The AI builders only ever get paperwork tools (invoices,
 * transactions) through the toolkit, in ./bookkeeper.ts.
 *
 * Every money call carries a PayPal-Request-Id derived from the job, so a
 * retry of the same step can never move money twice.
 */

const BASE =
  (process.env.PAYPAL_ENVIRONMENT || "SANDBOX").toUpperCase() === "LIVE"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export const PAYPAL_SANDBOX = BASE.includes("sandbox");

let cached: { token: string; until: number } | null = null;

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function token(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError("PayPal keys are not set.", 0, "NOT_CONFIGURED");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) throw new PayPalError("PayPal rejected the app keys.", res.status, "AUTH");
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public debugId?: string,
  ) {
    super(message);
  }
}

async function call<T>(
  method: "GET" | "POST",
  p: string,
  body?: unknown,
  requestId?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await token()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const name = json.name || json.error || "PAYPAL_ERROR";
    const detail = json.details?.[0]?.issue || json.message || json.error_description || "";
    throw new PayPalError(`${name}${detail ? `: ${detail}` : ""}`, res.status, name, json.debug_id);
  }
  return json as T;
}

export function dollars(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`Bad amount ${cents}`);
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// ─── hold the client's money ─────────────────────────────────────────────

type Link = { href: string; rel: string };

export async function createHold(opts: {
  jobId: string;
  title: string;
  totalCents: number;
  returnUrl: string;
  cancelUrl: string;
  brand: string;
}): Promise<{ orderId: string; approveUrl: string }> {
  const o = await call<{ id: string; links: Link[] }>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: opts.jobId,
          custom_id: opts.jobId,
          description: opts.title.slice(0, 127),
          amount: { currency_code: "USD", value: dollars(opts.totalCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: opts.brand.slice(0, 127),
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
            return_url: opts.returnUrl,
            cancel_url: opts.cancelUrl,
          },
        },
      },
    },
    `${opts.jobId}-order`,
  );
  const approve = o.links.find((l) => l.rel === "payer-action" || l.rel === "approve");
  if (!approve) throw new PayPalError("PayPal returned no approval link.", 500, "NO_APPROVE_LINK");
  return { orderId: o.id, approveUrl: approve.href };
}

/** After the client approves in PayPal: place the hold. Nothing is charged yet. */
export async function authorizeHold(
  jobId: string,
  orderId: string,
): Promise<{ authorizationId: string; expires?: string; amount: string }> {
  const r = await call<{
    purchase_units: {
      payments?: { authorizations?: { id: string; expiration_time?: string; amount: { value: string } }[] };
    }[];
  }>("POST", `/v2/checkout/orders/${orderId}/authorize`, {}, `${jobId}-authorize`);
  const a = r.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!a) throw new PayPalError("PayPal returned no authorization.", 500, "NO_AUTHORIZATION");
  return { authorizationId: a.id, expires: a.expiration_time, amount: a.amount.value };
}

/**
 * SANDBOX ONLY. Hold the money on PayPal's public sandbox test Visa, so a
 * judge without a sandbox login can run the whole loop. The card details
 * never come from the browser, and this refuses to run against live PayPal.
 */
export async function createHoldWithTestCard(opts: {
  jobId: string;
  title: string;
  totalCents: number;
}): Promise<{ orderId: string; authorizationId: string; expires?: string }> {
  if (!PAYPAL_SANDBOX) throw new PayPalError("Test cards only work in the sandbox.", 400, "LIVE_REFUSED");
  const o = await call<{
    id: string;
    status: string;
    purchase_units: { payments?: { authorizations?: { id: string; status: string; expiration_time?: string }[] } }[];
  }>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: opts.jobId,
          custom_id: opts.jobId,
          description: opts.title.slice(0, 127),
          amount: { currency_code: "USD", value: dollars(opts.totalCents) },
        },
      ],
      payment_source: {
        card: {
          number: "4111111111111111",
          expiry: "2030-12",
          security_code: "123",
          name: "Sandbox Client",
          billing_address: {
            address_line_1: "1 Main St",
            admin_area_2: "San Jose",
            admin_area_1: "CA",
            postal_code: "95131",
            country_code: "US",
          },
        },
      },
    },
    `${opts.jobId}-order-card`,
  );
  const a = o.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!a || a.status !== "CREATED") throw new PayPalError(`Card hold not placed (${o.status}).`, 402, "CARD_DECLINED");
  return { orderId: o.id, authorizationId: a.id, expires: a.expiration_time };
}

export async function getOrder(orderId: string) {
  return call<{ id: string; status: string }>("GET", `/v2/checkout/orders/${orderId}`);
}

// ─── release ─────────────────────────────────────────────────────────────

/** Charge exactly the held amount. Called only by release(), never by a model. */
export async function captureHold(
  jobId: string,
  authorizationId: string,
  totalCents: number,
): Promise<{ captureId: string; status: string }> {
  const r = await call<{ id: string; status: string }>(
    "POST",
    `/v2/payments/authorizations/${authorizationId}/capture`,
    {
      amount: { currency_code: "USD", value: dollars(totalCents) },
      final_capture: true,
      invoice_id: jobId,
      note_to_payer: "Released by Engine after the work passed review.",
    },
    `${jobId}-capture`,
  );
  return { captureId: r.id, status: r.status };
}

export async function voidHold(jobId: string, authorizationId: string) {
  await call("POST", `/v2/payments/authorizations/${authorizationId}/void`, {}, `${jobId}-void`);
}

/**
 * Pay the people who did the work. sender_batch_id is the job id, and PayPal
 * refuses a second batch with the same id within 30 days, so a retry, a
 * double click or a replayed request cannot pay twice.
 */
export async function payout(
  jobId: string,
  title: string,
  items: { email: string; amountCents: number; note: string; itemId: string }[],
): Promise<{ batchId: string; status: string }> {
  const r = await call<{ batch_header: { payout_batch_id: string; batch_status: string } }>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: `engine-${jobId}`,
        email_subject: "You've been paid through Engine",
        email_message: `Your work on "${title.slice(0, 80)}" passed review.`,
      },
      items: items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.email,
        amount: { currency: "USD", value: dollars(i.amountCents) },
        note: i.note.slice(0, 4000),
        sender_item_id: i.itemId,
      })),
    },
  );
  return { batchId: r.batch_header.payout_batch_id, status: r.batch_header.batch_status };
}

export async function payoutStatus(batchId: string): Promise<{ status: string; items: { status: string; fee?: string }[] }> {
  const r = await call<{
    batch_header: { batch_status: string };
    items: { transaction_status: string; payout_item_fee?: { value: string } }[];
  }>("GET", `/v1/payments/payouts/${batchId}`);
  return {
    status: r.batch_header.batch_status,
    items: (r.items || []).map((i) => ({ status: i.transaction_status, fee: i.payout_item_fee?.value })),
  };
}

// ─── reading the business ────────────────────────────────────────────────

export async function balance(): Promise<{ availableCents: number; currency: string } | null> {
  try {
    const r = await call<{ balances: { currency: string; available_balance?: { value: string } }[] }>(
      "GET",
      "/v1/reporting/balances?currency_code=USD",
    );
    const usd = r.balances?.find((b) => b.currency === "USD");
    if (!usd?.available_balance) return null;
    return { availableCents: Math.round(Number(usd.available_balance.value) * 100), currency: "USD" };
  } catch {
    return null;
  }
}
