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

| Task | State |
|---|---|
| Phase A: genuine inference (Kaggle) | Done. Warm Hausa answer 1.5s, 16.7 tok/s |
| T1 schema, credentials, errors, quotas, seed | Done |
| T2 OpenAI-compatible gateway `/v1` | Done, live E2E 5/5 with the OpenAI SDK |
| T3 upstream self-registration | Done (Kaggle script sends a User-Agent now) |
| T4 MCP server (`atlas_discover`, `atlas_test`) | Done, live in both protocol eras |
| T6 OAuth Connect, consent, allowlist, `atlas_bind_project`, claim + token pages | Done and deployed; **awaiting first real sign-in** |
| T5 sample Next.js app + PRD Test 6 (needs Kaggle) | Next after sign-in works |
| T7 `atlas_inspect` + failure drills (Tests 4, 5) | Todo |
| T8 conformance in CI + 4-client manual matrix + install snippets | Todo |
| T9 how-to page (Worker static assets) | Todo |
| Post-beta | List in the official MCP Registry, then client directories (not GitHub Marketplace) |

Tests: 96/96 (`npx vitest run`). Typecheck: `npx tsc --noEmit`. Latest commits on `main` at github.com/agapemiteu/atlasone.

## Resume here (exact next steps)

1. Owner restarts Claude Code in this folder (`claude --continue`), runs `/mcp` -> **atlas-one** -> **Authenticate** -> approves the Atlas One consent page -> authorizes on GitHub.
   - Atlas One was added with `claude mcp add --transport http --scope local atlas-one https://atlas-one.collins-coordinator-worker.workers.dev/mcp` (local to this project).
   - If anything fails: check `npx wrangler tail` while retrying; consent page = `/authorize`, GitHub callbacks = `/auth/github/mcp` and `/auth/github/web`.
2. Once connected, use the Atlas One tools from Claude Code: `atlas_discover`, then `atlas_bind_project` (name e.g. "Hausa Support Demo") -> owner opens the claim link -> confirms -> key shown once.
3. Ask the owner to start Kaggle (paste `inference/kaggle_serve.py` into the notebook cell; it auto-registers), then run `atlas_test` live and the full nonce flow (`node --env-file=.env.local scripts/e2e-mcp.mjs`).
4. T5: build a small sample Next.js app, integrate via the agent using the `nextjs` recipe, verify with `atlas_test` (inference, issue_app_nonce, verify_app); run PRD Test 6 (conventional vs agent route) and record numbers in the log.
5. Then T7, T8, T9 per `docs/ARCHITECTURE.md` section 14.

## Infrastructure (no secrets here)

- Live Worker: https://atlas-one.collins-coordinator-worker.workers.dev (Cloudflare account 09a50cc4f142098ffba16b823dd31ad9, Wrangler logged in as miteuagape@gmail.com)
- D1 `atlas-one` = 130399d4-7b16-4f28-946f-e40f90e1f6e7 (migrations 0001, 0002 applied remote + local)
- KV `OAUTH_KV` = 3dda9cfc00b0490a817ca93ed39694ac
- Worker secrets: `ATLAS_UPSTREAM_KEY`, `ATLAS_ADMIN_KEY`, `SESSION_SECRET`, `GITHUB_CLIENT_SECRET` (set). Vars in `wrangler.jsonc`: `PUBLIC_ORIGIN`, `UPSTREAM_HOSTS`, `GITHUB_CLIENT_ID`, `ALLOWED_GITHUB_LOGINS=agapemiteu`.
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
- Right after `wrangler deploy`, the first requests can still hit the previous version.
- Don't upgrade shared global Python packages (broke `transformers` once); don't share `/tmp` between bash and Python on this machine.
