# N-ATLaS integration evidence

Every result below comes from a real run, with its request id and timing. The running record with
timestamps is [`atlas-one.log`](../atlas-one.log). Nothing in Atlas One generates text except N-ATLaS.

## 1. What is served

| Item | Value |
|---|---|
| Model | `NCAIR1/N-ATLaS` (Llama-3 8B fine-tune; English, Hausa, Igbo, Yoruba) |
| Revision | `e294476928aca9030e924ca27bb8e085e8581273` (pinned in `inference/kaggle_serve.py` and checked at registration) |
| Precision | F16 GGUF converted from the original BF16 safetensors with llama.cpp's converter; no quantisation |
| Runtime | llama.cpp release `b11552` (prebuilt CUDA 12.8), 2x NVIDIA T4, 4 parallel slots x 4096 tokens, model's own chat template (`--jinja`) |
| Served name | `n-atlas-8b`; the gateway rejects any other model name |
| Generation settings | From the N-ATLaS model card, applied server-side: repetition penalty 1.12, default temperature 0.1, current date in the chat template |

How to check it yourself:
1. Read `inference/kaggle_serve.py`: the only weights it downloads are `NCAIR1/N-ATLaS` at the pinned revision.
2. Read `src/lib/inference.ts`: the only model call goes to the registered N-ATLaS upstream; there is no other provider, client library or fallback in `package.json` or the code.
3. Every response carries `x-atlas-weights: NCAIR1/N-ATLaS@e294476…` and `x-atlas-runtime`.
4. `src/routes/upstream.ts`: a backend can only register if it serves `n-atlas-8b` and holds the upstream key.

## 2. Phase A: genuine inference at the model server (2026-10-11)

| Check | Result |
|---|---|
| First request after load | `chatcmpl-khKUf9yqPSkt94Cke71I8NkiI3PUSpJ8`, 18.8 s (CUDA warm-up; now absorbed before READY) |
| Hausa, warm: "Menene babban birnin Najeriya?" | "Babban birnin Najeriya Abuja ne." in 1.5 s; 16.7 tokens/s generation, 292 tokens/s prompt |
| No key / wrong key at the model server | 401 / 401 |

Observation kept in the recipes: without a language system message N-ATLaS may misjudge the reply language.

## 3. Through the deployed gateway with the official OpenAI SDK (2026-10-11)

`scripts/e2e-gateway.mjs`, 5/5 passed:

| Check | Result |
|---|---|
| `GET /v1/models` | backend `ready`, weights `NCAIR1/N-ATLaS@e294476928aca9030e924ca27bb8e085e8581273` |
| Hausa chat | "Babban birnin Najeriya Abuja ne.", 1.24 s total, 962 ms in the model server, `req_b81e7e9b5c1f443aa3aae476`, headers carry weights and runtime |
| Yoruba, streamed | "Olú ìlú Nàìjíríà ni Abuja.", 19 chunks, 1.47 s |
| Wrong key | 401 `INVALID_KEY` |
| `model: "gpt-4o"` | 400 `VALIDATION_FAILED` (Atlas One serves N-ATLaS only) |

Stored per request (D1 `request_logs`): status, timings, token counts, request id. No prompt or completion text.

## 4. Honest failure (PRD Test 4)

| Situation | What Atlas One returned |
|---|---|
| Backend not running (gateway) | `503 MODEL_OFFLINE`, request id, no answer |
| Backend not running (`atlas_test` from Claude Code and Codex) | `MODEL_OFFLINE`, progress stops at "Checking the N-ATLaS backend", no output |
| Backend not running (integrated Next.js app route) | `503 {"error":"MODEL_OFFLINE","request_id":"req_ffbe2f2d36484d80be80e871"}` |
| Loading / busy / timeout / empty output (tests) | `BACKEND_WARMING` / `BACKEND_BUSY` / `INFERENCE_TIMEOUT` / `INVALID_OUTPUT` |

## 5. Agent integration, real clients

| Client | Result |
|---|---|
| Claude Code | OAuth Connect (identified via CIMD as `claude.ai`), consent with scopes, GitHub sign-in; used `atlas_discover`, `atlas_bind_project` (project + owner-confirmed key, then rotation), `atlas_test` |
| Codex CLI | OAuth Connect (CIMD `chatgpt.com/oauth/codex/client.json`, requested all scopes); `codex exec` used `atlas_discover` and `atlas_inspect` |
| Official MCP client SDK | Automated conformance in both protocol eras (2025-11-25 and 2026-07-28), live and in CI tests |

## 6. Existing-app integration (PRD Test 2)

Sample app `atlas-demo-shop` (Next.js 16.4, its own repo): baseline "Kano Fabrics" FAQ site with no AI.
Instruction: *"Add a Hausa customer-support response route powered by N-ATLaS, and test it."* The agent,
connected to Atlas One, followed the `nextjs` recipe: `lib/atlas.ts` (server-only client),
`app/api/support/route.ts` (Hausa answers grounded in shop facts, forwards `x-atlas-verify`),
an ask-in-Hausa box with "Powered by Awarri", `.env.example`. `next build` passes; the key is absent from
all browser bundles (`.next/static` scanned for the key value and variable name).

Live verification with the backend online: pending, recorded below when run.
