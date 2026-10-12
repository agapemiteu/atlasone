# How Atlas One works

One Cloudflare Worker is the whole product: MCP server, OAuth, gateway, pages and site. N-ATLaS runs on a
GPU it wakes on demand. Spec: [`PRD.md`](PRD.md). History: [`../atlas-one.log`](../atlas-one.log).

```
 Any MCP client ─► /mcp ── OAuthProvider (OAuth 2.1, PKCE, CIMD/DCR) ─► 4 tools, as the signed-in developer
 (Claude Code,      /authorize ─► consent (scopes) ─► GitHub sign-in ─► access check
  Codex, Cursor…)
 Developer's app ─► /v1/chat/completions, /v1/models (project key, server-side only)
                         │
                         └─► src/lib/inference.ts, the only path to the model ─► N-ATLaS
                                                                                  llama.cpp b11552, F16,
 Kaggle notebook ─► /api/upstream/{bootstrap,progress,register} ◄── wakes it ──   2x T4, Cloudflare tunnel
 Browsers ───────► / /docs /guide (web/, static assets) · /playground /tokens /claim /feedback /evidence

 D1: projects, api_keys, personal_tokens, claims, verify_nonces, rate_windows, request_logs, upstreams,
     backend_wakes, activity, feedback, allowlist          KV: OAuth grants and tokens (hashed)
```

## Request paths

**App** (`POST /v1/chat/completions`): key digest lookup (revoked → 401) → validate (allowlisted fields,
model `n-atlas-8b`, body ≤ 64 KB, `max_tokens` ≤ 1024) → backend state (10 s cache, observed signals) →
atomic quota (30/min, 500/day per project) → upstream with the model card's settings (repetition penalty
1.12, temperature 0.1, current date) → JSON or SSE with `x-atlas-request-id`, `x-atlas-weights`,
`x-atlas-runtime` → metadata logged after the response. Prompts and answers are never stored.

**Agent**: the client gets a 401 pointing to the protected-resource metadata, registers (CIMD or DCR), the
developer approves scopes and signs in with GitHub, and tools then run as that developer, limited to the
granted scopes (`atlas:read`, `atlas:test`, `atlas:projects`) and their own projects. Keys never enter the
agent: `atlas_bind_project` returns a single-use link only the owner can open.

**Verification**: `atlas_test issue_app_nonce` → the app's route forwards `x-atlas-verify` → `verify_app`
finds that request in `request_logs` and returns `verified: true` with a signed receipt.

**Wake-on-demand**: an authenticated request that finds N-ATLaS asleep calls Kaggle `SaveKernel`
(`NvidiaTeslaT4` = 2x T4, `SAVE_AND_RUN_ALL`) with `inference/kaggle_serve.py`. Kaggle secrets are not
available to API-started runs, so the notebook carries only a single-use bootstrap token (30 min, digest
stored) traded once for the keys. The server reports each stage to `/api/upstream/progress`, registers its
tunnel when ready (admin key, `https`, host allowlist, health and model checks), and sleeps after 40 idle
minutes. Wakes are debounced; a dead Kaggle run is detected and reported. Callers get `BACKEND_WARMING`
with a retry time meanwhile, never a substitute answer.

## Errors

