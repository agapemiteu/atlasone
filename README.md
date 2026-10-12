# Atlas One

**Connect the world to N-ATLaS.** Atlas One is the MCP server and gateway to N-ATLaS, Nigeria's multilingual
model. Connect any coding agent, ask for a Hausa, Igbo or Yoruba feature, and it ships tested and verified on
the real model.

**Try it:** https://atlas-one.collins-coordinator-worker.workers.dev ·
[Beginner's guide](https://atlas-one.collins-coordinator-worker.workers.dev/guide) ·
[Docs](https://atlas-one.collins-coordinator-worker.workers.dev/docs) ·
[Live evidence](https://atlas-one.collins-coordinator-worker.workers.dev/evidence)

NAIC 2026, PS1 Developer Infrastructure: *"Build the tools that make N-ATLAS easy to build with."*

## How it works

1. **Connect once:** any MCP client (Claude Code, Codex, Cursor, VS Code, Windsurf, Gemini CLI) to
   `https://atlas-one.collins-coordinator-worker.workers.dev/mcp` and sign in with GitHub.
2. **Ask** your agent for a feature in plain words.
3. **Verified:** the agent integrates a server-side route, runs genuine N-ATLaS, and proves your route
   reached it (`verified: true`, plus a signed receipt).

| Tool | Does |
|---|---|
| `atlas_discover` | Live model state, model facts, limits, licence, your projects, integration recipes |
| `atlas_bind_project` | Creates a project; keys only through a link the developer confirms in the browser |
| `atlas_test` | Genuine inference with provenance; nonce-based proof that a specific app route reached N-ATLaS |
| `atlas_inspect` | Requests, latency, errors with request ids, quota, keys |
| `atlas_feedback` | The developer's own rating and comments, asked once at a natural pause (after verification or a long session) |

Apps call a standard Chat Completions API, so any language or SDK works, with the full surface the model
supports: streaming, structured output (`response_format` JSON Schema, grammar-enforced) and function calling
(`tools`), each checked on the live model. N-ATLaS runs on free Kaggle
GPUs and wakes itself on the first request (about 4 minutes, progress shown live); outages return a clear
error, never a substitute answer.

## Verify it yourself

```bash
node scripts/verify-evidence.mjs     # signed tester evidence (Node 22.18+, nothing to install)
```

[docs/EVIDENCE.md](docs/EVIDENCE.md) covers both claims: the model is genuine N-ATLaS (pinned revision,
request ids, timings) and independent testers used it (signed, append-only log).

## Repository

| Path | Contents |
|---|---|
| `src/` | The Cloudflare Worker: OAuth and MCP (`index.ts`, `mcp.ts`, `tools/`), inference core and services (`lib/`), API (`routes/`), server-rendered pages (`web/`), recipes |
| `web/` | Home, docs and guide pages (React, shadcn/ui), served by the same Worker |
| `inference/kaggle_serve.py` | The N-ATLaS server (llama.cpp on 2x T4); Atlas One starts it on demand |
| `migrations/`, `test/` | Database schema; tests run inside the Workers runtime |
| `scripts/` | Live end-to-end checks, seed, evidence snapshot and verifier |
| `evidence/` | Signed snapshot of the tester log |
| `docs/` | [How it works](docs/ARCHITECTURE.md), [evidence](docs/EVIDENCE.md), [PRD](docs/PRD.md), video script |

```bash
npm install && npm install --prefix web
npm test              # Worker tests in workerd + web tests
npm run deploy        # builds web/, deploys the Worker
```

## Licence and attribution

N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and
powered by Awarri Technologies. Its terms allow up to 1,000 active end users per 30 days; commercial or
large-scale use needs a licence from Awarri. Apps show "Powered by Awarri".
