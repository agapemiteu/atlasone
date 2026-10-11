# Atlas One: technical documentation

Architecture decisions and their rationale are in [`ARCHITECTURE.md`](ARCHITECTURE.md) (D1-D18). This
document covers how the system works, how to run it, and the API contracts.

## Architecture

```
  Developer's agent (Claude Code, Codex, Cursor, VS Code, ...)
        │ MCP Streamable HTTP + OAuth 2.1 (PKCE, CIMD/DCR)
        ▼
  ┌──────────────────────────── Cloudflare Worker ────────────────────────────┐
  │ OAuthProvider ─ /mcp ─► 4 tools (discover, bind_project, test, inspect)   │
  │               ─ /authorize consent ─► GitHub sign-in ─► invite list        │
  │ /v1/chat/completions, /v1/models  ◄── developer's finished app (project key)│
  │ /claim/:token, /tokens, /playground (owner pages); / and /docs: web/ assets│
  │            all model calls ─► lib/inference.ts (single path)               │
  │ /api/upstream/register ◄── N-ATLaS server announces itself (admin key)     │
  └──────────────┬────────────────────────────────────────────────────────────┘
                 │ HTTPS (Cloudflare tunnel), upstream key, health-probed
                 ▼
  N-ATLaS server: llama.cpp b11552, NCAIR1/N-ATLaS@e294476… F16, 2x T4, 4 slots x 4096
  D1: projects, keys (digests), claims, nonces, quotas, request metadata, upstreams
  KV: OAuth grants and tokens (hashed, props encrypted)
```

**Request path for an app** (`POST /v1/chat/completions`): project key (digest lookup; revoked → 401) →
validate (allowlisted fields, model must be `n-atlas-8b`, body ≤ 64 KB, max_tokens ≤ 1024) → backend
state (10 s cache, observed signals only) → atomic quota (30/min, 500/day) → upstream with model-card
defaults → JSON or SSE passthrough with provenance headers → metadata logged after the response.

**Agent path:** the MCP client discovers OAuth from the 401 (`resource_metadata`), registers (CIMD or
DCR), the developer approves scopes on Atlas One's consent page and signs in with GitHub; tools then run
as that developer, limited to the granted scopes and their own projects.

## Running it

Prerequisites: Node 22+, a Cloudflare account (free plan), a GitHub OAuth App, Hugging Face access to
`NCAIR1/N-ATLaS`.

```bash
npm install && npm install --prefix web
npx wrangler d1 create atlas-one            # put the id in wrangler.jsonc
npx wrangler kv namespace create OAUTH_KV   # put the id in wrangler.jsonc
npx wrangler d1 migrations apply atlas-one --remote
# secrets
npx wrangler secret put ATLAS_UPSTREAM_KEY   # shared with the N-ATLaS server
npx wrangler secret put ATLAS_ADMIN_KEY      # lets the N-ATLaS server register itself
npx wrangler secret put SESSION_SECRET       # >= 32 random characters
npx wrangler secret put GITHUB_CLIENT_SECRET
# vars in wrangler.jsonc: PUBLIC_ORIGIN, GITHUB_CLIENT_ID, ALLOWED_GITHUB_LOGINS, UPSTREAM_HOSTS
npm run deploy                              # builds web/ (React + shadcn/ui), then wrangler deploy
```

GitHub OAuth App redirect URIs (exact match): `<origin>/auth/github/mcp` and `<origin>/auth/github/web`.

Invite a beta tester: add their GitHub login to `ALLOWED_GITHUB_LOGINS`, or
`npx wrangler d1 execute atlas-one --remote --command "INSERT INTO allowlist VALUES ('<login>', 0)"`.

### Running the N-ATLaS backend

`inference/kaggle_serve.py` runs on a free Kaggle notebook (GPU T4 x2, Internet on) with Kaggle secrets
`HF_TOKEN`, `ATLAS_UPSTREAM_KEY`, `ATLAS_ADMIN_KEY`. It fetches pinned llama.cpp CUDA binaries, gets the
F16 GGUF (from a private cache repo if present, otherwise downloads and converts `NCAIR1/N-ATLaS` and
caches it), starts the server, opens a Cloudflare tunnel, sends a warm-up request, and registers its URL
with Atlas One. Registration requires the admin key, an `https` origin on `UPSTREAM_HOSTS`, a ready
`/health`, and proof the server accepts the upstream key and serves `n-atlas-8b`.

