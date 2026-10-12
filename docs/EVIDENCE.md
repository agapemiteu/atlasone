# Evidence

Everything a judge needs to check, without trusting the Atlas One team: (1) the model is genuine N-ATLaS,
and (2) independent developers used Atlas One and their apps reached it.

## 1. Genuine N-ATLaS

| Item | Value |
|---|---|
| Model | `NCAIR1/N-ATLaS` (Llama-3 8B fine-tune; English, Hausa, Igbo, Yoruba) |
| Revision | `e294476928aca9030e924ca27bb8e085e8581273`, pinned in `inference/kaggle_serve.py` and checked at registration |
| Precision | F16 GGUF converted from the original BF16 weights with llama.cpp's converter; no quantisation |
| Runtime | llama.cpp `b11552` (CUDA), 4 slots x 4096 tokens, the model's own chat template. GPU: Modal, one L4 or A10G (24 GB), since 12 Oct 2026; before that Kaggle, 2x T4. Same release and weights on both |
| Settings | From the N-ATLaS model card, applied server-side: repetition penalty 1.12, temperature 0.1, current date |

Check it in the code: the only weights `inference/kaggle_serve.py` downloads are the pinned revision; the only
model call in `src/lib/inference.ts` goes to the registered N-ATLaS server; `package.json` has no other model
provider; a server can only register if it serves `n-atlas-8b`. Every response carries
`x-atlas-weights: NCAIR1/N-ATLaS@e294476…`.

Live results (11-12 Oct 2026, request ids from the logs):

