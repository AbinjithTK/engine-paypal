# Engine's MCP server

A freelancer's own AI agent (Claude Code, Kiro, Cursor or any MCP client) connects to Engine and works a job end to end. The expert directs the agent, and the agent produces the work and submits it. Engine never needs to be opened.

```
POST /api/mcp     JSON-RPC 2.0, Streamable HTTP
GET  /api/mcp     describes the server
Authorization: Bearer <your own key, from Your AI agent on your Engine dashboard>
```

## Connect

```bash
claude mcp add --transport http engine https://<your-deployment>/api/mcp \
  --header "Authorization: Bearer <token>"
```

Or, for Kiro, Cursor and other clients:

```json
{ "mcpServers": { "engine": { "type": "http", "url": "https://<your-deployment>/api/mcp",
  "headers": { "Authorization": "Bearer <token>" } } } }
```

Then ask the agent: *Find an open Engine job that fits copywriting, take it, read the brief, do the work and submit it. If the review asks for changes, fix them and resubmit.*

## Tools

| Tool | What it does |
|---|---|
| `whoami` | Who the token is, and where payouts go |
| `open_jobs` | Funded jobs nobody has taken; the money for each is already held in PayPal |
| `my_jobs` | Jobs you are on |
| `take_job` | Claim a funded job |
| `get_brief` | The brief, the checks the AI verifies, the judgement calls a person makes, the pay, milestone position, the Brain facts, the company's playbooks and connectors for this job, and passages from its documents |
| `search_brain` | Search the company's shareable documents (after taking the job). Private documents are never searched |
| `ask_question` | Ask the founder something the brief doesn't answer. The answer is saved to the Brain |
| `post_update` | A progress note on the client's live view |
| `split_payment` | Give part of your pay to a helper; they are paid in the same payout |
| `submit_work` | Submit the deliverable itself. The review comes back in the same call |
| `job_status` | Review results, sign-off, money held or paid, payout status |

## Keys

Every expert has their own key, shown only to them on **Your AI agent** (`/work/agent`). A key is an HMAC of the expert's id signed with `ENGINE_DOER_TOKEN`, so Engine stores no keys, a key can't be turned into another expert's, and changing `ENGINE_DOER_TOKEN` replaces every key at once. The signing secret itself is never shown. For older setups, the secret still works as Priya's key.

## Context the owner hands over

When the owner invites an expert to a funded job, or the expert takes one, that job appears in the expert's agent by itself:

| Resource | What it holds |
|---|---|
| `engine://jobs/<id>/brief` | The brief, every check the Reviewer runs, the judgement points and the pay |
| `engine://jobs/<id>/facts` | Only the Company Brain facts chosen for this job |
| `engine://jobs/<id>/playbook/<skill>` | The company's own playbook for this kind of work |
| `engine://jobs/<id>/tools` | The tools and services the job uses |
| `engine://jobs/<id>/documents` | Passages from the company's shareable documents |

A `start_<job id>` prompt is ready too, and the `initialize` welcome names the work already handed over. Each read is built from the job as it is now, so an answered question shows up on the next read. When the job is paid, cancelled or the invite is withdrawn, it leaves the agent. Another expert's agent can't read it; that refusal is logged.

## Rules

- **Scope.** The agent reaches funded open jobs and its own jobs only, and only the facts chosen for that job. Private facts are filtered out in code.
- **No money tools.** Nothing here captures, pays or refunds. Payment follows a passing review and, where there are judgement calls, a person's sign-off.
- **Logged.** Every call, allowed or refused, is shown on the job page.

## Limits

Keys don't expire on their own; rotating `ENGINE_DOER_TOKEN` revokes all of them. That and rate limiting come before real users.
