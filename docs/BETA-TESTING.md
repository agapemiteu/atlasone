# Atlas One beta testing (NAIC 2026, PS1)

Thank you for testing. About 15 minutes. You need a GitHub account, a coding agent with MCP support
(Claude Code, Codex, Cursor, VS Code agent mode, Windsurf or Gemini CLI) and a small app of your own, any stack.

## 1. Get invited

Send the Atlas One team your **GitHub username**. You can sign in once you're added.

## 2. Connect your agent

Copy the URL from https://atlas-one.collins-coordinator-worker.workers.dev (or the exact command for your
agent under "Command for your client"). Your agent opens a consent page: approve it and sign in with GitHub.

## 3. Ask for a feature, in your own words

Open your app in the agent and ask for something that uses N-ATLaS, for example:

> Add an endpoint that answers customer questions in Yoruba using N-ATLaS through Atlas One, and verify it.

- When the agent gives you a link, open it, confirm, and put the key in your app's server-side env
  (e.g. `.env.local`). Never paste the key into the chat.
- If N-ATLaS is asleep, your agent's first test wakes it. It is online in about 4 minutes; the home page
  shows each stage. The agent should wait and retry, never fake an answer.
- Let the agent finish. It should report a real `request_id`, then `verified: true` for your app's route.

## 4. Tell us how it went (2 minutes)

Open https://atlas-one.collins-coordinator-worker.workers.dev/feedback. You're already signed in from step 2.

## What is recorded, and who sees it

To prove to the NAIC judges that independent developers used Atlas One, it records **metadata only**: your
GitHub username, your agent's name, each tool call's outcome and timing, request ids, and your feedback. Never
your prompts, code, model answers or keys. It's all on the public evidence page:
https://atlas-one.collins-coordinator-worker.workers.dev/evidence (tick "anonymous" on the feedback form to
hide your username).

---

## For the Atlas One team

- Invite testers: `npm run invite -- <github-login> [more logins]`
- Watch progress live: `/evidence` (judges get the same page; `/evidence.json` for machine-readable data).
- Team members listed in `TEAM_GITHUB_LOGINS` (wrangler.jsonc) appear as "team" and are excluded from the
  external-tester summary.
- PRD Test 3 is met when the summary shows at least 2 external testers with a verified app.