| Run | Result |
|---|---|
| Gateway, official OpenAI SDK | 5/5. Hausa "Babban birnin Najeriya Abuja ne." 1.24 s (`req_b81e7e9b5c1f443aa3aae476`); Yoruba streamed 1.47 s; wrong key → `INVALID_KEY`; `model: "gpt-4o"` → `VALIDATION_FAILED` |
| Claude Code over OAuth, existing Next.js app (PRD Test 2) | Agent added a Hausa support route in about 2 minutes; `atlas_test` `req_91d6bec6fdbd44acaa01237a` 1,110 ms; app route `req_714d166c70154f5ba50b47d5`; `verify_app` **true**, same id. Key absent from all browser bundles |
| Codex | Igbo "Isi obodo Naịjirịa bụ Abuja." `req_3db406b183a0405a868238e0`, 1,364 ms (after Codex's own approval prompt for a non-read-only tool) |
| Official MCP client, both protocol eras | All passed, including progress notifications and nonce verification |
| Wake-on-demand | Modal (12 Oct): container stopped, then online in 24 s; 191 Hausa tokens at 27.6 tokens/s (`req_5eba2c98f8814bc0acddc710`), so on the GPU. Kaggle (11 Oct): about 3-4 minutes, then `req_5e46287db16d4cfe8e22dce2` in 1,099 ms |
| Signed receipt | `verify_app` on `req_c50b86bc65444d9d8ce4b979` issued a receipt that verifies; a tampered copy fails |
| Structured output | Hausa review to schema-valid JSON, `req_e77d8a9a9b4647799d092fb5`; medicine label to dosing JSON plus Hausa, `req_a6cfb6957a9c428d8605d95b` (9.1 s) |
| Function calling | The model called `track_order({"order_id": "KF-1042"})` (`req_b4714f8393c04836aa6dbaa3`), then answered in Hausa from the result (`req_c20473f1dfdc4683b860865c`) |

Honest failure (PRD Test 4): backend down → `503 MODEL_OFFLINE` with a request id from the API, the agent
tools and an integrated app route; loading, busy, timeout and empty output map to `BACKEND_WARMING`,
`BACKEND_BUSY`, `INFERENCE_TIMEOUT`, `INVALID_OUTPUT`. Never a substitute answer.

Quality, reported as observed: once the model said "3 to 5 working *hours*" where the shop facts say days, and
one Yoruba answer was garbled, consistent with N-ATLaS's own evaluation rating Yoruba lowest. Atlas One
reports output as-is.

## 2. Independent testers

### Quick check (2 minutes, Node 22.18 or newer, nothing to install)

```bash
git clone https://github.com/agapemiteu/atlasone && cd atlasone
node scripts/verify-evidence.mjs                         # the signed snapshot committed in evidence/
node scripts/verify-evidence.mjs <tester's receipt>      # a file, raw JWT, or https URL to ATLAS_VERIFICATION.jwt
```

Every line prints `PASS` or `FAIL`; the script exits non-zero on any failure. `--offline` skips the live
cross-checks.

### What each check proves

| Evidence | Standard | How to check it |
|---|---|---|
| **Who tested** | GitHub OAuth sign-in | Each tester row links their GitHub profile. Team members are labelled and excluded from the summary |
| **What they did** | Append-only event log, JSON Lines, ISO 8601 UTC, schema `atlas-one.evidence/v1` | On [`/evidence`](https://atlas-one.collins-coordinator-worker.workers.dev/evidence), "Activity by tester" shows each tester's builds (one per project) with their verified request ids, their feedback, and every step in order. Machine-readable: [`/evidence/events.jsonl`](https://atlas-one.collins-coordinator-worker.workers.dev/evidence/events.jsonl), or one tester's trace with `?tester=t_…` |
| **The repo copy is untouched** | SHA-256 digest inside a JWT (RFC 7519) signed with EdDSA/Ed25519 (RFC 8037) | `evidence/snapshot.jwt` signs the digest of `evidence/events.jsonl` and the summary. Editing either breaks verification |
| **Signed by Atlas One** | JWK Set (RFC 7517) | `evidence/jwks.json` must equal [`/.well-known/jwks.json`](https://atlas-one.collins-coordinator-worker.workers.dev/.well-known/jwks.json); the script checks this |
| **The log only grows** | Append-only cross-check | Every committed event must still be in the live log |
| **A tester's app really reached N-ATLaS** | Signed verification receipt (JWT, `typ: atlas-receipt+jwt`) | Issued only when `verify_app` matches a nonce-carrying request from the tester's own route. Testers commit it to **their own repo** as `ATLAS_VERIFICATION.jwt` (repo link on `/evidence`). The script verifies the signature and finds the same request id and session in the live log |

Any standard JWT library can verify the tokens too: algorithm `EdDSA`, curve `Ed25519`, key from the JWK Set above.

### Event schema (`atlas-one.evidence/v1`)

One JSON object per line, ordered by time.

| Field | Meaning |
|---|---|
| `schema` | `atlas-one.evidence/v1` |
| `ts` | Event time, ISO 8601 UTC |
| `seq` | Monotonic id of the event in the database (`null` for feedback) |
| `tester` | Stable pseudonymous id (`t_` + 12 hex, an HMAC of the GitHub id) |
| `login` | GitHub username, or `null` if the tester chose to be anonymous |
| `team` | `true` for Atlas One team members |
| `event` | `connected` (OAuth sign-in), `tool_call`, or `feedback` |
| `session` | One id per agent connection (`conn_…`) or personal token (`pat_…`) |
| `client` | MCP client name from the consent screen, e.g. "Claude Code" |
| `tool`, `action`, `project` | Which Atlas One tool ran, with which action, on which of the tester's projects |
| `outcome`, `error_code` | `ok` or `error`, with the structured error code |
| `request_id` | The `x-atlas-request-id` of the real N-ATLaS response the call produced or verified |
| `verified` | For `verify_app`: whether the tester's app route reached N-ATLaS |
| `duration_ms` | Tool call duration |
| `agent`, `stack`, `minutes`, `manual_steps`, `issues`, `rating` | Feedback answers: one per tester, latest wins |
| `source` | Where feedback was given: `agent` (asked in the session via `atlas_feedback`) or `web` (the `/feedback` form) |

### What is not recorded

Prompts, model outputs, source code and keys are never recorded; a test enforces this
(`test/evidence.test.ts`). Testers are told what is recorded on the consent screen before they sign in.

### Limits, stated plainly

The Atlas One team runs the service that writes the log and holds the signing key. The signatures prove the
committed copy matches what the service published, and the append-only check proves nothing was removed
since. They cannot prove the service itself was honest. The independent anchors are outside our control:
testers' own GitHub accounts and their own repos containing the receipts, which judges can open and, if they
wish, contact directly.

### For the Atlas One team

Before submitting, refresh the committed snapshot: `npm run evidence:snapshot`, then commit `evidence/`.
Testers follow the beginner's guide at https://atlas-one.collins-coordinator-worker.workers.dev/guide.
