---
name: atlas-one
description: Add genuine N-ATLaS (Nigerian multilingual AI: English, Hausa, Igbo, Yoruba) to the current app through the Atlas One MCP server, test it on the real model and verify it. Use when asked to build anything with N-ATLaS or Atlas One.
---

# Build with N-ATLaS through Atlas One

Go straight to the result. Everything you need comes from the Atlas One tools: do not browse the web, read the
Atlas One site or search config files. Do not stop between steps unless the developer must act.

If the `atlas-one` MCP tools are missing, the developer adds this remote MCP server to their agent once and signs in:
`https://atlas-one.collins-coordinator-worker.workers.dev/mcp` (the command or config for Claude Code, Codex, Cursor,
VS Code, Windsurf, Gemini CLI and others is at https://atlas-one.collins-coordinator-worker.workers.dev/docs), then
starts a new session.

1. `atlas_discover`: live state; it also wakes N-ATLaS if asleep (about 30 seconds).
2. `atlas_bind_project` with the app's name: open `claim_url` in the developer's browser for them and print it on its
   own line; tell them the full path of the gitignored `.env.local`. Write the server-side code from the returned
   recipe while they confirm the key.
3. When they say done, restart the app, then `atlas_test` (inference): proves genuine N-ATLaS and returns `app_check`.
4. Call the new route once with `app_check`'s header, then `atlas_test` (`verify_app`) with its nonce. Report success only
   with `verified: true`, and offer to save the receipt as `ATLAS_VERIFICATION.jwt`.

Rules: the key stays server-side and never enters the chat; set the reply language in the system message; show
"Powered by Awarri" next to N-ATLaS output; never invent or simulate N-ATLaS output; on any error, say so.
