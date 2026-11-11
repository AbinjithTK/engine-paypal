# PayPal reference docs (downloaded 11 Nov 2026)

Official sources Engine's PayPal code is built against. Read these before writing or changing a PayPal call.

| File | What it covers | Source |
|---|---|---|
| `orders_v2.json` | Create order, `intent: AUTHORIZE`, approve, authorize | [paypal-rest-api-specifications](https://github.com/paypal/paypal-rest-api-specifications) `checkout_orders_v2.json` |
| `payments_v2.json` | Capture, void and reauthorize an authorization; refund a capture | same repo, `payments_payment_v2.json` |
| `payouts_v1.json` | Create a payout batch, `sender_batch_id` idempotency, batch status | same repo, `payments_payouts_batch_v1.json` |
| `invoicing_v2.json` | Create, send, remind, record payment on invoices | same repo, `invoicing_v2.json` |
| `agent-toolkit-README.md` | `@paypal/agent-toolkit` tools and setup | [paypal/agent-toolkit](https://github.com/paypal/agent-toolkit) |

These are OpenAPI specs: exact endpoints, request fields, enums and error codes. No credentials are stored here; keys live only in `web/.env.local`, which git ignores.