`{ "error": { "code", "type", "message", "retryable", "retry_after_s?", "request_id" } }`, identical for the
API and the tools. The full table is generated from `src/lib/errors.ts` on the [docs page](https://atlas-one.collins-coordinator-worker.workers.dev/docs#errors).

| Situation | Result |
|---|---|
| Kaggle session ends mid-request | `MODEL_OFFLINE`, backend state flips immediately |
| All 4 slots busy | `BACKEND_BUSY` with `retry_after_s` |
| Burst from a loop in the app | `RATE_LIMITED`, atomic counters (no over-admission under concurrency) |
| Registered tunnel unhealthy | Stays inactive; previous upstream or `MODEL_OFFLINE` |
| Claim link leaked | Owner-bound: 403 for anyone else; single use |
| Warm-up longer than a tool call | `BACKEND_WARMING` with stage and retry time |

## Security

OAuth 2.1 + PKCE per the MCP authorization spec; consent pages cannot be framed and bind to the browser.
Keys, tokens, claims and nonces are stored as SHA-256 digests. CSRF tokens (HMAC) on every form, signed
`__Host-` cookies, open-redirect guard, SSRF host allowlist, per-IP limit on sign-in routes, strict CSP.
Each case has a test.

## Decisions

| # | Decision |
|---|---|
| D1 | MCP sign-in is OAuth Connect: OAuth 2.1 (workers-oauth-provider, CIMD + DCR), GitHub identity, consent page |
| D2 | `atlas_bind_project` returns a one-time link; the key never enters the agent's context |
| D3 | The model server self-registers its tunnel (admin key, https, host allowlist, health-checked before activation) |
| D4 | Licence cap and "Powered by Awarri" surfaced in discover and recipes; per-project quotas 30/min, 500/day |
| D5 | Personal access tokens alongside OAuth for headless clients |
| D6 | One recipe source, served by `atlas_discover` and as an MCP resource |
| D7 | `src/lib/inference.ts` is the single model path for the gateway, `atlas_test` and the playground |
| D8 | Conformance tests with the official MCP client SDK in both protocol eras (2025, 2026-07-28) |
| D9 | Backend state cached 10 s; a failed call flips it immediately; discover probes live |
| D10 | Thin slice first: genuine inference, then gateway, then MCP, then OAuth |
| D11 | App verification is nonce-bound (`x-atlas-verify`), proving a specific route, not just the key |
| D12 | Quotas are atomic single-statement D1 upserts before forwarding |
| D13 | Claim links are owner-bound, single use, 10-minute TTL, key shown once |
| D14 | 4 slots x 4096 tokens; `BACKEND_BUSY` when full. Scheduled windows superseded by wake-on-demand |
| D15 | Invite list at sign-in. Superseded for the public beta by D21; kept as the `ACCESS=invite` switch |
| D16 | Permissions like Claude/Codex connectors: scopes on consent; sensitive actions confirmed in the browser (works on every client, unlike elicitation); honest tool annotations |
| D17 | Recipes: `nextjs` (tested end to end) and `generic` (any stack); no SDK to install |
| D18 | Everything on Cloudflare (Worker, D1, KV); the site is static assets on the same Worker |
| D19 | Beta evidence: `activity` log of sign-ins and tool outcomes (metadata only), `/feedback`, live `/evidence` |
| D20 | Verifiable evidence with standards only: JSON Lines log, EdDSA-signed JWT receipts and snapshot, JWKS; see [EVIDENCE.md](EVIDENCE.md) |
| D21 | Public beta: `ACCESS=open` admits any GitHub account; quotas, the per-account project cap and logging bound abuse |
| D22 | `atlas_discover` starts waking a sleeping model, so the cold start overlaps with integrating instead of blocking the first test |
| D28 | Direct API keys from `/access` (sign in, name a project, Create API key) reuse the agents' project and one-time key page; agents get a four-step fast path, the recipe with the key link, the app check with the first test, and a standard `SKILL.md` at `/skill.md` |
| D27 | Compute is a setting: `COMPUTE=modal` (stable URL, scales to zero, L4 or A10G, 1-2 min cold start, paid credit) or `kaggle` (free 2x T4, can queue). Same llama.cpp release and F16 weights on both; only the active provider's hosts may register |
| D26 | Standard MCP surface: server title and websiteUrl, `outputSchema` on every tool, two prompts (`build_with_n_atlas`, `diagnose_n_atlas`) that clients show as commands; an Access page lists every connected agent (OAuth grant) and signs any of them out, the same for all clients |
| D25 | Authorization-server metadata omits RFC 9207 `authorization_response_iss_parameter_supported` (optional): some Codex versions drop `iss` in their callback and reject servers that advertise it. `iss` is still sent |
| D24 | In-session feedback: results carry `feedback_request` once per session (verified app, or 12th/40th call); the agent asks at a pause and sends the answer with `atlas_feedback` into the same `feedback` row as the web form (`source`, `session_id`). A fifth tool, because a form people forget is weaker evidence than a question asked in the flow |
| D23 | Full OpenAI surface the model supports: `response_format` (JSON Schema) and `tools`/`tool_calls`, validated by allowlist; both verified live |

## Run your own

Node 22.18+, a Cloudflare account (free plan), a GitHub OAuth App (callbacks `<origin>/auth/github/mcp`
and `<origin>/auth/github/web`), Hugging Face access to `NCAIR1/N-ATLaS`, a Kaggle account for the GPU.

```bash
npm install && npm install --prefix web
npx wrangler d1 create atlas-one && npx wrangler kv namespace create OAUTH_KV   # ids into wrangler.jsonc
npx wrangler d1 migrations apply atlas-one --remote
# secrets: ATLAS_UPSTREAM_KEY, ATLAS_ADMIN_KEY, SESSION_SECRET (>= 32 chars), GITHUB_CLIENT_SECRET,
#          KAGGLE_KEY, HF_TOKEN, RECEIPT_SIGNING_KEY (private Ed25519 JWK with a kid)
npx wrangler secret put <NAME>
npm run deploy          # builds web/, then deploys the Worker
```

Compute (D27). **Modal** (recommended): put `HF_TOKEN` and `ATLAS_UPSTREAM_KEY` in a Modal secret named `atlas-one`,
run `modal deploy inference/modal_serve.py`, set `COMPUTE` to `modal`, `MODAL_URL` to the printed URL and
`UPSTREAM_HOSTS` to `*.modal.run`, then register it once:
`curl -X POST <origin>/api/upstream/register -H "authorization: Bearer $ATLAS_ADMIN_KEY" -H "content-type: application/json" -d '{"url":"<MODAL_URL>","model_id":"NCAIR1/N-ATLaS","model_revision":"e294476928aca9030e924ca27bb8e085e8581273","runtime":"llama.cpp@b11552 f16"}'`.
**Kaggle** (free): `COMPUTE` `kaggle`, `UPSTREAM_HOSTS` `*.trycloudflare.com`; each run registers itself.

Restrict sign-in with `"ACCESS": "invite"` in `wrangler.jsonc`, then
`npx wrangler d1 execute atlas-one --remote --command "INSERT INTO allowlist VALUES ('<github-login>', 0)"`.
Any OpenAI-compatible N-ATLaS server can register the same way as the Kaggle one.

## Tests

`npm test` runs the Worker tests inside workerd with real local D1 and KV (MCP conformance in both protocol
eras, the OAuth flow through the real entry, every failure mode, security cases, evidence signing) and the
web tests. Live checks against the deployment: `node --env-file=.env.local scripts/e2e-gateway.mjs` (official
OpenAI SDK) and `scripts/e2e-mcp.mjs` (official MCP client).
