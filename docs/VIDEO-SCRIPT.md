# Demo video script (target 4 minutes, required 3-5)

Record the screen at 1080p. Keep the browser and terminal side by side. Start Kaggle 10 minutes before
recording and check the site says "N-ATLaS is online".

## 0:00-0:25 The problem
**Show:** the Atlas One home page.
**Say:** "N-ATLaS is open, but getting from access to a working integration still means a GPU, a runtime,
keys, glue code, and guessing whether the output is real. Developers now build by instructing coding
agents. Atlas One is the MCP server for N-ATLaS: it gives any agent Nigerian languages."

## 0:25-1:00 Connect once
**Show:** `claude mcp add --transport http atlas-one <url>/mcp`, then `/mcp` → Authenticate. The consent
page ("Allow Claude Code to use Atlas One?", the three permissions), GitHub, "Authentication successful".
**Say:** "Standard MCP and OAuth. The same URL works in Codex, Cursor, VS Code and others. I approve exactly
what the agent may do."

## 1:00-2:15 One instruction
**Show:** the plain Kano Fabrics site (no AI). In the agent, type:
*"Add a Hausa customer-support response route powered by N-ATLaS, and test it."*
Let viewers see `atlas_discover` (backend online, recipe), `atlas_bind_project` (a link, not a key).
Open the link, Confirm, paste the key into `.env.local`.
**Say:** "The key never passes through the AI. Sensitive actions always wait for me."
Show the agent writing `lib/atlas.ts` and `app/api/support/route.ts`.

## 2:15-3:05 Proof, not plausibility
**Show:** `atlas_test` inference result (request id, weights revision, latency, Hausa output), then the
nonce flow: the agent calls the route with `x-atlas-verify`, then `verify_app` → `verified: true`.
Ask a Hausa question in the app's box and show the answer with "Powered by Awarri".
**Say:** "Every answer carries the exact N-ATLaS revision and a request id. Atlas One proves this route
reached genuine N-ATLaS."

## 3:05-3:35 Honest failure
**Show:** stop the Kaggle cell. Run `atlas_test` again: `MODEL_OFFLINE`, no answer. The app route returns
503 `MODEL_OFFLINE` with a request id. `atlas_inspect` shows the error, marked retryable.
**Say:** "When the model is down, Atlas One says so. It never fakes N-ATLaS."

## 3:35-4:00 Close
**Show:** the README's tool table and the beta-tester results.
**Say:** "Any agent, any stack, genuine N-ATLaS, verified. Atlas One: give your agent Nigerian languages."
