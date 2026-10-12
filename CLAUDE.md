# Atlas One — Project Instructions

Atlas One: agent-native integration layer for N-ATLAS (remote MCP server + OpenAI-compatible inference API).
Spec: `docs/PRD.md`. How it works and decisions: `docs/ARCHITECTURE.md`. Evidence: `docs/EVIDENCE.md`.
Running session log: `atlas-one.log` (newest at the bottom).

## Standing rules (from the owner — apply to every session)

1. **Never add Claude/AI as a collaborator or contributor.** No `Co-Authored-By` trailers, no "Generated with Claude Code" lines in commits or PRs, never add any bot/AI identity as a GitHub collaborator. The owner is the sole author.
2. **Keep `atlas-one.log` current.** Append a dated entry for every meaningful decision, milestone, or blocker. It is the persistent, human-readable record of the build.
3. **Use gstack + gbrain.** gstack skills for workflow (`/office-hours`, `/plan-eng-review`, `/review`, `/qa`, `/cso`, `/ship`, `/document-release`); gbrain page `projects/atlas-one` as the cross-session memory context — update it as the session progresses.
4. **Do not overbuild.** Build only what proves the PRD's core promise (PRD §11 MVP scope). Four MCP tools, one framework (Next.js), one real backend. No dashboards, SDK catalogues, or speculative abstractions. Keep the repo lean: every file must earn its place.
5. **Distinguished-engineer bar.** Small surface, sharp contracts, structured errors, real tests, security by default (no secrets in client bundles, logs, or tool output).
6. **Never fake success.** No mocked or substituted model output presented as N-ATLAS inference (PRD §9). If the backend is down, say so.
7. **Site:** home, `/guide` (beginners) and `/docs` in `web/` (React + shadcn/ui), static assets on the same Worker. A separate hosted front end can come later as a client of the Worker APIs.
8. **Global standard.** Must work with every MCP client (Claude Code, Cursor, Codex, VS Code, ...): spec-only, no client-specific code; sign-in like Claude/Codex connectors; developer permission for sensitive actions. Logs and evidence use published standards (JSON Lines, JWT/EdDSA, JWKS).
9. **Make integration very easy**, for any stack, with permission requested when connecting or setting up.
10. **Work autonomously** (owner's request): stop only for real blockers or decisions that are the owner's.

## Current state (2026-10-12)

Live and complete for NAIC (deadline 12 Oct 2026, 23:59 WAT), v1.0: 5 tools (incl. atlas_feedback), 2 MCP prompts, output
schemas, OAuth for any MCP client (RFC 9207 flag not advertised, D25), /access (connected agents, tokens), gateway with
structured output and function calling,
wake-on-demand (Modal: ~30 s cold start, sleeps after 15 idle min; Kaggle fallback ~4 min, 40 min), public beta (`ACCESS=open`), signed
beta evidence. Owner handles: team profile, track, sharing with testers, video (`docs/VIDEO-SCRIPT.md`).
Before submitting: `npm run evidence:snapshot`, commit `evidence/`.

## Infrastructure (no secrets here)

- Worker https://atlas-one.collins-coordinator-worker.workers.dev; Cloudflare account 09a50cc4f142098ffba16b823dd31ad9 (Wrangler as miteuagape@gmail.com). Other Workers share the workers.dev subdomain (corri, webb): never rename it.
- D1 `atlas-one` 130399d4-7b16-4f28-946f-e40f90e1f6e7 (migrations 0001-0007 applied); KV `OAUTH_KV` 3dda9cfc00b0490a817ca93ed39694ac.
- Secrets: `ATLAS_UPSTREAM_KEY`, `ATLAS_ADMIN_KEY`, `SESSION_SECRET`, `GITHUB_CLIENT_SECRET`, `KAGGLE_KEY` (KGAT bearer), `HF_TOKEN`, `RECEIPT_SIGNING_KEY` (Ed25519 JWK, kid `atlas-one-2026-10`; exists only as the Worker secret).
- GitHub OAuth App "Atlas One" (id 3923042), callbacks `/auth/github/mcp` and `/auth/github/web`. Owner GitHub id 114285882 (`agapemiteu`), listed in `TEAM_GITHUB_LOGINS`.
- Compute (D27): `COMPUTE=modal` live. Modal app `atlas-one-n-atlas` (workspace miteuagape, $30/mo credit), URL
  https://miteuagape--atlas-one-n-atlas-serve.modal.run, L4 or A10G, Volume `n-atlas-weights`, secret `atlas-one`; registered
  as the active upstream (stable). Fallback: Kaggle notebook `agapemiteu/notebookf585471141` (2x T4), started by the Worker; GGUF cache in HF repo `Agapemiteu/n-atlas-gguf-cache`. Free quota 30 GPU-hours/week.
- Local, gitignored: `.env.local` (keys for the e2e scripts), `.dev.vars` (Worker local secrets incl. a dev signing key). Sample app: sibling folder `atlas-demo-shop`.

## Pitfalls already learned

- workerd `fetch` throws "Illegal invocation" if called as `obj.fetcher(...)`; tests use `strictFetch()`.
- workers.dev blocks Python `urllib`'s default User-Agent (Cloudflare 1010); set one.
- Deploy with `npm run deploy` (builds `web/`); gate on the real exit code, never through a `| grep`.
- Long Python/TS edits through bash heredocs break on quoting: write a script file, then run it.
- Headless Chrome has a 500 px minimum width: check phones with CDP device emulation (`Emulation.setDeviceMetricsOverride`).
- `evidence/**` is `-text` in `.gitattributes`: line-ending conversion would break the signed digest.
- Right after a deploy, the first requests can still hit the previous version.
