# Atlas One: session handoff

Last updated: 2026-10-11 (end of session 1). Read this first when resuming, then `atlas-one.log` (newest at the bottom).

## Owner's standing instructions (apply to every session)

1. **Never add Claude/AI as a collaborator or contributor.** No `Co-Authored-By` trailers, no "Generated with Claude Code" in commits or PRs, no bot collaborators. Commits are authored by Agape Miteu.
2. **Keep `atlas-one.log` current**: append a dated entry for every decision, milestone, blocker and fix.
3. **Use gstack (Garry Tan) skills** for workflow and **gbrain** page `projects/atlas-one` as cross-session memory; keep both updated.
4. **Do not overbuild**: MVP scope only (PRD §11).
5. **Distinguished-engineer quality**: small surface, sharp contracts, structured errors, real tests, secure by default.
6. **Never fake success**: no simulated N-ATLaS output; report outages honestly.
7. **Global standard**: works with every MCP client (Claude Code, Cursor, Codex, VS Code, ...), spec-only, no client-specific code. Sign-in behaves like Claude/Codex connectors; sensitive actions need the developer's permission.
8. **Make it very easy** for developers to integrate anything, with permission requested when connecting or setting up.
9. **Work autonomously** (owner asked for auto mode): only stop for real blockers or decisions that are the owner's.
10. **After the build**: a simple one-page how-to site (served by the Worker); a richer hosted front end (e.g. Vercel) with account linking can come later.
11. Cold starts must never look idle: progress from observed signals only.

## Where we are

**NAIC deadline: 12 Oct 2026, 23:59 WAT.** The owner handles the team profile, track/endorsement,
beta testers (add their GitHub logins to `ALLOWED_GITHUB_LOGINS` or the `allowlist` table) and recording
the video.

| Item | State (2026-10-11 evening) |
|---|---|
| Phase A, T1-T4, T6, T7 (all 4 MCP tools), T9 (site + playground) | Done, deployed. Home + /docs are React + shadcn/ui in `web/` (Worker static assets); 118 Worker + 5 web tests |
| Real clients | Claude Code and Codex connected over OAuth (both identify via CIMD) and used the tools; Cursor/VS Code/Windsurf/Gemini CLI documented |
| T5 sample app `atlas-demo-shop` (sibling folder, own repo) | Done: live `verify_app` = true (req_714d166c…); evidence in docs/NATLAS-INTEGRATION.md |
| Backend | **Wake-on-demand live**: requests wake Kaggle (T4 x2) via API, live stages on `/` and `/api/status`, ~4 min cold start, sleeps after 20 idle min; GGUF cache in `Agapemiteu/n-atlas-gguf-cache`. Nobody starts Kaggle by hand any more |
| Docs | README, TECHNICAL, NATLAS-INTEGRATION (live T5 section pending), BETA-TESTING, VIDEO-SCRIPT |
| Security | Auth-route rate limit; open redirect, CSRF, XSS, SSRF, owner isolation, quota races covered by tests |
| Post-beta | List in the official MCP Registry, then client directories (not GitHub Marketplace) |

## Resume here (exact next steps)

1. (Done) Live proof, e2e suites and wake-on-demand all passed on 2026-10-11. Remaining: beta testers' runs
   (they just use Atlas One; the model wakes itself), Test 6 conventional timing from testers, video.
   Old note, kept for reference: when the owner said Kaggle was ready: `atlas_test` (inference) on `hausa-support-demo`; start the demo
   app (`npx next start -p 3100` in atlas-demo-shop); `issue_app_nonce`; POST `/api/support` with
   `x-atlas-verify`; `verify_app`. Run `scripts/e2e-gateway.mjs` and `scripts/e2e-mcp.mjs`. Confirm
   llama.cpp accepted `repeat_penalty` and `chat_template_kwargs`. Fill section 6 of
   `docs/NATLAS-INTEGRATION.md` with real ids and timings; record PRD Test 6 numbers.
2. Collect beta-tester evidence (`atlas_inspect` or D1 `request_logs` per project).
3. Final pass: README links and the submission checklist.

## Infrastructure (no secrets here)

- Live Worker: https://atlas-one.collins-coordinator-worker.workers.dev (Cloudflare account 09a50cc4f142098ffba16b823dd31ad9, Wrangler logged in as miteuagape@gmail.com)
- D1 `atlas-one` = 130399d4-7b16-4f28-946f-e40f90e1f6e7 (migrations 0001, 0002 applied remote + local)
- KV `OAUTH_KV` = 3dda9cfc00b0490a817ca93ed39694ac
- Worker secrets: `ATLAS_UPSTREAM_KEY`, `ATLAS_ADMIN_KEY`, `SESSION_SECRET`, `GITHUB_CLIENT_SECRET`, `KAGGLE_KEY` (KGAT bearer token), `HF_TOKEN` (set). Vars in `wrangler.jsonc`: `PUBLIC_ORIGIN`, `UPSTREAM_HOSTS`, `GITHUB_CLIENT_ID`, `ALLOWED_GITHUB_LOGINS=agapemiteu`.
- GitHub OAuth App "Atlas One" (id 3923042), redirect URIs `/auth/github/mcp` and `/auth/github/web`, exact match.
- Owner identity in Atlas One = GitHub numeric id `114285882` (login `agapemiteu`). Seed project `e2e-gateway` belongs to it.
- Local secrets (gitignored): `.env.local` (HF token, upstream/admin keys, seed project key, PAT, GitHub app values), `.dev.vars` (Worker local secrets; its presence stops Wrangler loading `.env.local`).
- Model backend: Kaggle notebook `agapemiteu/notebookf585471141`, 2x T4, Internet on, secrets `HF_TOKEN`, `ATLAS_UPSTREAM_KEY`, `ATLAS_ADMIN_KEY`. Stop the session after use to save the free 30 GPU-hours/week.

## Key files

- `docs/PRD.md` (spec), `docs/ARCHITECTURE.md` (locked plan, decisions D1-D18 + implementation notes), `atlas-one.log` (history)
- `src/index.ts` (OAuthProvider + routing), `src/mcp.ts` (MCP tools), `src/tools/*`, `src/lib/*`, `src/web/*`, `src/recipes/*.md`
- `inference/kaggle_serve.py` (model server), `scripts/seed.ts`, `scripts/e2e-gateway.mjs`, `scripts/e2e-mcp.mjs`, `scripts/smoke.mjs`

## Pitfalls already learned

- workerd `fetch` throws "Illegal invocation" if called as `obj.fetcher(...)`; call it as a plain function. Tests use `strictFetch()` to catch this.
- workers.dev blocks Python `urllib`'s default User-Agent (Cloudflare 1010); set one.
- The MCP handler rejects requests without a Host header; tests must send it.
- Writing regexes/backslashes through Python heredocs mangles them; use the Edit tool for such code.
- Deploy with `npm run deploy` (builds `web/` first); `wrangler deploy` alone ships a stale or missing `web/dist`.
- Headless Chrome enforces a 500px minimum window: check phone layouts with CDP device emulation, not `--window-size`.
- Right after `wrangler deploy`, the first requests can still hit the previous version.
- Don't upgrade shared global Python packages (broke `transformers` once); don't share `/tmp` between bash and Python on this machine.
