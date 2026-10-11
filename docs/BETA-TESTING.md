# Atlas One beta testing (NAIC 2026, PS1)

Thank you for testing. You need: a GitHub account, a coding agent with MCP support (Claude Code, Codex,
Cursor, VS Code with Copilot agent mode, Windsurf or Gemini CLI), and a small app of your own (any stack).
About 15 minutes.

## Before you start

Send the Atlas One team your **GitHub username** so you are added to the invite list. Check the model
status on https://atlas-one.collins-coordinator-worker.workers.dev (the N-ATLaS backend runs in scheduled
windows during the beta; the team will tell you when it is online).

## Steps

1. Connect your agent using the snippet for your client on the site. Approve the consent page, sign in
   with GitHub.
2. Open your app's folder in the agent and ask, in your own words, for an N-ATLaS feature, for example:
   *"Add an endpoint that answers customer questions in Yoruba using N-ATLaS through Atlas One, and verify it."*
3. When the agent gives you a link, open it, confirm, and put the key in your app's `.env.local` (or
   your stack's server-side env). Do not paste the key into the chat.
4. Let the agent finish. It should run `atlas_test` and report a `request_id`, and for the app route,
   `verified: true`.

## What to send back

| Question | Your answer |
|---|---|
| Name and GitHub username | |
| Agent and version used | |
| App stack (e.g. Next.js, Express, FastAPI) | |
| Time from connecting to a verified working feature (minutes) | |
| `request_id` from `atlas_test` and `verified: true`? | |
| Manual steps you had to do yourself | |
| Anything confusing, broken, or wrong in the N-ATLaS answers | |
| Would you use this again? (1-5) | |

Your usage is visible to the team only as metadata (counts, timings, error codes), never your prompts.
