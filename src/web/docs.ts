// /docs: the developer reference on one page. Limits and error codes are rendered from the code that
// enforces them, so the docs cannot drift from behaviour.

import { MODEL_CARD, MAX_BODY_BYTES, MAX_TOKENS_CAP } from "../lib/chat.ts";
import { ERRORS } from "../lib/errors.ts";
import { LIMITS } from "../lib/quota.ts";
import { esc } from "./html.ts";
import { appSnippets, clientSnippets, codeTabs, REPO, shell } from "./theme.ts";

const TOC: [id: string, title: string][] = [
  ["quickstart", "Quickstart"],
  ["how", "How it works"],
  ["tools", "Agent tools"],
  ["api", "App API"],
  ["verify", "Verification"],
  ["cold", "Cold starts"],
  ["errors", "Errors"],
  ["limits", "Limits"],
  ["security", "Keys and security"],
  ["licence", "Attribution and licence"],
];

const CSS = `
.docs{display:grid;grid-template-columns:200px minmax(0,1fr);gap:64px;padding-top:56px}
.toc{position:sticky;top:92px;align-self:start;display:grid;gap:2px;font-size:14px}
.toc a{color:var(--mute);padding:5px 10px;border-radius:7px}.toc a:hover{color:var(--fg);background:var(--soft)}
article{max-width:740px}
article h1{font-size:clamp(34px,4.4vw,48px)}
article .lead{margin-top:14px}
article h2{font-size:26px;margin-top:64px;padding-top:8px}
article p,article li{color:#30343c;font-size:15.5px;margin-top:12px}
article ol,article ul{padding-left:20px}
article .tabs{margin-top:18px}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}
th{text-align:left;font-weight:600;color:var(--mute);font-size:12.5px;text-transform:uppercase;letter-spacing:.04em}
th,td{padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
td code{white-space:nowrap}
.flow{margin-top:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.flow div{background:var(--bg);padding:16px}.flow b{display:block;font-size:12px;color:var(--acc);font-weight:600}.flow span{font-size:14px}
@media(max-width:860px){.docs{grid-template-columns:1fr;gap:0}.toc{display:none}.flow{grid-template-columns:1fr 1fr}}
`;

