# Atlas One — Project Instructions

Atlas One: agent-native integration layer for N-ATLAS (remote MCP server + OpenAI-compatible inference API).
Full spec: `docs/PRD.md`. Locked plan: `docs/ARCHITECTURE.md`. Running session log: `atlas-one.log`.
**Resuming? Read `docs/HANDOFF.md` first**: current state, exact next steps, infrastructure ids, pitfalls.

## Standing rules (from the owner — apply to every session)

1. **Never add Claude/AI as a collaborator or contributor.** No `Co-Authored-By` trailers, no "Generated with Claude Code" lines in commits or PRs, never add any bot/AI identity as a GitHub collaborator. The owner is the sole author.
2. **Keep `atlas-one.log` current.** Append a dated entry for every meaningful decision, milestone, or blocker. It is the persistent, human-readable record of the build.
3. **Use gstack + gbrain.** gstack skills for workflow (`/office-hours`, `/plan-eng-review`, `/review`, `/qa`, `/cso`, `/ship`, `/document-release`); gbrain page `projects/atlas-one` as the cross-session memory context — update it as the session progresses.
4. **Do not overbuild.** Build only what proves the PRD's core promise (PRD §11 MVP scope). Four MCP tools, one framework (Next.js), one real backend. No dashboards, SDK catalogues, or speculative abstractions.
5. **Distinguished-engineer bar.** Small surface, sharp contracts, structured errors, real tests, security by default (no secrets in client bundles, logs, or tool output).
6. **Never fake success.** No mocked or substituted model output presented as N-ATLAS inference (PRD §9). If the backend is down, say so.
7. **After the build:** ship a simple one-page "how to use Atlas One" site (static assets on the same Cloudflare Worker) that a developer understands in one read. A richer hosted front end (e.g. Vercel) with account linking can come later as a client of the Worker APIs.
8. **Global standard.** Must work with every MCP client (Claude Code, Cursor, Codex, VS Code, ...): spec-only, no client-specific code; sign-in like Claude/Codex connectors; developer permission for sensitive actions.
9. **Make integration very easy**, for any stack, with permission requested when connecting or setting up.
10. **Work autonomously** (owner's request): stop only for real blockers or decisions that are the owner's.
