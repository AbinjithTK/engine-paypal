# Engine

**Expert work, checked twice, paid through PayPal.**

A founder posts work in plain words. A human expert, such as a marketer, designer, lawyer or engineer, takes it and directs it, using their own AI agent to produce it. Engine's AI checks the work against the brief. Then a person judges what only a person can. On sign-off, PayPal pays the expert.

Built for the PayPal AI Hackathon. It runs on PayPal's sandbox, so no real money moves.

## The loop

1. **Describe the work.** The Scoper (Gemini) reads the Company Brain and writes:
   - a brief
   - **checks** an AI can verify
   - **judgement calls** only a person can make
   - a price

   Bigger work becomes 2 to 4 milestones.
2. **Hold the money.** The client approves in PayPal. Engine authorizes the order, so the money is held but not charged.
3. **Build the team.**
   - **Roles:** the Scoper gives each milestone a role (strategist, designer, copywriter, photographer). Milestones that don't depend on each other run at the same time.
   - **Matching:** the Matcher (Gemini) ranks experts for each role from their profiles, with a one-line reason. If the model is down, it falls back to skill overlap.
   - **Inviting:** on the team board (`/app/team/[id]`), the owner drags an expert onto a role or presses Invite.
   - **Accepting:** experts accept in their dashboard at `/work`, where they read the full brief, ask the founder questions (each answer is saved to the Brain) and submit work. They can use Claude Code, Kiro or Cursor through Engine's MCP server instead, which sees the same thing.
4. **Review, layer one.** The Reviewer checks every check, quotes exactly what fails, and flags passages that read as generic AI output. If anything fails, the work goes back and the money stays held.
5. **Review, layer two.** The founder judges taste, strategy and voice. For legal or regulated work, a named second expert does instead. Approving releases the money; asking for changes sends the notes back.
6. **Pay.** PayPal captures the hold and pays everyone on the job through Payouts. The Bookkeeper creates the invoice with the PayPal Agent Toolkit and records the payment.
7. **Next milestone.** The next milestone unlocks only after this one is paid, and goes to the same expert.

## How PayPal is used

| PayPal | Where | Why |
|---|---|---|
| Orders v2, `intent: AUTHORIZE` | `web/src/lib/engine/paypal.ts` `createHold` / `authorizeHold` | Holds each job's money before work starts |
| Payments v2, capture and void | `captureHold`, `voidHold` | Charges exactly the held amount on sign-off, or releases it on cancel |
| Payouts v1 | `payout` | Pays the expert and any subcontractor. `sender_batch_id` is the job id, so PayPal refuses a duplicate payout |
| Agent Toolkit: `create_invoice`, `send_invoice`, `record_payment_for_invoice` | `web/src/lib/engine/bookkeeper.ts` | Gemini drives the toolkit to write and record the invoice. If the model fails, the same tools run in a fixed order |
| Agent Toolkit: `list_transactions` | `bookkeeper.ts`, `builders.ts` | Feeds real money in and out to the Bookkeeper and the Scout |
| Reporting v1, balances | `paypal.ts` `balance` | Shows the business balance next to what is held |

Every money call carries a `PayPal-Request-Id` derived from the job, so retrying a step never moves money twice. The calls were checked against PayPal's official OpenAPI specs, which are kept in `docs/paypal/`.

## Safety rules

- **No AI tool can move money.** Capture and payout are plain functions in `jobs.ts`. They run only when the latest review passed **and**, where there are judgement calls, a person signed off.
- **The Reviewer has no tools.** It returns a verdict on the checks and notes on the judgement calls. It never gives a verdict on the judgement calls.
- **Amounts and recipients come from the approved job,** never from a model. Payee shares must add up to the job price exactly. Money is always integer cents.
- **Agent access is scoped.** A freelancer's agent sees funded open jobs and its own jobs, and only the Brain facts chosen for that job. Facts marked never shared are filtered out in code, whatever the model picks.
- **Every MCP call is logged,** allowed or refused, and shown on the job page.
- **Work is data.** The Reviewer is told to ignore instructions inside submitted work.

## The Company Brain

The owner can add material to the Brain in four ways:
- **The onboarding interview**, which files facts with their sources.
- **Uploads:** PDF, Word, Markdown, text, CSV and JSON files.
- **A website page or pasted notes.**
- **A GitHub repo:** its README, docs and open issues. The repo also becomes a connector.

Every source is split into passages, and Gemini drafts facts from it for the owner to confirm. Anything marked **never shared** stays out of every job.

**Connectors and skills.** The owner can also list the company's connectors (MCP servers, apps, repos) and write **skills**, which are playbooks for how the company wants a kind of work done. When a job is scoped, Engine picks the facts, passages, connectors and skills that job needs. The expert's agent receives them in the brief, can search the shareable documents with `search_brain`, and the Reviewer checks the work against the playbooks.

**Search** uses one of two backends, behind `web/src/lib/engine/search.ts`:

| | Local index (default) | Elastic (an option) |
|---|---|---|
| How | BM25 keyword ranking over passages in Engine's own store | `semantic_text` index, hybrid semantic plus keyword query |
| Setup | none | `ELASTIC_URL` and `ELASTIC_API_KEY`, then switch it on in Brain > Search |
| When | small companies | Engine suggests it from 400 passages |

