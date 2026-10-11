# Atlas One: Architecture Plan (Phases B to E)

Status: LOCKED by /plan-eng-review on 2026-10-11 (18 decisions, outside voice: Codex).
Platform: Cloudflare (D18): Worker + D1 + KV + Durable Objects + workers-oauth-provider, GitHub login.
Scope source of truth: `docs/PRD.md`. Phase A (genuine inference) is done: see `atlas-one.log`.

## 1. Shape: one Cloudflare Worker

One Worker serves the gateway, the MCP server, sign-in/consent/claim pages, and the how-to page
(static assets). One deploy, one URL (`atlas-one.<account>.workers.dev`), one set of logs.

```
                    ┌──────────────── Atlas One (Cloudflare Worker, TypeScript) ─────────────────┐
 ANY MCP client ──► │ OAuthProvider (workers-oauth-provider): /authorize /token /register (DCR)  │
 Claude Code,       │   /.well-known/oauth-authorization-server, oauth-protected-resource       │
 Cursor, Codex,     │ /mcp ─► McpAgent (Durable Object, Agents SDK), Streamable HTTP             │
 VS Code, CI …      │   atlas_discover · atlas_bind_project · atlas_test · atlas_inspect         │
        │           │   token = OAuth grant (scopes, D16) OR personal token atl_pat_… (D5)       │
        ▼           │ /authorize UI: GitHub sign-in → allowlist (D15) → consent with scopes     │
 GitHub OAuth App ◄─┤ /claim/:id  /tokens  /  (how-to page, static assets + live status)        │
                    │                     │                                                      │
                    │            src/lib/inference.ts  ◄── the ONLY path to the model (D7)       │
 Developer's app ──►│ /v1/chat/completions, /v1/models  (project key atl_live_…)                 │
 (server-side only) │   auth → validate → quota (atomic D1 upsert, D12) → upstream → stream → log│
 Kaggle READY ─────►│ /api/upstream/register (admin secret, https, host allowlist, D3)           │
                    └─────────────────────┼───────────────────────────────────────────────────────┘
                                          ▼
                     llama.cpp on Kaggle 2x T4 (4 slots x 4k ctx, D14) via Cloudflare tunnel
   D1 (SQLite): allowlist · projects · api_keys · personal_tokens · claims · rate_windows ·
                request_logs · upstreams        KV: OAuth grants/tokens (workers-oauth-provider)
```

The developer's finished app talks only to `/v1/*` with a project key. It never needs MCP.
The free plan fits beta: 100k requests/day; 10 ms CPU per request is enough because waiting on the
upstream is I/O, not CPU. Move to Workers Paid ($5/mo) only if CPU limits are hit.
A richer hosted front end (e.g. on Vercel) can be added later as a pure client of the same Worker
APIs; nothing in this plan blocks it.

## 2. Agent compatibility: any MCP client, no client-specific code

- Transport: MCP Streamable HTTP via the Cloudflare Agents SDK `McpAgent` (current spec; the SDK also serves older clients).
- Auth: the MCP Authorization spec exactly. OAuth 2.1 + PKCE, Protected Resource Metadata at
  `/.well-known/oauth-protected-resource`, workers-oauth-provider as authorization server with Dynamic
  Client Registration; GitHub is the identity provider behind it.
  Fallback for clients without a browser (CI, sandboxes, minimal clients): personal token in the
  `Authorization: Bearer` header (D5). No vendor client IDs anywhere.
- Surface: everything is reachable through the 4 tools. Resources and progress notifications are
  extras that some clients do not show, never the only path (D6).
- Proof: automated conformance E2E with the official MCP SDK client on every change, plus a manual
  release matrix: Claude Code, Cursor, Codex, VS Code (D8). Others listed as "spec-compliant".
- Docs: one copy-paste install snippet per client, all pointing at the same URL.

## 3. Decisions (locked)

