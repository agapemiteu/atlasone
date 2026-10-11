// The one-page "how to use Atlas One" site (CLAUDE.md rule 7), in English and Hausa, with copy-paste
// setup for every major MCP client and live backend status. Server-rendered; no tracking, no assets.

import { MODEL_CARD } from "../lib/chat.ts";
import { esc, page } from "./html.ts";
import { type PublicStatus, statusWidget } from "./status.ts";

const STATUS: Record<PublicStatus["backend"], { label: string; tone: string; detail: string }> = {
  ready: { label: "N-ATLaS is online", tone: "ok", detail: "Genuine N-ATLaS inference is available now." },
  loading: { label: "N-ATLaS is starting", tone: "warn", detail: "The model is loading onto the GPU; try again in a minute." },
  waking: {
    label: "Waking N-ATLaS",
    tone: "warn",
    detail: "Someone asked for N-ATLaS, so it is starting on a free GPU. Each step below is reported live by the model server.",
  },
  offline: {
    label: "N-ATLaS is asleep",
    tone: "off",
    detail:
      "N-ATLaS sleeps when idle to save free GPU time. It wakes automatically the first time your agent, app or the " +
      "playground calls it (about 4-5 minutes on free GPUs), with live progress here. Calls made while it wakes get an " +
      "honest BACKEND_WARMING reply with a retry time, never a fake answer.",
  },
};

function clients(mcp: string) {
  return [
    ["Claude Code", `claude mcp add --transport http atlas-one ${mcp}`, "Then run /mcp, pick atlas-one, Authenticate."],
    ["Codex", `codex mcp add atlas-one --url ${mcp}\ncodex mcp login atlas-one`, "Login opens your browser."],
    ["Cursor", `// ~/.cursor/mcp.json\n{ "mcpServers": { "atlas-one": { "url": "${mcp}" } } }`, "Settings, Tools & MCP, Connect."],
    ["VS Code (Copilot agent)", `// .vscode/mcp.json\n{ "servers": { "atlas-one": { "type": "http", "url": "${mcp}" } } }`, "Start the server from the file, then sign in."],
    ["Windsurf", `// ~/.codeium/windsurf/mcp_config.json\n{ "mcpServers": { "atlas-one": { "serverUrl": "${mcp}" } } }`, "Refresh MCP servers, then sign in."],
    ["Gemini CLI", `// ~/.gemini/settings.json\n{ "mcpServers": { "atlas-one": { "httpUrl": "${mcp}" } } }`, "Run /mcp auth atlas-one."],
    ["Any other MCP client", `URL: ${mcp}\nTransport: Streamable HTTP · Auth: OAuth 2.1 (discovered automatically)`, "No browser (CI, containers)? Use a personal token from /tokens as 'Authorization: Bearer ...'."],
  ] as const;
}

