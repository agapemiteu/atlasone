# Atlas One

**Connect the world to N-ATLaS.** Atlas One is the MCP server and API for
[N-ATLaS](https://huggingface.co/NCAIR1/N-ATLaS), Nigeria's open multilingual model (English, Hausa, Igbo,
Yoruba). Connect your coding agent once; it builds N-ATLaS into your app, tests it on the real model and
proves your app reached it.

[Website](https://atlas-one.collins-coordinator-worker.workers.dev) ·
[Guide](https://atlas-one.collins-coordinator-worker.workers.dev/guide) ·
[Docs](https://atlas-one.collins-coordinator-worker.workers.dev/docs) ·
[Live evidence](https://atlas-one.collins-coordinator-worker.workers.dev/evidence)

Built for NAIC 2026, Problem Statement 1 (Developer Infrastructure): tools that take developers from
accessing N-ATLaS to integrating, testing, adapting and deploying it.

## Quickstart

Add the server to your agent, then ask for a feature in plain words. Your browser opens once to sign in
with GitHub.

```bash
claude mcp add --transport http atlas-one https://atlas-one.collins-coordinator-worker.workers.dev/mcp   # Claude Code
codex mcp add atlas-one --url https://atlas-one.collins-coordinator-worker.workers.dev/mcp              # Codex
```

Cursor, VS Code, Windsurf, Gemini CLI and any other MCP client: add the same URL as a remote (Streamable
HTTP) server. Configs for each are on the [docs](https://atlas-one.collins-coordinator-worker.workers.dev/docs).

```text
Use Atlas One to add a medicine-label reader to this app: dosing as JSON, explained in Hausa.
Keep the key server-side, then test and verify it.
```

The agent finishes with `verified: true` and offers a signed receipt (`ATLAS_VERIFICATION.jwt`) to commit.
No agent? Get an API key at https://atlas-one.collins-coordinator-worker.workers.dev/access and call the
OpenAI-compatible API directly (see App API below).

Faster every time: ask your agent once to save the agent skill at
https://atlas-one.collins-coordinator-worker.workers.dev/skill.md (a standard `SKILL.md`).

## What you get

| | |
|---|---|
| **Access** | One URL for every MCP client. OAuth 2.1 sign-in with PKCE; sign out from your agent or the `/access` page. Personal tokens for CI |
| **Integrate** | Recipes for Next.js and any stack; the key reaches your app through a browser confirmation, never through the agent |
| **Test** | Real inference with request id, weights revision and latency; nonce proof that *your app's route* reached N-ATLaS |
| **Adapt** | Structured output (JSON Schema, grammar-enforced), function calling, streaming, grounding guidance |
| **Deploy** | Same base URL and key in production; verify the live URL the same way; rotate and revoke keys |
| **Operate** | Per-project usage, latency and errors; GPU that sleeps when idle and wakes on demand in about 30 seconds, with live progress; clear errors, never a substitute model |

## MCP server

| Tool | Does |
|---|---|
| `atlas_discover` | Live model state, model card, limits, licence, your projects, integration recipes. Starts waking a sleeping model |
| `atlas_bind_project` | Creates a project; creates, rotates or revokes its key through a link you confirm in the browser |
| `atlas_test` | Real inference; issues and checks the nonce that proves your app route reached N-ATLaS; signs a receipt |
| `atlas_inspect` | Requests, latency p50/p95, recent errors with request ids, quota, keys |
| `atlas_feedback` | Your own rating and comments, when your agent asks at a natural pause |

Prompts: `build_with_n_atlas` (feature, language) and `diagnose_n_atlas` (project). Resources: the recipes.
Every tool has annotations and an output schema. Protocol versions 2025-03-26 to 2025-11-25.

## App API

OpenAI-compatible Chat Completions, so any SDK or plain HTTP works.

```bash
curl https://atlas-one.collins-coordinator-worker.workers.dev/v1/chat/completions \
  -H "authorization: Bearer $ATLAS_ONE_API_KEY" -H "content-type: application/json" \
  -d '{"model":"n-atlas-8b","messages":[{"role":"system","content":"Reply in Hausa."},{"role":"user","content":"What is the capital of Nigeria?"}]}'
```

Responses carry `x-atlas-request-id` and `x-atlas-weights` (the exact model revision). Errors use one
envelope, `{ "error": { "code", "message", "retryable", "retry_after_s", "request_id" } }`.

## Security and privacy

- Keys are shown once, to the signed-in owner, in the browser; stored as hashes; never in tool output or logs.
- Sensitive actions (new, rotated or revoked keys) need the owner's confirmation in the browser.
- Agents get only the scopes you approve; every agent connection can be signed out from `/access`.
- The beta log records metadata only (who, which agent, which step, outcome, request id), never prompts,
  completions, code or keys.

## Evidence

```bash
node scripts/verify-evidence.mjs   # Node 22.18+, nothing to install
```

Checks the signed tester log against the published key and the live server. [docs/EVIDENCE.md](docs/EVIDENCE.md)
covers both claims: the model is genuine N-ATLaS (pinned revision, request ids) and independent developers
used Atlas One (append-only log, signed with EdDSA, JWKS at `/.well-known/jwks.json`).

## Develop

```bash
npm install && npm install --prefix web
npm test          # Worker tests inside workerd, then web tests
npm run dev       # local Worker (secrets in .dev.vars)
npm run deploy    # builds web/, deploys the Worker
```

| Path | Contents |
|---|---|
| `src/` | Cloudflare Worker: OAuth and MCP (`index.ts`, `mcp.ts`, `tools/`), inference core (`lib/`), API (`routes/`), server pages (`web/`), recipes |
| `web/` | Website: home, guide, docs (React, shadcn/ui), served by the same Worker |
| `inference/` | The N-ATLaS model server (llama.cpp, F16): `modal_serve.py` (one L4 or A10G, the live setup) or `kaggle_serve.py` (free 2x T4) |
| `migrations/`, `test/` | D1 schema; tests |
| `scripts/` | Live end-to-end checks, seed, evidence snapshot and verifier |
| `docs/` | [How it works](docs/ARCHITECTURE.md) (architecture and decisions), [evidence](docs/EVIDENCE.md), [PRD](docs/PRD.md), video script |

Self-hosting, secrets and infrastructure: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#run-your-own).

## Licence and attribution

N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and
powered by Awarri Technologies. Its [terms](https://huggingface.co/NCAIR1/N-ATLaS) allow up to 1,000 active
end users per 30 days; commercial or large-scale use needs a licence from Awarri. Apps show "Powered by Awarri".