| # | Decision |
|---|---|
| D1 | MCP sign-in is OAuth Connect: OAuth 2.1 + DCR (workers-oauth-provider), GitHub sign-in, consent page |
| D2 | `atlas_bind_project` returns a one-time claim link; the key never enters the agent's context |
| D3 | Kaggle script self-registers its tunnel URL on READY (admin secret, https only, host allowlist, health-checked before activation) |
| D4 | Licence cap and "Powered by Awarri" shown in discover, bind and recipe; per-project quotas 30 req/min and 500 req/day |
| D5 | Personal access tokens accepted alongside OAuth for headless/CI/minimal clients |
| D6 | Recipe returned by `atlas_discover({recipe:"nextjs"})` and also exposed as a resource; one source file |
| D7 | `lib/inference.ts` is the single model path for the gateway and `atlas_test`; one error catalog |
| D8 | MCP SDK-client conformance E2E on every change, plus the manual 4-client release matrix |
| D9 | Backend state cached 10s per instance; a failed call flips it immediately; discover always probes live |
| D10 | Thin slice first (order in section 9); PRD Test 6 runs as soon as the slice works |
| D11 | App verification is nonce-bound: `x-atlas-verify` header forwarded by the recipe route, logged by the gateway |
| D12 | Quotas enforced by an atomic Postgres counter before forwarding; logs are diagnostics only |
| D13 | Claim links are owner-bound: GitHub session of the project owner, single use, 10-min TTL, key shown once |
| D14 | Beta runs in scheduled test windows; 4 slots x 4k ctx; `BACKEND_BUSY` with retry_after; availability shown live; ask NCAIR/NAIC for GPU |
| D15 | Invite-only: GitHub-username allowlist at sign-in, so the platform stays far below the 1,000-user cap |
| D16 | Permission model like Claude/Codex connectors: OAuth scopes on the consent screen (`atlas:read`, `atlas:test`, `atlas:projects`); sensitive tool actions (create project, rotate/revoke key) require human approval via MCP elicitation, or a one-time confirmation code on clients without elicitation; tools carry readOnly/destructive annotations |
| D17 | Recipes: `nextjs` (deeply tested) + `generic` (any OpenAI client: Node, Python, curl) so agents can integrate any stack; no SDKs |
| D18 | All on Cloudflare: Worker + D1 + KV + Durable Objects; how-to page served as static assets from the same Worker (replaces Vercel + Supabase). A Vercel front end can be added later as a client of the Worker APIs |
| D19 | Beta evidence for PRD Test 3/6: an `activity` table records sign-ins (with the MCP client name) and every tool call's outcome (metadata only); a signed-in `/feedback` questionnaire; a public `/evidence` page and `/evidence.json` computed live (time from connect to first real inference and to verified app, per tester; team excluded via `TEAM_GITHUB_LOGINS`). Disclosed on the consent page; testers can be anonymous |
| D20 | Verifiable evidence with standards only: session ids per connection; event log exported as JSON Lines (`atlas-one.evidence/v1`); EdDSA/Ed25519-signed JWTs (RFC 7519/8037) for verification receipts (saved in testers' own repos) and for the evidence snapshot committed in `evidence/`; public key as JWKS (RFC 7517) at `/.well-known/jwks.json`; `scripts/verify-evidence.mjs` checks signatures, the SHA-256 digest and that the live log is append-only. The private key exists only as the `RECEIPT_SIGNING_KEY` Worker secret |

## 3a. Implementation notes (2026-10-11, after T4/T6)

- MCP runs on `createMcpHandler` (Agents SDK, MCP server SDK v2): stateless Streamable HTTP serving the
  2026-07-28 protocol and 2025 clients. `McpAgent`/Durable Objects are deprecated upstream and not used.
- D16 approval is implemented as browser confirmation, not elicitation: every sensitive action
  (`atlas_bind_project` key/rotate/revoke) returns an owner-bound claim link the developer confirms
  after GitHub sign-in. This works on every MCP client; elicitation support varies.
- OAuth: `OAuthProvider` with DCR and Client ID Metadata Documents, library consent helpers (browser-bound
  handle, no framing), GitHub as identity (PKCE), scopes `atlas:read|test|projects`. Personal tokens enter
  through `resolveExternalToken` as a documented compatibility path. Root and path-specific protected
  resource metadata are both served.

## 4. Components

| Component | Path | Responsibility |
|---|---|---|
| Entry | `src/index.ts` | `OAuthProvider` wrapper: routes `/mcp` to McpAgent, everything else to the default handler |
| Gateway | `src/routes/v1.ts` | `/v1/chat/completions`, `/v1/models`; streaming passthrough |
| Inference core | `src/lib/inference.ts` | quota, backend state, forward with timeout, map errors, log. Used by gateway and `atlas_test` |
| Backend state | `src/lib/backend.ts` | active upstream, /health probe, 10s cache, ready/loading/offline/busy |
| MCP server | `src/mcp.ts` | `McpAgent` Durable Object: 4 tools + resources, scope checks, elicitation (D16) |
| Tools | `src/tools/{discover,bind,test,inspect}.ts` | pure functions over `db`, `inference`, `backend` |
| Credentials | `src/lib/credentials.ts` | `atl_live_` keys, `atl_pat_` tokens; SHA-256 (WebCrypto) + prefix; timing-safe compare |
| Quota | `src/lib/quota.ts` | atomic minute/day counters (D1 upsert RETURNING) |
| Errors | `src/lib/errors.ts` | catalog + HTTP and tool-result renderers |
| Auth UI | `src/routes/auth.ts` | GitHub OAuth callback, allowlist check, consent screen with scopes |
| Pages | `src/routes/{claim,tokens}.ts`, `public/index.html` | owner-bound claim, PAT management, how-to page |
| Recipes | `src/recipes/{nextjs,generic}.md` | single source for tool and resource |
| Upstream registry | `src/routes/upstream.ts` | D3 |
| DB | `migrations/0001_init.sql` | D1 schema below |
| Config | `wrangler.jsonc` | D1, KV, Durable Object bindings, static assets, secrets |
| Seed | `scripts/seed.mjs` | admin: create test project + key (unblocks Phase B testing) |

## 5. Data model (D1 / SQLite; ids are text UUIDs, times are unix ms)

```
allowlist        github_username pk, added_at                                    (D15)
projects         id, owner_github_id, name, slug, created_at; unique(owner_github_id, slug)
api_keys         id, project_id, prefix, hash, created_at, revoked_at
personal_tokens  id, owner_github_id, prefix, hash, created_at, last_used_at, revoked_at (D5)
claims           id (random 32B), project_id, key_id, owner_github_id, expires_at, redeemed_at (D13)
rate_windows     project_id, window_kind ('min'|'day'), window_start, count; pk(all but count) (D12)
request_logs     id, request_id, project_id, key_id, source ('app'|'atlas_test'), verify_nonce null,
                 status, error_code, latency_ms, upstream_ms, prompt_tokens, completion_tokens,
                 created_at; index(project_id, created_at desc); index(verify_nonce)
upstreams        id, url, model_id, model_revision, runtime, registered_at, active
```

No prompt or completion text is stored (PRD §8). Every read is scoped to a project the caller owns.

## 6. Request flow: `/v1/chat/completions`

```
 Bearer atl_live_… ─► hash lookup ── missing → 401 INVALID_KEY · revoked → 401 KEY_REVOKED
       ─► zod: body ≤ 64 KB, messages non-empty, max_tokens ≤ 1024, stream bool ─► 400 / 413
       ─► quota upsert-and-return (min ≤ 30, day ≤ 500) ─────────────────────────► 429 RATE_LIMITED + Retry-After
       ─► backend state (10s cache) ── none registered/offline → 503 MODEL_OFFLINE
                                    ── loading → 503 BACKEND_WARMING + retry_after
       ─► POST upstream, model forced to n-atlas-8b, timeout 120s
             ── 503 all slots busy → 429 BACKEND_BUSY + retry_after
             ── timeout → 504 INFERENCE_TIMEOUT · connect fail → 503 MODEL_OFFLINE (state flips)
             ── 200 empty choice → 502 INVALID_OUTPUT
       ─► stream/JSON back; headers x-atlas-request-id, x-atlas-model-revision
       ─► ctx.waitUntil(): request_logs row (source, verify_nonce from x-atlas-verify)
```

## 7. MCP tool contracts

Results are `{ ok: true, ... }` or `{ ok: false, error: { code, message, retryable, retry_after_s?, request_id? } }`.

- **atlas_discover** `{ recipe?: "nextjs" }` → models (id `n-atlas-8b`, weights `NCAIR1/N-ATLaS@e2944769…`,
  EN/HA/IG/YO, 8192 ctx at the model, 4096 per request at the gateway), `gateway: "ok"`,
  `backend: ready|loading|busy|offline` (live), test-window schedule, limits, attribution, licence cap,
  recipe text when asked.
- **atlas_bind_project** `{ name, action?: "bind"|"rotate_key"|"revoke_key" }` → idempotent on (owner, slug);
  returns `{ project_id, env_var: "ATLAS_ONE_API_KEY", claim_url, expires_at, placement }` where placement
  tells the agent: ask the developer to open the link and paste into `.env.local`; never commit; server-side only.
- **atlas_test** `{ project, prompt?, language? }` → one bounded inference through `lib/inference.ts`
  (max_tokens 64): request_id, model, revision, latency, excerpt, validation; progress notifications during
  warm-up from observed signals; `BACKEND_WARMING` if not ready within 45s.
  `{ project, mode: "app_nonce" }` → returns a single-use nonce (10 min).
  `{ project, verify_nonce }` → checks a `source='app'` 200 row carrying that nonce; no model call.
- **atlas_inspect** `{ project, window_minutes? = 60 }` → counts by status, p50/p95 latency, last 10 errors
  (request_id, code, retryable), auth failures, quota usage, backend state.

## 8. Tests (coverage plan)

Framework: Vitest with `@cloudflare/vitest-pool-workers` (tests run inside workerd with real local
D1, KV and Durable Objects). Upstream: test-only fake server (ok / 503 loading /
503 busy / 500 / hang / empty). Live E2E scripts only run when `ATLAS_UPSTREAM_URL` is set.

```
CODE PATHS                                              USER FLOWS
[+] lib/credentials.ts                                  [+] Agent integrates N-ATLaS (PRD Test 2)
  ├── generate/hash/verify key + PAT       [planned ★★★]  ├── [→E2E] connect → discover → bind → claim
  └── timing-safe mismatch, revoked        [planned ★★★]  │         → edit route → test → nonce verify
[+] lib/quota.ts                                          └── [manual] 4-client matrix (D8)
  ├── under / at / over limit, day rollover [planned ★★★] [+] Failure integrity (PRD Test 4)
  └── concurrent burst of 50 → exactly 30   [planned ★★★]  ├── [→E2E] backend off → MODEL_OFFLINE, no success
[+] lib/backend.ts                                        └── [→E2E] loading → BACKEND_WARMING + progress
  ├── ready/loading/offline/busy mapping    [planned ★★★] [+] Revocation (PRD Test 5)
  └── cache hit, stale, flip-on-failure     [planned ★★★]  └── [→E2E] revoke key A → 401; key B unaffected
[+] lib/inference.ts (shared core)                        [+] Claim link (D13)
  ├── every error in section 6 table        [planned ★★★]  ├── owner redeems once → key shown
  ├── stream passthrough + abort            [planned ★★ ]  ├── other user → 403 · expired → 410
  └── log row incl. nonce, no prompt text   [planned ★★★]  └── second redeem → 410
[+] /v1 routes                                            [+] Upstream register (D3)
  └── OpenAI SDK client against gateway     [planned ★★★]  ├── bad secret → 401 · http/non-allowlisted → 400
[+] MCP server + 4 tools                                  └── unhealthy → stays inactive
  ├── [→E2E] SDK client: PRM discovery, DCR, token,       [+] Allowlist (D15): non-listed GitHub user → denied
  │          list/call tools, PAT path   (D8)
  └── tool error shapes, cross-project denial [planned ★★★]
LLM: [→EVAL] recipe produces a working route on a fresh Next.js app (Test 2/6, scored by request_id proof)

PLANNED COVERAGE: all code paths above have a planned test; 0 gaps.
```

## 9. Implementation order (D10: thin slice first)

1. **B** migration + credentials + errors + quota + backend + inference core + `/v1/*` + seed script +
   upstream register (and Kaggle script calls it on READY, 4 slots x 4k, warm-up request before READY).
2. **C** `/mcp` with PAT auth + atlas_discover + atlas_test (incl. nonce) + Next.js recipe.
3. **Run PRD Test 6 early**: sample Next.js app, conventional route vs agent route; record times.
4. **D** OAuth Connect (workers-oauth-provider + GitHub) + consent with scopes + allowlist +
   atlas_bind_project with approval (D16) + owner-bound claim page.
5. **E** atlas_inspect, failure drills (Tests 4, 5), conformance E2E, 4-client matrix, beta windows,
   how-to page (static assets on the same Worker).

## 10. Failure modes

| Codepath | Realistic failure | Test | Handled | User sees |
|---|---|---|---|---|
| Upstream call | Kaggle session ends mid-request | yes | yes, state flips | MODEL_OFFLINE + request_id |
| Upstream call | all 4 slots busy | yes | yes | BACKEND_BUSY, retry_after |
| Quota | burst from a loop in the dev's app | yes | yes, atomic | 429 RATE_LIMITED + Retry-After |
| Log write | D1 hiccup in `ctx.waitUntil()` | yes | yes, swallowed + console error | nothing (quota unaffected) |
| Register | tunnel URL registered but unhealthy | yes | yes, stays inactive | previous upstream stays live or MODEL_OFFLINE |
| OAuth | client lacks OAuth / headless | conformance E2E | yes, PAT path | install doc for PAT |
| Claim | link pasted in public chat | yes | yes, owner-bound | 403 for others |
| atlas_test | warm-up exceeds client tool timeout | yes | yes, 45s cap | BACKEND_WARMING, retry guidance |

No critical gaps (every row has a test, handling, and a visible outcome).

## 11. NOT in scope

- Always-on hosted GPU: free Kaggle windows instead (D14); ask NCAIR/NAIC for compute.
- Frameworks beyond Next.js App Router: PRD §11 says one framework done well.
- Speech, fine-tuning, tool-calling claims: untested on N-ATLaS (PRD §8).
- Dashboards/analytics UI: `atlas_inspect` covers diagnostics for agents.
- npm CLI for `env pull`: rejected in D2 (extra artifact to publish).
- Developer-owned upstream endpoints: the registry is admin-only for now.
- Modal deployment: `inference/modal_serve.py` kept, untested, needs a card.
- Stable tunnel URL via a named Cloudflare Tunnel: needs a domain on Cloudflare; D3 covers it for now.
- Separate hosted front end (e.g. Vercel) with account linking: later, as a client of the Worker APIs.

## 12. What already exists

- `inference/kaggle_serve.py`: serving works. Extend it (register call, 4 slots, warm-up request); don't rebuild.
- `scripts/smoke.mjs`: its observed-signal warm-up phases become the logic in `lib/backend.ts` and atlas_test progress.
- `inference/modal_serve.py`: kept as an alternative upstream; no changes.
- No application code yet: greenfield for everything in section 4.

## 13. Parallelization

| Step | Modules | Depends on |
|---|---|---|
| Schema + credentials + quota + errors | `migrations/`, `src/lib/` | — |
| Kaggle register + slots + warm-up | `inference/` | register endpoint contract |
| Gateway + inference core | `src/lib/`, `src/routes/v1.ts` | schema |
| MCP + tools + recipes | `src/mcp.ts`, `src/tools/`, `src/recipes/` | inference core |
| OAuth + pages + allowlist | `src/index.ts`, `src/routes/auth.ts`, `src/routes/claim.ts` | schema |

Lane A: schema → gateway → MCP (sequential, shared `src/lib/`). Lane B: Kaggle script (independent once
the register contract is fixed). Lane C: OAuth pages after schema. Run A and B together; C after A's
schema lands.

## 14. Implementation tasks

- [ ] **T1 (P1, human ~1d / CC ~30min)** schema, credentials, errors, quota (atomic), seed script. Verify: `npx vitest run`
- [ ] **T2 (P1, human ~1d / CC ~30min)** backend state + inference core + `/v1/chat/completions` + `/v1/models`. Verify: OpenAI SDK test + `node scripts/smoke.mjs` via gateway
- [ ] **T3 (P1, human ~3h / CC ~20min)** upstream register endpoint + Kaggle script registers, 4 slots x 4k, warm-up before READY
- [ ] **T4 (P1, human ~1d / CC ~40min)** `/mcp` with PAT auth, atlas_discover (+recipe), atlas_test (+nonce). Verify: SDK-client E2E
- [ ] **T5 (P1, human ~4h / CC ~30min)** Next.js recipe + sample app; run PRD Test 6 and record numbers in `atlas-one.log`
- [ ] **T6 (P1, human ~1.5d / CC ~1h)** OAuth Connect (workers-oauth-provider + GitHub), scoped consent, allowlist, atlas_bind_project with approval, owner-bound claim page
- [ ] **T7 (P2, human ~4h / CC ~25min)** atlas_inspect + failure drills (Tests 4, 5)
- [ ] **T8 (P2, human ~1d / CC ~45min)** conformance E2E in CI + manual 4-client matrix + install snippets
- [ ] **T9 (P2, human ~4h / CC ~30min)** how-to page (Worker static assets) with live availability, test windows, per-client install snippets

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found → resolved | 8 findings, 7 decided (D10-D15), 1 folded into T3 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 9 issues + D16-D18 follow-ups, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Codex and the review agreed on scope; Codex added sequencing, verification, quota-race, claim-link and capacity findings, all accepted.
- **VERDICT:** ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