export function docsPage(origin: string): Response {
  const mcp = `${origin}/mcp`;
  const api = `${origin}/v1`;
  const errors = Object.entries(ERRORS)
    .filter(([code]) => !["NOT_FOUND", "CLAIM_EXPIRED"].includes(code))
    .map(([code, e]) => `<tr><td><code>${code}</code></td><td>${e.status}</td><td>${e.retryable ? "Yes" : "No"}</td><td>${esc(e.message)}</td></tr>`)
    .join("");

  const body = `<div class="w docs">
<nav class="toc" aria-label="On this page">${TOC.map(([id, title]) => `<a href="#${id}">${title}</a>`).join("")}</nav>
<article>
<h1>Atlas One docs</h1>
<p class="lead">Atlas One connects coding agents to genuine N-ATLaS, Nigeria's multilingual model (English, Hausa, Igbo, Yoruba). Your agent builds the feature; your app calls a standard chat-completions API.</p>

<h2 id="quickstart">Quickstart</h2>
<ol>
  <li>Add <code>${esc(mcp)}</code> to your MCP client.</li>
  <li>Your client opens Atlas One's consent page. Approve the permissions and sign in with GitHub.</li>
  <li>Ask your agent for a feature, for example: <em>"Add a Hausa customer-support route powered by N-ATLaS, and test it."</em></li>
</ol>
${codeTabs("clients", clientSnippets(mcp))}

<h2 id="how">How it works</h2>
<div class="flow">
  <div><b>1 · Discover</b><span>Agent reads the model card and a recipe for your stack.</span></div>
  <div><b>2 · Bind</b><span>A project is created; you confirm its key in your browser.</span></div>
  <div><b>3 · Integrate</b><span>Agent writes a server-side route that calls the API.</span></div>
  <div><b>4 · Verify</b><span>Atlas One proves your route reached N-ATLaS.</span></div>
</div>
<p>The agent never sees your key: it is shown once, on a one-time link only you can open, and you place it in your server's environment.</p>

<h2 id="tools">Agent tools</h2>
<table><thead><tr><th>Tool</th><th>Permission</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>atlas_discover</code></td><td>read</td><td>Backend state, model card, API details, your projects, a recipe (<code>nextjs</code> or <code>generic</code>).</td></tr>
<tr><td><code>atlas_bind_project</code></td><td>projects</td><td>Create a project, rotate or revoke its key. Returns a confirmation link, never a key.</td></tr>
<tr><td><code>atlas_test</code></td><td>test</td><td>Run a real inference, issue a verification nonce, or verify your app's request.</td></tr>
<tr><td><code>atlas_inspect</code></td><td>read</td><td>Request counts, latency p50/p95, errors, quota and key state for a project.</td></tr>
</tbody></table>

<h2 id="api">App API</h2>
<p>OpenAI-compatible chat completions, so any HTTP client or SDK works (OpenAI SDKs, Vercel AI SDK, LangChain, plain <code>fetch</code>). Base URL <code>${esc(api)}</code>, model <code>n-atlas-8b</code>, header <code>authorization: Bearer &lt;project key&gt;</code>. Streaming with <code>"stream": true</code>.</p>
${codeTabs("app", appSnippets(api))}
<p>Tip: set the reply language in a system message (<em>"Reply in Hausa."</em>). Without it, N-ATLaS may answer in another language.</p>
<p>Every response carries <code>x-atlas-request-id</code>, <code>x-atlas-weights</code> (the exact N-ATLaS revision) and <code>x-atlas-runtime</code>. Call the API from your server only; never ship the key to a browser.</p>

<h2 id="verify">Verification</h2>
<ol>
  <li><code>atlas_test</code> with <code>issue_app_nonce</code> returns a single-use nonce (10 minutes).</li>
  <li>Call your own route with header <code>x-atlas-verify: &lt;nonce&gt;</code>; your route forwards it to Atlas One.</li>
  <li><code>atlas_test</code> with <code>verify_app</code> returns <code>verified: true</code> and the request id, only if that request reached N-ATLaS through your project.</li>
</ol>

<h2 id="cold">Cold starts</h2>
<p>N-ATLaS sleeps after 20 idle minutes. Any authenticated request wakes it; it is online in about 4 minutes. Meanwhile calls return <code>BACKEND_WARMING</code> with the current stage and <code>retry_after_s</code>, and the <a href="/">home page</a> shows each stage live (<code>GET /api/status</code>). Retry on that code; never fall back to another model.</p>

<h2 id="errors">Errors</h2>
<p>Shape: <code>{ "error": { "code", "type", "message", "retryable", "retry_after_s?", "request_id" } }</code>. Agent tools return the same codes.</p>
<table><thead><tr><th>Code</th><th>HTTP</th><th>Retry</th><th>Meaning</th></tr></thead><tbody>${errors}</tbody></table>

<h2 id="limits">Limits</h2>
<table><tbody>
<tr><td>Requests per project</td><td>${LIMITS.min} per minute, ${LIMITS.day} per day</td></tr>
<tr><td>Request body</td><td>${MAX_BODY_BYTES / 1024} KB</td></tr>
<tr><td><code>max_tokens</code></td><td>${MAX_TOKENS_CAP}</td></tr>
<tr><td>Context per request</td><td>${MODEL_CARD.context_window_per_request} tokens</td></tr>
<tr><td>Timeout</td><td>120 s</td></tr>
</tbody></table>

<h2 id="security">Keys and security</h2>
<ul>
  <li>Keys are shown once, in your browser, and stored only as SHA-256 digests.</li>
  <li>Rotate or revoke with <code>atlas_bind_project</code>. Personal tokens for scripts live at <a href="/tokens">/tokens</a>.</li>
  <li>Agents act with the permissions you approved, on your projects only. Atlas One stores request metadata, never prompts or answers.</li>
</ul>

<h2 id="licence">Attribution and licence</h2>
<p>Show <strong>${esc(MODEL_CARD.attribution)}</strong> next to N-ATLaS output, and include the credit line: <em>${esc(MODEL_CARD.credit_line)}</em></p>
<p>${esc(MODEL_CARD.licence)}</p>
<p>Source and technical documentation: <a href="${REPO}">${REPO.replace("https://", "")}</a>.</p>
</article>
</div>`;

  return shell({
    lang: "en",
    title: "Docs · Atlas One",
    description: "Connect a coding agent to N-ATLaS, call the API, verify, handle errors and cold starts.",
    navRight: `<a href="/#use-cases" class="hide">Use cases</a><a href="/docs">Docs</a><a class="hide" href="/playground">Playground</a><a class="hide" href="${REPO}">GitHub</a>`,
    body,
    css: CSS,
  });
}
