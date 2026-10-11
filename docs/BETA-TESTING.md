# Atlas One beta testing (NAIC 2026, PS1)

Thank you for testing. About 15 minutes. You need a GitHub account, a coding agent with MCP support
(Claude Code, Codex, Cursor, VS Code agent mode, Windsurf or Gemini CLI) and a small app of your own, any stack.

## 1. Connect your agent

Open https://atlas-one.collins-coordinator-worker.workers.dev and follow "Start in 60 seconds": copy the
command for your agent (or the URL for any other MCP client). Your agent opens a consent page: approve it and sign in with any GitHub account. No invite needed.

## 2. Ask for a feature, in your own words

Open your app in the agent and ask for something that uses N-ATLaS, for example:

> Add an endpoint that answers customer questions in Yoruba using N-ATLaS through Atlas One, and verify it.

- When the agent gives you a link, open it, confirm, and put the key in your app's server-side env
  (e.g. `.env.local`). Never paste the key into the chat.
- If N-ATLaS is asleep, your agent's first test wakes it. It is online in about 4 minutes; the home page
  shows each stage. The agent should wait and retry, never fake an answer.
- Let the agent finish. It should report a real `request_id`, then `verified: true` for your app's route.
- The agent then offers to save a signed receipt as `ATLAS_VERIFICATION.jwt`. Say yes, commit it, and push
  your app to a **public GitHub repo** if you can: that lets the judges check your result independently.

## 3. Tell us how it went (2 minutes)

Open https://atlas-one.collins-coordinator-worker.workers.dev/feedback. You're already signed in from step 1.
Include your repo link if you pushed the receipt.

## What is recorded, and who sees it

To prove to the NAIC judges that independent developers used Atlas One, it records **metadata only**: your
GitHub username, your agent's name, each tool call's outcome and timing, request ids, and your feedback. Never
your prompts, code, model answers or keys. It's all on the public evidence page:
https://atlas-one.collins-coordinator-worker.workers.dev/evidence (tick "anonymous" on the feedback form to
hide your username).

---

## For the Atlas One team

- Anyone with GitHub can sign in (`ACCESS=open`). To restrict it again, set `ACCESS` to `invite` in wrangler.jsonc and add logins with `npm run invite -- <login>`.
- Before submitting: `npm run evidence:snapshot`, then commit `evidence/`. Judges verify it with
  `node scripts/verify-evidence.mjs` (see docs/EVIDENCE.md).
- Watch progress live: `/evidence` (judges get the same page; `/evidence.json` for machine-readable data).
- Team members listed in `TEAM_GITHUB_LOGINS` (wrangler.jsonc) appear as "team" and are excluded from the
  external-tester summary.
- PRD Test 3 is met when the summary shows at least 2 external testers with a verified app.
