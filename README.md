# Atlas One

**The MCP server for N-ATLaS. Give your agent Nigerian languages.** Connect your coding agent once. Ask it to add a Hausa, Igbo, Yoruba or
Nigerian-English AI feature to your app. It integrates genuine N-ATLaS and proves it works.

- **Live:** https://atlas-one.collins-coordinator-worker.workers.dev (home page with live demo and model status, [/docs](https://atlas-one.collins-coordinator-worker.workers.dev/docs), playground)
- **MCP endpoint (any agent):** `https://atlas-one.collins-coordinator-worker.workers.dev/mcp`
- **App API (industry-standard, OpenAI-compatible):** `https://atlas-one.collins-coordinator-worker.workers.dev/v1`
- NAIC 2026, PS1 Developer Infrastructure: *"Build the tools that make N-ATLAS easy to build with."*

## Why

N-ATLaS is open and downloadable, but going from *access* to a working *integration* still means picking a
runtime, finding a GPU, wiring keys, writing glue code and guessing whether the output is real. Developers
increasingly build by instructing coding agents. Atlas One makes N-ATLaS something those agents can
discover, connect, integrate and verify, in any app, without an SDK.

## Use it in 60 seconds

1. **Connect your agent** (works with any MCP client; Atlas One is invite-only during the beta):

   | Client | Setup |
   |---|---|
   | Claude Code | `claude mcp add --transport http atlas-one https://atlas-one.collins-coordinator-worker.workers.dev/mcp`, then `/mcp` → Authenticate |
   | Codex | `codex mcp add atlas-one --url https://atlas-one.collins-coordinator-worker.workers.dev/mcp` (sign-in opens automatically) |
   | Cursor | `~/.cursor/mcp.json`: `{ "mcpServers": { "atlas-one": { "url": "…/mcp" } } }` |
   | VS Code | `.vscode/mcp.json`: `{ "servers": { "atlas-one": { "type": "http", "url": "…/mcp" } } }` |
   | Others / CI | Streamable HTTP + OAuth 2.1 discovered automatically; headless clients use a personal token from `/tokens` |

   You see a consent page ("Allow *your agent* to use Atlas One?" with the permissions), sign in with GitHub, done.

2. **Ask:** *"Add a Hausa customer-support route to this app using N-ATLaS through Atlas One, and verify it."*

3. **Confirm the key link** your agent gives you. The key is shown once in your browser; the agent never sees it.

The agent then writes a server-side route, runs a genuine N-ATLaS request, and proves *your route* reached
N-ATLaS with a one-time verification nonce.

## What Atlas One provides

| MCP tool | What it does |
|---|---|
| `atlas_discover` | Live backend state (gateway vs model), model facts, limits, licence, your projects, integration recipes (`nextjs`, `generic`) |
| `atlas_bind_project` | Idempotent project binding; key creation, rotation and revocation only via an owner-confirmed browser link |
| `atlas_test` | Genuine bounded inference with provenance; `issue_app_nonce` + `verify_app` prove a specific app route reached N-ATLaS |
| `atlas_inspect` | Request counts, latency p50/p95, recent errors with request ids and retryability, quota, keys |

Apps call a standard Chat Completions API (any HTTP client, any language, Vercel AI SDK, LangChain, LiteLLM, OpenAI SDKs).
Every response carries `x-atlas-request-id`, `x-atlas-weights` (exact N-ATLaS revision) and `x-atlas-runtime`.
The N-ATLaS model-card settings (repetition penalty 1.12, low temperature, current date in the chat
template) are applied server-side, so every client gets them.

## Proof it is genuine N-ATLaS

- Serves `NCAIR1/N-ATLaS` at pinned revision `e294476928aca9030e924ca27bb8e085e8581273`, full F16 (no
  quantisation), llama.cpp `b11552`. No other model, provider or fallback exists in the code.
- Outages return `MODEL_OFFLINE` / `BACKEND_WARMING` / `BACKEND_BUSY`, never a substitute answer.
- Live results, request ids and timings: [`docs/NATLAS-INTEGRATION.md`](docs/NATLAS-INTEGRATION.md) and [`atlas-one.log`](atlas-one.log).

## Security and licence

- OAuth 2.1 + PKCE per the MCP authorization spec (Client ID Metadata Documents and Dynamic Client
  Registration), scoped consent, invite-only allowlist, per-project quotas (30/min, 500/day, atomic).
- Keys and tokens stored only as SHA-256 digests; prompts and completions are never stored.
- Sensitive actions need the developer's confirmation in the browser (owner-bound, single-use links).
- N-ATLaS terms: at most 1,000 active end users per 30 days; commercial or large-scale use needs a licence
  from Awarri; show "Powered by Awarri" and the credit line *"N-ATLaS is an initiative of the Federal
  Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies."*

## Repository

| Path | Contents |
|---|---|
| `src/index.ts` | Worker entry: OAuth provider, routing |
| `src/mcp.ts`, `src/tools/` | MCP server and the four tools |
| `src/lib/` | Inference core, backend state, credentials, quotas, errors, sessions, GitHub sign-in |
| `src/routes/` | `/v1` gateway, upstream registration |
| `web/` | Home page and docs: React + shadcn/ui (Vite), served as static assets by the Worker |
| `src/web/` | Playground, consent, claim and token pages (server-rendered) |
| `src/recipes/` | Integration recipes served to agents |
| `inference/kaggle_serve.py` | N-ATLaS server (llama.cpp on 2x T4), auto-registers with the gateway |
| `migrations/` | D1 schema |
| `test/` | 106 tests run inside the Workers runtime |
| `scripts/` | Seed, live end-to-end checks (`e2e-gateway.mjs`, `e2e-mcp.mjs`) |
| `docs/` | PRD, architecture and decisions, integration evidence, technical docs, beta testing |

## Develop

```bash
npm install
npx vitest run          # 106 tests in workerd with real local D1 + KV
npx tsc --noEmit
npx wrangler deploy     # Cloudflare Worker + D1 + KV
```

Run your own N-ATLaS backend: see [`docs/TECHNICAL.md`](docs/TECHNICAL.md#running-the-n-atlas-backend).

## Status

Beta for NAIC 2026. N-ATLaS runs on free Kaggle GPUs with **wake-on-demand**: when it is asleep, the first
agent, app or playground request makes Atlas One start it through Kaggle's API (GPU T4 x2). Callers get an
honest `BACKEND_WARMING` with a retry time while every startup stage, reported by the model server itself,
shows live on the site; it is online in about 4 minutes and sleeps again after 20 idle minutes. Nobody
starts a GPU by hand. The backend is pluggable: any OpenAI-compatible N-ATLaS server registers itself, so
moving to always-on GPU capacity needs no code changes.
