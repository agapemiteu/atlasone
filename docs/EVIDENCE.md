# Verifying Atlas One's beta evidence

This is for NAIC judges and anyone else who wants to check, without trusting the Atlas One team, that
independent developers used Atlas One and that their apps reached genuine N-ATLaS (PRD Test 3 and Test 6).

## Quick check (2 minutes, Node 22.18 or newer, nothing to install)

```bash
git clone https://github.com/agapemiteu/atlasone && cd atlasone
node scripts/verify-evidence.mjs                         # the signed snapshot committed in evidence/
node scripts/verify-evidence.mjs <tester's receipt>      # a file, raw JWT, or https URL to ATLAS_VERIFICATION.jwt
```

Every line prints `PASS` or `FAIL`; the script exits non-zero on any failure. `--offline` skips the live
cross-checks.

## What each check proves

| Evidence | Standard | How to check it |
|---|---|---|
| **Who tested** | GitHub OAuth sign-in | Each tester row links their GitHub profile. Team members are labelled and excluded from the summary |
| **What they did** | Append-only event log, JSON Lines, ISO 8601 UTC, schema `atlas-one.evidence/v1` | Live: [`/evidence/events.jsonl`](https://atlas-one.collins-coordinator-worker.workers.dev/evidence/events.jsonl), or one tester's trace with `?tester=t_…` (links on [`/evidence`](https://atlas-one.collins-coordinator-worker.workers.dev/evidence)) |
| **The repo copy is untouched** | SHA-256 digest inside a JWT (RFC 7519) signed with EdDSA/Ed25519 (RFC 8037) | `evidence/snapshot.jwt` signs the digest of `evidence/events.jsonl` and the summary. Editing either breaks verification |
| **Signed by Atlas One** | JWK Set (RFC 7517) | `evidence/jwks.json` must equal [`/.well-known/jwks.json`](https://atlas-one.collins-coordinator-worker.workers.dev/.well-known/jwks.json); the script checks this |
| **The log only grows** | Append-only cross-check | Every committed event must still be in the live log |
| **A tester's app really reached N-ATLaS** | Signed verification receipt (JWT, `typ: atlas-receipt+jwt`) | Issued only when `verify_app` matches a nonce-carrying request from the tester's own route. Testers commit it to **their own repo** as `ATLAS_VERIFICATION.jwt` (repo link on `/evidence`). The script verifies the signature and finds the same request id and session in the live log |

Any standard JWT library can verify the tokens too: algorithm `EdDSA`, curve `Ed25519`, key from the JWK Set above.

## Event schema (`atlas-one.evidence/v1`)

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
| `agent`, `stack`, `minutes`, `manual_steps`, `issues`, `rating` | Feedback questionnaire answers |

## What is not recorded

Prompts, model outputs, source code and keys are never recorded; a test enforces this
(`test/evidence.test.ts`). Testers are told what is recorded on the consent screen before they sign in.

## Limits, stated plainly

The Atlas One team runs the service that writes the log and holds the signing key. The signatures prove the
committed copy matches what the service published, and the append-only check proves nothing was removed
since. They cannot prove the service itself was honest. The independent anchors are outside our control:
testers' own GitHub accounts and their own repos containing the receipts, which judges can open and, if they
wish, contact directly.

## For the Atlas One team

Before submitting, refresh the committed snapshot: `npm run evidence:snapshot`, then commit `evidence/`.