export function homePage(origin: string, status: PublicStatus): Response {
  const mcp = `${origin}/mcp`;
  const api = `${origin}/v1`;
  const s = STATUS[status.backend];
  const clientBlocks = clients(mcp)
    .map(([name, code, note]) => `<details><summary><strong>${esc(name)}</strong></summary><pre>${esc(code)}</pre><p class="muted">${esc(note)}</p></details>`)
    .join("");

  const body = `
<style>
.hero h1{font-size:1.9rem;margin:0 0 6px}.lead{font-size:1.08rem}
.pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:.88rem;font-weight:600;border:1px solid var(--line)}
.pill.ok{color:var(--accent)}.pill.warn{color:#b7791f}.pill.off{color:var(--muted)}
section{margin-top:28px}h2{font-size:1.15rem;margin:0 0 10px}ol{padding-left:20px}li{margin:6px 0}
details{border-top:1px solid var(--line);padding:8px 0}summary{cursor:pointer}
.lang a{margin-right:12px}.grid{display:grid;gap:12px}
</style>
<div class="hero card">
  <p class="lang muted"><a href="#en">English</a><a href="#ha">Hausa</a></p>
  <h1>N-ATLaS, one instruction away.</h1>
  <p class="lead">Connect your coding agent once. Ask it to add a Hausa, Igbo, Yoruba or Nigerian-English AI feature to your app. It integrates genuine N-ATLaS and proves it works.</p>
  <p><span id="status-pill" class="pill ${s.tone}">● ${esc(s.label)}</span></p>
  <p class="muted">${esc(s.detail)}</p>
  ${statusWidget(status)}
</div>

<section id="en" class="card">
  <h2>1. Connect your agent (about 30 seconds)</h2>
  <p>Atlas One is a standard MCP server, so it works with any MCP client. Pick yours:</p>
  ${clientBlocks}
  <p class="muted">You approve what the agent may do, then sign in with GitHub. Atlas One is invite-only during the NAIC 2026 beta.</p>
</section>

<section class="card">
  <h2>2. Ask for the feature</h2>
  <pre>Add a Hausa customer-support route to this app using N-ATLaS through Atlas One, and verify it.</pre>
  <p>Your agent will:</p>
  <ol>
    <li><code>atlas_discover</code>: checks N-ATLaS is online and reads the integration recipe.</li>
    <li><code>atlas_bind_project</code>: creates your project and gives <em>you</em> a one-time link. You confirm in the browser and copy the key into <code>.env.local</code>. The agent never sees the key.</li>
    <li>Writes a server-side route in your app (Next.js recipe, or any stack).</li>
    <li><code>atlas_test</code>: runs a genuine N-ATLaS request, then proves your own route reached N-ATLaS with a one-time verification code.</li>
    <li><code>atlas_inspect</code>: shows request counts, latency and errors if something goes wrong.</li>
  </ol>
  <p class="muted">Sensitive actions (keys, rotation, revocation) always wait for your confirmation in the browser.</p>
</section>

<section class="card">
  <h2>3. Your app calls N-ATLaS</h2>
  <p>An industry-standard chat API (OpenAI-compatible): use any HTTP client, any language, or frameworks like the Vercel AI SDK, LangChain or LiteLLM. No Atlas SDK needed.</p>
  <pre>curl ${esc(api)}/chat/completions \\
  -H "authorization: Bearer $ATLAS_ONE_API_KEY" -H "content-type: application/json" \\
  -d '{"model":"n-atlas-8b","messages":[{"role":"system","content":"Reply in Hausa."},{"role":"user","content":"Menene babban birnin Najeriya?"}]}'</pre>
  <p>Every response carries <code>x-atlas-request-id</code>, <code>x-atlas-weights</code> (exact N-ATLaS revision) and <code>x-atlas-runtime</code>. The model's recommended settings are applied for you.</p>
  <ul>
    <li>Keep the key server-side. Never put it in browser code or commit it.</li>
    <li>Show <strong>${esc(MODEL_CARD.attribution)}</strong> wherever N-ATLaS output appears. Credit line: <em>${esc(MODEL_CARD.credit_line)}</em></li>
    <li>${esc(MODEL_CARD.licence)}</li>
  </ul>
</section>

<section class="card">
  <h2>Try it in the browser</h2>
  <p><a href="/playground">Open the playground</a> (sign in with GitHub) to send a prompt in English, Hausa, Igbo or Yoruba and see the raw provenance.</p>
</section>

<section class="card">
  <h2>Beta testers: what to do</h2>
  <ol>
    <li>Send the Atlas One team your GitHub username so you can be invited.</li>
    <li>Connect your agent (step 1) and ask it to add an N-ATLaS feature to any small app of yours.</li>
    <li>When it finishes, send us: your agent's name, the project slug, the <code>request_id</code> from <code>atlas_test</code>, how long it took, and anything that confused you.</li>
  </ol>
</section>

<section id="ha" class="card">
  <h2>A Hausa: yadda ake amfani da Atlas One</h2>
  <ol>
    <li><strong>Haɗa wakilin coding ɗinka</strong> (Claude Code, Codex, Cursor, VS Code ko wani) da adireshin <code>${esc(mcp)}</code>. Za ka amince da izinin da ya nema, sannan ka shiga da GitHub.</li>
    <li><strong>Faɗa masa abin da kake so</strong>, misali: "Ƙara hanyar amsa tambayoyin abokan ciniki da Hausa ta amfani da N-ATLaS, kuma ka tabbatar tana aiki."</li>
    <li><strong>Tabbatar da maɓalli</strong>: wakilin zai ba ka hanyar haɗi ta lokaci ɗaya. Buɗe ta, danna "Confirm", ka kwafi maɓallin zuwa <code>.env.local</code>. Kada ka liƙa maɓallin a cikin taɗi.</li>
    <li><strong>Gwaji na gaske</strong>: wakilin zai gudanar da <code>atlas_test</code> domin ya tabbatar cewa amsoshin sun fito daga N-ATLaS ainihi, ba wani samfuri ba.</li>
  </ol>
  <p class="muted">Ka nuna "Powered by Awarri" duk inda amsar N-ATLaS ta bayyana. Fassarar Hausa: muna maraba da gyare-gyare.</p>
</section>

<p class="muted" style="margin-top:24px">Atlas One · NAIC 2026, PS1 Developer Infrastructure · <a href="https://github.com/agapemiteu/atlasone">Source on GitHub</a> · <a href="/.well-known/oauth-protected-resource">MCP auth metadata</a></p>`;
  return page("N-ATLaS, one instruction away", body);
}
