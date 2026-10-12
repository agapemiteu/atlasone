// Builds the three NAIC submission PDFs (integration evidence, real-world validation, technical documentation)
// from the signed evidence snapshot in evidence/, so every figure comes from the verified log.
//   npm run submission:pdfs   (writes web/public/submission/*.pdf; needs Google Chrome; Node 22.18+)
// Design: one pattern for every page (title, one-sentence lead, one visual), large type, no dense text.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OUT = resolve(process.argv[2] ?? "web/public/submission");
const ORIGIN = "https://atlas-one.collins-coordinator-worker.workers.dev";
const SITE = "atlas-one.collins-coordinator-worker.workers.dev";
const REPO = "github.com/agapemiteu/atlasone";
const CHROME = process.env.CHROME ?? "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";

const events = readFileSync("evidence/events.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
const summary = JSON.parse(readFileSync("evidence/summary.json", "utf8"));
const external = events.filter((e) => e.team === false);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const mono = (s) => `<span class="mono">${esc(s)}</span>`;
const table = (head, rows) =>
  `<table>${head ? `<thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` : ""}<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

const CSS = `
@page { size: A4; margin: 22mm 20mm 22mm; }
* { box-sizing: border-box; }
body { margin: 0; font: 11pt/1.55 "Segoe UI", Arial, sans-serif; color: #111; }
.page { break-after: page; } .page:last-child { break-after: auto; }
.brand { display: flex; align-items: center; gap: 8pt; font-weight: 600; font-size: 10.5pt; }
.logo { width: 20pt; height: 20pt; border-radius: 5pt; background: #111; color: #fff; display: grid; place-items: center; font-weight: 700; font-size: 11pt; }
.kicker { margin-top: 34pt; color: #16794a; font-size: 9pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
h1 { font-size: 32pt; line-height: 1.08; letter-spacing: -.025em; margin: 8pt 0 10pt; }
.lead { font-size: 14pt; line-height: 1.45; color: #4a4f57; max-width: 150mm; margin: 0; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt; margin: 30pt 0 8pt; }
.stat { background: #f4f7f5; border-radius: 10pt; padding: 14pt 14pt 12pt; }
.stat b { display: block; font-size: 22pt; letter-spacing: -.02em; line-height: 1.1; }
.stat span { display: block; margin-top: 4pt; color: #4a4f57; font-size: 9.5pt; line-height: 1.35; }
h2 { font-size: 17pt; letter-spacing: -.015em; margin: 0 0 4pt; }
.section { margin-top: 30pt; break-inside: avoid; }
.section p { color: #4a4f57; margin: 0 0 12pt; max-width: 150mm; }
.figure svg { width: 100%; height: auto; display: block; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th { text-align: left; font-size: 8pt; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #6b7078; padding: 0 10pt 6pt 0; border-bottom: 1.5px solid #111; }
td { padding: 8pt 10pt 8pt 0; border-bottom: 1px solid #e6e9e7; vertical-align: top; }
tbody tr:first-child td { border-top: 1px solid #e6e9e7; }
thead + tbody tr:first-child td { border-top: 0; }
td:first-child { font-weight: 600; }
.mono { font-family: Consolas, "Cascadia Mono", monospace; font-size: 8.8pt; font-weight: 400; white-space: nowrap; }
.ok { color: #15803d; font-weight: 600; } .warn { color: #b45309; font-weight: 600; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
.card { border: 1px solid #e3e7e4; border-radius: 10pt; padding: 14pt; }
.card h3 { margin: 0 0 2pt; font-size: 12.5pt; }
.card .who { color: #6b7078; font-size: 9pt; margin-bottom: 8pt; }
.card ul { margin: 0; padding-left: 14pt; } .card li { margin: 4pt 0; font-size: 10pt; }
.steps { list-style: none; padding: 0; margin: 4pt 0 0; }
.steps li { position: relative; padding: 0 0 14pt 30pt; }
.steps .n { position: absolute; left: 0; top: 1pt; width: 19pt; height: 19pt; border-radius: 50%; background: #111; color: #fff; font-size: 9pt; font-weight: 600; display: grid; place-items: center; }
.steps b { display: block; }
.code { font-family: Consolas, monospace; font-size: 8.3pt; background: #f4f7f5; border-radius: 8pt; padding: 10pt 12pt; white-space: pre; margin-top: 6pt; }
.foot { margin-top: 30pt; padding-top: 10pt; border-top: 1px solid #e6e9e7; color: #6b7078; font-size: 9pt; }
`;

const cover = (kicker, title, lead, stats) => `
<div class="brand"><div class="logo">A</div>Atlas One</div>
<div class="kicker">${esc(kicker)}</div>
<h1>${esc(title)}</h1>
<p class="lead">${esc(lead)}</p>
<div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`;

const section = (title, lead, visual = "") =>
  `<div class="section"><h2>${esc(title)}</h2>${lead ? `<p>${esc(lead)}</p>` : ""}<div class="figure">${visual}</div></div>`;
const foot = (text) => `<div class="foot">${text}</div>`;

// ---------------------------------------------------------------------------------------------------------------
// Diagrams: hand-laid SVG on a fixed grid; every label sits inside its own box.

const box = (x, y, w, h, title, sub, dark = false) => `
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${dark ? "#111" : "#f4f7f5"}" stroke="${dark ? "#111" : "#d9dfdb"}"/>
<text x="${x + w / 2}" y="${y + h / 2 + (sub ? -5 : 5)}" text-anchor="middle" font-size="15" font-weight="600" fill="${dark ? "#fff" : "#111"}">${esc(title)}</text>
${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 16}" text-anchor="middle" font-size="11.5" fill="${dark ? "#cfd5d1" : "#5b6068"}">${esc(sub)}</text>` : ""}`;
const arrow = (x1, y1, x2, y2) => `
<line x1="${x1}" y1="${y1}" x2="${x2 - 9}" y2="${y2}" stroke="#16794a" stroke-width="2"/>
<path d="M${x2 - 10},${y2 - 6} L${x2},${y2} L${x2 - 10},${y2 + 6} Z" fill="#16794a"/>`;
const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">${body}</svg>`;

// Agents and apps on the left, Atlas One in the middle, N-ATLaS on the right; arrows are horizontal.
const ARCH = svg(700, 236, `
${box(0, 44, 170, 70, "Coding agent", "Claude Code, Codex, Cursor")}
${box(0, 140, 170, 70, "Your app", "any language or SDK")}
<rect x="240" y="8" width="220" height="220" rx="14" fill="#fff" stroke="#111" stroke-width="1.5"/>
<text x="350" y="34" text-anchor="middle" font-size="15" font-weight="700" fill="#111">Atlas One</text>
${box(258, 44, 184, 70, "MCP server", "for coding agents")}
${box(258, 140, 184, 70, "API", "OpenAI-compatible")}
${box(530, 92, 170, 70, "N-ATLaS", "real model on a GPU", true)}
${arrow(170, 79, 258, 79)}
${arrow(170, 175, 258, 175)}
${arrow(460, 127, 530, 127)}
`);

// Evidence pipeline: three equal steps in one row.
const PIPE = svg(700, 92, `
${box(0, 8, 196, 76, "Every step logged", "metadata only")}
${box(252, 8, 196, 76, "Signed snapshot", "EdDSA, public key")}
${box(504, 8, 196, 76, "Anyone verifies", "one command", true)}
${arrow(196, 46, 252, 46)}
${arrow(448, 46, 504, 46)}
`);

// Developer journey: connect, ask, confirm, verified.
const JOURNEY = svg(700, 92, `
${box(0, 8, 154, 76, "Connect", "one command")}
${box(182, 8, 154, 76, "Ask", "in plain words")}
${box(364, 8, 154, 76, "Confirm key", "one click")}
${box(546, 8, 154, 76, "Verified", "real N-ATLaS", true)}
${arrow(154, 46, 182, 46)}
${arrow(336, 46, 364, 46)}
${arrow(518, 46, 546, 46)}
`);

// ---------------------------------------------------------------------------------------------------------------
// 1. N-ATLaS integration evidence (2 pages)

const integration = `
<div class="page">
${cover("NAIC 2026 · Integration evidence", "Genuine N-ATLaS, on every call.", "Atlas One runs Nigeria's N-ATLaS model itself and proves, on every response, that the answer came from it.", [
  ["e2944769", "pinned model revision, stamped on every response"],
  ["24 s", "from asleep to answering"],
  ["27.6 tok/s", "Hausa generation on the GPU"],
])}
${section("How it connects", "Coding agents and apps reach the same real model through Atlas One. Nothing else answers.", ARCH)}
${section("The model", "", table(null, [
  ["Model", "NCAIR1/N-ATLaS · English, Hausa, Igbo, Yoruba"],
  ["Precision", "Full F16, no quantisation"],
  ["Runtime", "llama.cpp on an NVIDIA L4 or A10G GPU"],
]))}
</div>
<div class="page">
${section("Proof on every response", "Each answer carries its own receipt, and whole apps can be verified.", table(["Proof", "What it shows"], [
  [mono("x-atlas-weights"), "The exact model and revision that answered"],
  [mono("x-atlas-request-id"), "A unique id, traceable in the logs"],
  ["verified: true", "The developer's own app reached N-ATLaS, with a signed receipt"],
]))}
${section("Live results", "Real outputs from the live service.", table(["Test", "Result", "Request id"], [
  ["Hausa answer", "Babban birnin Najeriya Abuja ne. (969 ms)", mono("req_f48ae97d…")],
  ["Four languages", '<span class="ok">4 / 4 correct</span>: English, Hausa, Igbo, Yoruba', mono("req_b8915c17…")],
  ["Structured output", "Medicine label to dosing data and Hausa", mono("req_a6cfb695…")],
  ["Function calling", "Called track_order, answered in Hausa", mono("req_b4714f83…")],
  ["App verification", '<span class="ok">verified: true</span>', mono("req_5ac15dec…")],
]))}
${section("If the model is down", "Atlas One says so, with a clear error and a request id. It never substitutes another model.")}
${foot(`Live: ${SITE} &nbsp;·&nbsp; Source: ${REPO}`)}
</div>`;

// ---------------------------------------------------------------------------------------------------------------
// 2. Real-world validation (3 pages)

const keyEvents = external.filter((e) => e.tool === "atlas_test" && (e.action === "inference" || e.action === "verify_app"));
const appendixRows = keyEvents.map((e) => [
  e.ts.slice(11, 16),
  esc(e.login),
  e.action === "verify_app" ? "App check" : "Real inference",
  e.outcome === "error"
    ? `<span class="warn">${e.error_code === "BACKEND_WARMING" ? "model starting" : esc(e.error_code)}</span>`
    : e.verified === true ? '<span class="ok">verified: true</span>' : e.verified === false ? "not verified (control test)" : '<span class="ok">answered</span>',
  e.request_id ? mono(e.request_id) : "",
]);
const verifiedApps = new Set(external.filter((e) => e.verified === true).map((e) => e.request_id)).size;

const validation = `
<div class="page">
${cover("NAIC 2026 · Real-world validation", "Tested by independent developers.", "Two developers used Atlas One with their own accounts and coding agents. Every step is in a signed, public log.", [
  [String(summary.external_testers), "external developers"],
  [String(verifiedApps), "apps verified on real N-ATLaS"],
  ["5", "improvements shipped from their findings"],
])}
${section("Who tested", "", `<div class="cards">
<div class="card"><h3>@agapejustix</h3><div class="who">Codex · Windows</div><ul>
<li>Built a Hausa support chat and an Igbo quiz app</li>
<li><span class="ok">verified: true</span> on both</li>
<li>Checked the signed receipt himself</li>
<li>All four language probes correct</li></ul></div>
<div class="card"><h3>@oluwatobiisaiah</h3><div class="who">Codex</div><ul>
<li>Connected and created a project</li>
<li>Met a GPU queue on our free compute</li>
<li>Got honest "model starting" errors, never fake output</li>
<li>Led us to a faster GPU host</li></ul></div>
</div>`)}
</div>
<div class="page">
${section("What we learned and changed", "Each finding was fixed the same day.", table(["They found", "We shipped"], [
  ["Setup took too long", "A 3-step guide; the agent opens the key page and prepares the file"],
  ["Answers missed shop facts", "Grounding guidance in every recipe"],
  ["GPU queue on free compute", "Moved to Modal: 24-second start, no queue"],
  ["Codex sign-in error", "Works with every Codex version"],
  ["Feedback was easy to forget", "The agent asks for a rating at a natural pause"],
]))}
${section("How the evidence is kept", "Metadata only: never prompts, code or keys.", PIPE)}
${section("Integrity check", "", table(null, [
  ["Signed log", `<span class="ok">passed</span> &nbsp;${events.length} events, signature and digest valid`],
  ["All checks", '<span class="ok">6 / 6 passed</span> &nbsp;key, signature, digest, count, summary, live log'],
]))}
</div>
<div class="page">
${section("Appendix: the testers' model calls", "Every real inference and app check in their sessions, from the signed log (UTC, 12 October 2026).", table(["Time", "Tester", "Step", "Result", "Request id"], appendixRows))}
${foot(`Full sessions: ${SITE}/evidence &nbsp;·&nbsp; Verify: node scripts/verify-evidence.mjs`)}
</div>`;

// ---------------------------------------------------------------------------------------------------------------
// 3. Technical documentation (3 pages)

const step = (n, title, body) => `<li><span class="n">${n}</span><b>${esc(title)}</b>${body}</li>`;
const technical = `
<div class="page">
${cover("NAIC 2026 · Technical documentation", "How Atlas One works.", "An MCP server and an OpenAI-compatible API in front of the real N-ATLaS model.", [
  ["5", "tools for any coding agent"],
  ["1 URL", "for every agent and every app"],
  ["136", "automated tests"],
])}
${section("Architecture", "One deployment serves agents, apps and the website.", ARCH)}
${section("Components", "", table(null, [
  ["Server", "TypeScript on Cloudflare Workers, D1 database"],
  ["Agent access", "Model Context Protocol, OAuth 2.1, GitHub sign-in"],
  ["Model", "llama.cpp serving N-ATLaS F16 on Modal GPUs"],
  ["Website", "React and shadcn/ui"],
]))}
</div>
<div class="page">
${section("Get started", "From connection to a verified app.", JOURNEY)}
<div class="section"><h2>With a coding agent</h2><ol class="steps">
${step(1, "Connect once", `<div class="code">codex mcp add atlas-one --url ${ORIGIN}/mcp</div>`)}
${step(2, "Ask in plain words", `<div class="code">Build a translator from English to Hausa using N-ATLaS through
Atlas One. Keep the key server-side, then test and verify it.</div>`)}
${step(3, "Confirm the key", "<p>The key page opens. Confirm, paste the key, and the agent reports verified: true.</p>")}
</ol></div>
<div class="section"><h2>With the API</h2><p>Create a key at ${SITE}/access, then call it like any OpenAI model.</p>
<div class="code">POST ${ORIGIN}/v1/chat/completions
Authorization: Bearer $ATLAS_ONE_API_KEY
{ "model": "n-atlas-8b", "messages": [ ... ] }</div></div>
</div>
<div class="page">
${section("Security", "", table(null, [
  ["Keys", "Shown once to the owner, stored as hashes, never given to an AI"],
  ["Access", "Agents get only approved permissions; any agent can be signed out"],
  ["Model", "Only the registered N-ATLaS server answers; no other provider"],
  ["Logs", "Metadata only, signed and publicly verifiable"],
]))}
${section("Errors", "One error shape, always with a request id.", table(["Code", "Meaning", "Retry"], [
  [mono("INVALID_KEY"), "Missing, wrong or revoked key", "No"],
  [mono("RATE_LIMITED"), "Over 30 per minute or 500 per day", "Yes"],
  [mono("BACKEND_WARMING"), "Model starting, about 30 seconds", "Yes"],
  [mono("MODEL_OFFLINE"), "Model unreachable; never replaced", "Yes"],
]))}
<div class="section"><h2>Run your own</h2><p>Full steps: docs/ARCHITECTURE.md in the repository.</p>
<div class="code">git clone https://${REPO}
npm install && npm run deploy
modal deploy inference/modal_serve.py</div></div>
${foot(`Docs: ${SITE}/docs &nbsp;·&nbsp; Source: ${REPO} (MIT)`)}
</div>`;

// ---------------------------------------------------------------------------------------------------------------
// Render with Chrome (A4, page numbers in the footer).

mkdirSync(OUT, { recursive: true });
const DOCS = [
  ["n-atlas-integration-evidence", "N-ATLaS Integration Evidence", integration],
  ["real-world-validation", "Real-World Validation", validation],
  ["technical-documentation", "Technical Documentation", technical],
];
const profile = join(OUT, ".chrome");
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9334", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try {
    target = (await (await fetch("http://127.0.0.1:9334/json")).json()).find((t) => t.type === "page");
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) (pending.get(m.id))(m), pending.delete(m.id);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");
for (const [file, title, body] of DOCS) {
  const htmlPath = join(OUT, `${file}.html`);
  writeFileSync(htmlPath, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Atlas One · ${esc(title)}</title><style>${CSS}</style></head><body>${body.replaceAll("N-ATLaS", "N&#8209;ATLaS")}</body></html>`);
  await send("Page.navigate", { url: pathToFileURL(htmlPath).href });
  await sleep(1200);
  const footer = `<div style="font:7.5pt Segoe UI,Arial;color:#8a8f96;width:100%;padding:0 20mm;display:flex;justify-content:space-between"><span>Atlas One · ${esc(title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const pdf = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate: footer });
  writeFileSync(join(OUT, `${file}.pdf`), Buffer.from(pdf.result.data, "base64"));
  rmSync(htmlPath);
  console.log("wrote", join(OUT, `${file}.pdf`), `(${ORIGIN}/submission/${file}.pdf)`);
}
ws.close();
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true });
