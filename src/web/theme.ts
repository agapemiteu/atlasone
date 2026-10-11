// Shared shell for the public pages (home and docs): light theme, Inter, sticky nav, footer, CSP.

import { MODEL_CARD } from "../lib/chat.ts";
import { esc } from "./html.ts";
import { ICONS } from "./icons.ts";

export const REPO = "https://github.com/agapemiteu/atlasone";

const CSS = `
:root{--bg:#fff;--fg:#0a0a0b;--mute:#5b616e;--faint:#8b909a;--line:#e7e7ea;--soft:#f7f7f8;--acc:#0a7d45;--accbg:#eaf6f0;--warn:#c27c0e;color-scheme:light}
*{box-sizing:border-box;margin:0}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:72px}
body{background:var(--bg);color:var(--fg);font:16px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.w{max-width:1120px;margin:0 auto;padding:0 24px}
.i{width:20px;height:20px;flex:none}
code,pre,.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
:not(pre)>code{font-size:.88em;background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
nav.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.82);backdrop-filter:saturate(180%) blur(16px);-webkit-backdrop-filter:saturate(180%) blur(16px);border-bottom:1px solid var(--line)}
nav.top .w{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{font-weight:650;letter-spacing:-.015em;display:flex;align-items:center;gap:8px}.brand .i{color:var(--acc)}
.navr{display:flex;align-items:center;gap:24px;font-size:14px;color:var(--mute)}.navr a:hover{color:var(--fg)}
.st{display:inline-flex;align-items:center;gap:7px}.dot{width:7px;height:7px;border-radius:50%;background:var(--faint)}
.st.ready .dot{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.15)}.st.waking .dot,.st.loading .dot{background:var(--warn);animation:b 1.2s infinite}
@keyframes b{50%{opacity:.25}}
h1{font-size:clamp(40px,6vw,72px);line-height:1.03;letter-spacing:-.045em;font-weight:680}
h2{font-size:clamp(28px,3.2vw,40px);letter-spacing:-.03em;font-weight:660;line-height:1.12}
h3{font-size:17px;font-weight:600;letter-spacing:-.01em}
.lead{color:var(--mute);font-size:clamp(17px,1.5vw,19px)}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:10px;font-weight:550;font-size:15px;border:1px solid var(--line);background:var(--bg);transition:transform .15s,box-shadow .15s}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px -6px rgba(0,0,0,.18)}.btn.p{background:var(--fg);color:#fff;border-color:var(--fg)}.btn .i{width:16px;height:16px}
.tabs{display:inline-flex;gap:2px;padding:3px;background:var(--soft);border:1px solid var(--line);border-radius:10px;flex-wrap:wrap}
.tabs button{all:unset;cursor:pointer;padding:6px 12px;border-radius:7px;font-size:13.5px;font-weight:550;color:var(--mute)}
.tabs button[aria-selected=true]{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.code{position:relative;margin-top:10px;background:var(--soft);border:1px solid var(--line);border-radius:12px}
.code pre{padding:16px 52px 16px 18px;font-size:13px;line-height:1.7;overflow-x:auto;white-space:pre}
.cp{all:unset;cursor:pointer;color:var(--faint);padding:6px;border-radius:6px;display:inline-flex}.cp:hover{color:var(--fg);background:var(--bg)}.code .cp{position:absolute;top:9px;right:9px}
.cp .i{width:18px;height:18px}
footer{margin-top:120px;border-top:1px solid var(--line);font-size:13.5px;color:var(--faint)}
footer .w{display:flex;justify-content:space-between;gap:16px 32px;flex-wrap:wrap;padding-top:28px;padding-bottom:44px}
footer .links{display:flex;gap:20px;flex-wrap:wrap}footer a:hover{color:var(--fg)}
@media(max-width:760px){.navr .hide{display:none}.navr{gap:16px}}
`;