Any OpenAI-compatible N-ATLaS server (vLLM, llama.cpp elsewhere, a hosted endpoint) can register the same
way; `inference/modal_serve.py` is a vLLM variant for Modal.

### Wake-on-demand

With the `KAGGLE_KEY` secret set (a Kaggle API token), an authenticated request that finds the backend
offline (app key, OAuth tool call, or signed-in playground) calls Kaggle `SaveKernel` with the bundled
`kaggle_serve.py`, `machineShape: NvidiaTeslaT4` (GPU T4 x2), internet on and `SAVE_AND_RUN_ALL`. Wakes are
debounced (one in flight) and expire after 20 minutes. Kaggle secrets are not available to API-started
runs, so each pushed notebook carries only a single-use bootstrap token (30-minute TTL, digest stored),
traded once at `POST /api/upstream/bootstrap` for the keys; notebook versions never hold long-lived keys.
The server reports each stage to `POST /api/upstream/progress` (`notebook_started`, `fetching_runtime`,
`downloading_model`, `loading_weights`, `warming_up`, `sleeping`, `failed`) and registration marks it
`ready`. If no progress arrives, Atlas One asks Kaggle for the run status and records a failure with its
reason. `GET /api/status` exposes the live state; the home page polls it and renders each stage. The server
sleeps after 20 minutes without generated tokens (llama.cpp `--metrics`).

## App API

`POST /v1/chat/completions`: OpenAI Chat Completions format. Fields forwarded: `messages` (system, user,
assistant), `max_tokens`/`max_completion_tokens`, `temperature`, `top_p`, `stop`, `seed`,
`presence_penalty`, `frequency_penalty`, `stream`. `GET /v1/models` lists `n-atlas-8b` with weights,
languages, attribution and live backend state.

Response headers: `x-atlas-request-id`, `x-atlas-weights`, `x-atlas-runtime`, `x-atlas-upstream-ms`.
Optional request header `x-atlas-verify: <nonce>` links a request to `atlas_test` verification.

Errors use `{ "error": { "code", "type", "message", "retryable", "retry_after_s?", "request_id" } }`:

| Code | HTTP | Retry | Meaning |
|---|---|---|---|
| AUTH_REQUIRED, INVALID_KEY, KEY_REVOKED | 401 | no | Missing, unknown or revoked key |
| FORBIDDEN | 403 | no | Not allowed for this account, scope or project |
| VALIDATION_FAILED / REQUEST_TOO_LARGE | 400 / 413 | no | Fix the request |
| RATE_LIMITED / BACKEND_BUSY | 429 | yes | Quota or capacity; honour `Retry-After` |
| MODEL_OFFLINE / BACKEND_WARMING | 503 | yes | No backend / loading; never a substitute answer |
| INFERENCE_TIMEOUT | 504 | yes | No reply in 120 s |
| INVALID_OUTPUT / UPSTREAM_ERROR | 502 | no / yes | Empty completion / backend error |

## MCP tools

| Tool | Scope | Input | Output |
|---|---|---|---|
| `atlas_discover` | atlas:read | `recipe?` (`nextjs`/`generic`) | backend state, model card, API, limits, projects, recipe text |
| `atlas_bind_project` | atlas:projects | `name`, `action` (`bind`/`rotate_key`/`revoke_key`) | project, claim URL (never a key) |
| `atlas_test` | atlas:test | `project`, `action` (`inference`/`issue_app_nonce`/`verify_app`), `language?`, `prompt?`, `nonce?` | evidence: request id, weights, latency, output excerpt; or `verified` with evidence |
| `atlas_inspect` | atlas:read | `project`, `window_minutes?` | counts, latency p50/p95, errors with retryability, quota, keys, backend |

All tool results are `{ ok: true, ... }` or `{ ok: false, error: {...} }` with the same codes as the API.

## Testing

`npx vitest run`: 106 tests inside workerd (`@cloudflare/vitest-plugin`) with real local D1 and KV,
including MCP conformance with the official MCP client SDK in both protocol eras (2025 and 2026-07-28),
the full OAuth flow through the real Worker entry, security cases (SSRF, CSRF, XSS escaping, open
redirect, owner isolation, concurrent quota bursts, single-use claims), and every failure mode. Test
fakes reproduce workerd behaviours that once hid a production bug (`strictFetch`).

Live checks against the deployment: `node --env-file=.env.local scripts/e2e-gateway.mjs` (official OpenAI
SDK) and `node --env-file=.env.local scripts/e2e-mcp.mjs` (official MCP client, both protocol eras).
