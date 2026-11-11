# Engine's MCP server

A freelancer's own AI agent (Claude Code, Kiro, Cursor or any MCP client) connects to Engine and works a job end to end. The expert directs the agent, and the agent produces the work and submits it. Engine never needs to be opened.

```
POST /api/mcp     JSON-RPC 2.0, Streamable HTTP
GET  /api/mcp     describes the server
Authorization: Bearer <ENGINE_DOER_TOKEN>
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

## Rules

- **Scope.** The agent reaches funded open jobs and its own jobs only, and only the facts chosen for that job. Private facts are filtered out in code.
- **No money tools.** Nothing here captures, pays or refunds. Payment follows a passing review and, where there are judgement calls, a person's sign-off.
- **Logged.** Every call, allowed or refused, is shown on the job page.

## Limits

There is one configured token per deployment, not per-user accounts with expiry and revocation. That and rate limiting come before real users.