const JS = `
document.querySelectorAll("[data-tabs]").forEach(function(g){
  var btns=g.querySelectorAll("[role=tab]"), panes=document.querySelectorAll('[data-pane="'+g.dataset.tabs+'"]');
  btns.forEach(function(b,i){b.addEventListener("click",function(){
    btns.forEach(function(x){x.setAttribute("aria-selected","false")}); b.setAttribute("aria-selected","true");
    panes.forEach(function(p,j){p.hidden=j!==i});
  })});
});
document.querySelectorAll(".cp").forEach(function(c){c.addEventListener("click",function(){
  var src=c.dataset.copy?document.getElementById(c.dataset.copy):(c.parentElement.querySelector("pre:not([hidden])")||c.parentElement.querySelector("pre"));
  navigator.clipboard.writeText(src.textContent.trim()); var t=c.innerHTML; c.innerHTML=${JSON.stringify(ICONS.tick)}; setTimeout(function(){c.innerHTML=t},1200);
})});
`;

/** Segmented tabs over code blocks, one shared copy button. */
export function codeTabs(group: string, items: [string, string][]): string {
  return `<div class="tabs" role="tablist" data-tabs="${group}">${items
    .map(([name], i) => `<button role="tab" aria-selected="${i === 0}">${esc(name)}</button>`)
    .join("")}</div>
  <div class="code"><button class="cp" aria-label="Copy">${ICONS.copy}</button>${items
    .map(([, code], i) => `<pre data-pane="${group}"${i ? " hidden" : ""}>${esc(code)}</pre>`)
    .join("")}</div>`;
}

export function clientSnippets(mcp: string): [string, string][] {
  return [
    ["Claude Code", `claude mcp add --transport http atlas-one ${mcp}`],
    ["Codex", `codex mcp add atlas-one --url ${mcp}`],
    ["Cursor", `{ "mcpServers": { "atlas-one": { "url": "${mcp}" } } }`],
    ["VS Code", `{ "servers": { "atlas-one": { "type": "http", "url": "${mcp}" } } }`],
    ["Windsurf", `{ "mcpServers": { "atlas-one": { "serverUrl": "${mcp}" } } }`],
    ["Gemini CLI", `{ "mcpServers": { "atlas-one": { "httpUrl": "${mcp}" } } }`],
    ["Any other MCP client", `Add a remote (Streamable HTTP) server with this URL:\n${mcp}`],
  ];
}

export function appSnippets(api: string): [string, string][] {
  return [
    [
      "curl",
      `curl ${api}/chat/completions \\
  -H "authorization: Bearer $ATLAS_ONE_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"model":"n-atlas-8b","messages":[
        {"role":"system","content":"Reply in Hausa."},
        {"role":"user","content":"Menene babban birnin Najeriya?"}]}'`,
    ],
    [
      "TypeScript",
      `import OpenAI from "openai";

const atlas = new OpenAI({ baseURL: "${api}", apiKey: process.env.ATLAS_ONE_API_KEY });
const r = await atlas.chat.completions.create({
  model: "n-atlas-8b",
  messages: [{ role: "system", content: "Reply in Yoruba." }, { role: "user", content: question }],
});`,
    ],
    [
      "Python",
      `import os
from openai import OpenAI

atlas = OpenAI(base_url="${api}", api_key=os.environ["ATLAS_ONE_API_KEY"])
r = atlas.chat.completions.create(
    model="n-atlas-8b",
    messages=[{"role": "system", "content": "Reply in Igbo."}, {"role": "user", "content": question}],
)`,
    ],
  ];
}

interface Shell {
  lang: "en" | "ha";
  title: string;
  description: string;
  navRight: string;
  body: string;
  css?: string;
  script?: string;
}

export function shell(s: Shell): Response {
  const html = `<!doctype html><html lang="${s.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)}</title><meta name="description" content="${esc(s.description)}"><meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;550;600;650;660;680&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}${s.css ?? ""}</style></head><body>
<nav class="top"><div class="w"><a class="brand" href="/">${ICONS.globe}Atlas One</a><div class="navr">${s.navRight}</div></div></nav>
${s.body}
<footer><div class="w"><span>${esc(MODEL_CARD.credit_line)}</span>
<span class="links"><a href="/docs">Docs</a><a href="https://huggingface.co/NCAIR1/N-ATLaS">Licence</a><a href="/tokens">Tokens</a><a href="${REPO}">GitHub</a><span>NAIC 2026 · PS1</span></span></div></footer>
<script>${JS}${s.script ?? ""}</script>
</body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
        "script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
