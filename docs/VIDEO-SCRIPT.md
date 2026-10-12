# Demo video (NAIC item 5: 3-5 minutes, the artefact working end to end)

Atlas One is developer infrastructure, so the real user is a developer: you, building live with your agent, and
optionally a short clip of an external tester's own run. The Nigerian language is on screen: the app replies in
Hausa text. No voice. One real run, recorded live, edited to about 4.5 minutes. Waiting (the agent writing code, model start-up) is
sped up with an on-screen label such as "2x" or "skipped 90 s"; nothing else is cut or staged.

## Before recording (15 minutes)

1. A clean copy of the starter: `git clone https://github.com/agapemiteu/atlas-one-starter atlas-video-demo`,
   then `npm start` inside it and open http://localhost:3000.
2. Your agent with Atlas One connected (`codex mcp list` or `/mcp` shows atlas-one signed in). To show sign-in on
   camera, sign out first: `codex mcp logout atlas-one`.
3. Wake N-ATLaS: ask the agent "call atlas_discover" and wait until the site header says "N-ATLaS online" (about 30 seconds).
4. A real medicine label to paste (any box at home, typed out), and optionally a 20-40 s screen recording from an
   external tester (Tobi or your friend) of their own run.
5. Screen recorder: Windows Snipping Tool (Record) or OBS at 1080p, microphone on. Close other tabs, hide
   bookmarks, zoom the terminal and browser to 125%.

## Shot list

| Time | Show | Say |
|---|---|---|
| 0:00-0:20 | Home page, demo plays | "N-ATLaS is Nigeria's open AI model. Building with it still means a GPU, a runtime, keys and glue code. Atlas One lets any coding agent do that work, and proves the result is genuine N-ATLaS." |
| 0:20-0:50 | Terminal: `codex mcp add atlas-one --url <url>/mcp`, then `codex mcp login atlas-one`. Browser: consent page (three permissions), GitHub | "One URL for every agent: Codex, Claude Code, Cursor, VS Code. Standard sign-in, and I choose what the agent may do." |
| 0:50-1:10 | In the agent, paste: *"Use Atlas One to add a medicine-label reader to this app: paste a label, get the dosing as JSON and a plain Hausa explanation. Keep the key server-side, then test and verify it."* | "One instruction, in plain words." |
| 1:10-1:50 | Agent calls `atlas_discover`, then `atlas_bind_project`: a link. Open it, Confirm, copy the two lines into `.env.local` at the path the agent names (sped up) | "The key never passes through the AI. Atlas One shows it once, to me, in my browser." |
| 1:50-2:40 | Agent writes the route (sped up), runs `atlas_test` (request id, model revision, latency), then the nonce check and `verify_app` → `verified: true`; it saves `ATLAS_VERIFICATION.jwt` | "It tests on the real model and proves my own route reached genuine N-ATLaS, with a signed receipt anyone can check." |
| 2:40-3:20 | Open the page the agent made. Paste a real medicine label, press the button: the dosing JSON and the Hausa explanation appear, with "Powered by Awarri" | "A real label in, structured data and Hausa out, from genuine N-ATLaS, in an app my agent built minutes ago." |
| 3:20-3:40 | Optional: the external tester's clip (their agent reaching `verified: true`) | "Other developers, on their own machines and accounts, did the same." |
| 3:40-4:10 | Site `/evidence`: external testers, their builds and verified request ids; terminal: `node scripts/verify-evidence.mjs` → ALL CHECKS PASSED | "Independent developers have built with it, and anyone can verify that." |
| 4:10-4:30 | Docs: Capabilities (structured output, function calling), then home page | "Any agent, any stack, the full model, verified. Atlas One: connect the world to N-ATLaS." |

## If something goes wrong on camera

- `BACKEND_WARMING`: keep recording; the agent retries. Cut the wait and label it ("model starting, about 30 s").
- A wrong or odd Hausa answer: keep it. Say "verified means genuine N-ATLaS; answer quality is the model's, and
  we test it". Honesty is part of the product.
- Sign-in error in Codex: `codex mcp logout atlas-one`, then `codex mcp login atlas-one`.

## After recording

Export 1080p MP4, upload to YouTube as **Unlisted** (or Google Drive, "anyone with the link"), and paste the URL
into item 5 of the form.