Passages are always kept locally. Switching to Elastic copies them into the index. If an Elastic call fails, search and uploads fall back to the local index, and the job's timeline says so. Private passages are excluded in the query itself in both backends, and again in code.

## What's in the app

| Screen | What it does |
|---|---|
| `/app` Village | The company as buildings, the AI builders at work, and the cards that need you |
| `/app/jobs` | Work, milestones, the money held and paid |
| `/app/jobs/[id]` | Brief, AI checks with reasons, notes for the person signing off, sign-off, PayPal IDs, what the job can see, agent access log |
| `/app/brain` | Facts: interview, confirm, resolve conflicts, answer freelancers' questions. Documents: uploads, GitHub, pasted notes. Connectors and skills. Search: local or Elastic, and a test box |
| `/app/builders` | Scoper, Reviewer, Bookkeeper, Librarian, Scout: run history, how much each does on its own, pause |
| `/app/team`, `/app/team/[id]` | Teams per project, and the visual team builder: role slots, AI-ranked experts with reasons, drag to invite |
| `/app/connect` | How a freelancer's agent connects over MCP |
| `/work` | The expert's dashboard: invites with why they fit, jobs, earnings, open jobs |
| `/work/jobs/[id]` | The full brief, checks and judgement calls, the company's playbooks and passages, Q&A with the founder, the team, submit and review |
| `/work/profile` | The profile the Matcher reads |

## Run it locally

```bash
cd web
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

Open `http://127.0.0.1:3000`. In the sandbox you can fund a job with **Use the sandbox test card**, so no PayPal login is needed.

To be the freelancer's agent, connect Claude Code:

```bash
claude mcp add --transport http engine http://127.0.0.1:3000/api/mcp \
  --header "Authorization: Bearer priya-dev-token"
```

`priya-dev-token` works only in development. In production, set `ENGINE_DOER_TOKEN`.

## Environment

| Variable | Needed | What it is |
|---|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | yes | A PayPal sandbox app with Payouts, Invoicing and Transaction search enabled. Use a US business account; an Indian sandbox business account can't send payouts |
| `PAYPAL_ENVIRONMENT` | yes | `SANDBOX` |
| `PAYPAL_FREELANCER_EMAIL` | yes | Sandbox personal account that receives payouts |
| `PAYPAL_CLIENT_EMAIL` | no | Sandbox personal account used as the invoice recipient |
| `AI_API_KEY` | yes | Gemini API key |
| `NEBIUS_API_KEY` | no | Nebius Token Factory key, used when every Gemini model is out of quota |
| `NEBIUS_MODEL` | no | Default `Qwen/Qwen3-235B-A22B-Instruct-2507` |
| `ELASTIC_URL`, `ELASTIC_API_KEY` | no | Elasticsearch endpoint and API key. Lets the owner switch Brain search to Elastic |
| `ELASTIC_INDEX`, `ELASTIC_INFERENCE_ID` | no | Index name (default `engine-brain`) and a non-default inference endpoint for `semantic_text` |
| `GITHUB_TOKEN` | no | Read-only token for connecting private repos |
| `ENGINE_DOER_TOKEN` | prod | Bearer token for the freelancer's agent |
| `ENGINE_SHOW_DOER_TOKEN` | no | `1` shows the token on `/app/connect` (public demo only) |
| `ENGINE_OWNER_KEY` | no | Locks owner actions behind `/app/unlock`. Unset means an open demo |
| `CRON_SECRET` | prod | Protects `/api/engine/cron` |
| `DATA_DIR` | prod | Where the JSON store lives. Default `web/.data` |
| `RELEASE_WINDOW_SECONDS` | no | Appeal window for jobs with no judgement calls. Default 600 |

## Deploy on Render

`render.yaml` defines:
- a Docker web service on a Starter instance, with a 1 GB disk for the data file
- a daily cron that runs the builders

In Render, choose **New > Blueprint**, pick this repo, and fill in the secrets it asks for. Set `ENGINE_URL` on the cron to the web service's address once it exists.

## Built with

Next.js 16, React 19, TypeScript. PayPal REST APIs and `@paypal/agent-toolkit`. Google Gemini (`@google/genai`), with Nebius Token Factory as a fallback. Model Context Protocol over HTTP. Hosted on Render.

## Limits, stated plainly

- **Sandbox only.** Live payouts need PayPal's approval, and Engine's terms need a lawyer's review before real clients use it.
- **One company per deployment.** Data is a single JSON file on disk. Postgres is the next step.
- **Demo identities.** The expert dashboard signs in by picking a seeded profile, and the MCP token belongs to one expert. Real accounts, expert vetting and credential checks, such as bar registration, are not built.
- **Payouts to seeded experts.** Only experts with sandbox PayPal accounts (`PAYPAL_FREELANCER_EMAIL`, `PAYPAL_EXPERT_EMAILS`) receive payouts you can see. The others' payouts stay unclaimed in the sandbox.
- **The AI review can be wrong,** which is why money waits for a person on anything that needs judgement, and why appeals exist.
- Engine is a marketplace. It does not give legal, tax or financial advice.

Earlier design documents from the project's first version are in `docs/archive/`.

## License

MIT. See `LICENSE`.
