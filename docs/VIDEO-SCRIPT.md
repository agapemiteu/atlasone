# Demo video script (target 4 minutes, required 3-5)

Record the screen at 1080p, browser and terminal side by side. Five minutes before recording, ask the agent to
run `atlas_discover` (it wakes N-ATLaS) and check the site says "N-ATLaS online".

## 0:00-0:25 The problem
**Show:** the Atlas One home page and its demo.
**Say:** "N-ATLaS is open, but getting from access to a working, deployed integration still means a GPU, a
runtime, keys, glue code, and guessing whether the output is real. Developers now build by instructing coding
agents. Atlas One connects the world to N-ATLaS: any agent, any stack, verified."

## 0:25-1:00 Connect once
**Show:** `codex mcp add atlas-one --url <url>/mcp` (or `claude mcp add ...`), the consent page with its three
permissions, GitHub, "Authentication complete".
**Say:** "Standard MCP and OAuth. The same URL works in Claude Code, Cursor, VS Code and others. I approve exactly
what the agent may do, and I can sign it out any time from my agent or the Access page."

## 1:00-2:15 One instruction
**Show:** the starter app. In the agent: *"Use Atlas One to add a medicine-label reader to this app: dosing as
JSON, explained in Hausa. Keep the key server-side, then test and verify it."* Show `atlas_discover`,
`atlas_bind_project` (a link, not a key), Confirm in the browser, the agent naming the `.env.local` path.
**Say:** "The key never passes through the AI. Sensitive actions wait for me."

## 2:15-3:05 Proof, not plausibility
**Show:** `atlas_test` (request id, weights revision, latency), the nonce flow, `verify_app` → `verified: true`,
the receipt saved as `ATLAS_VERIFICATION.jwt`. In the app, paste a label: dosing JSON plus the Hausa explanation,
"Powered by Awarri". Briefly: the docs' Capabilities (structured output, function calling).
**Say:** "Every answer carries the exact N-ATLaS revision and a request id, and Atlas One proves this route
reached genuine N-ATLaS. Verified means real model use; answer quality you test with your own examples."

## 3:05-3:35 Honest failure
**Show:** stop the Kaggle run. `atlas_test` → `MODEL_OFFLINE` (or `BACKEND_WARMING` with live stages), no answer;
`atlas_inspect` shows the error, marked retryable.
**Say:** "When the model is down, Atlas One says so. It never substitutes another model."

## 3:35-4:00 Real users
**Show:** `/evidence`: external testers, their builds, verified request ids, feedback; `node scripts/verify-evidence.mjs`
printing ALL CHECKS PASSED.
**Say:** "Independent developers built with it, and anyone can verify that. Atlas One: connect the world to N-ATLaS."
