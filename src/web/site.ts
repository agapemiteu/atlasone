// Home page. Shows the product instead of describing it: a replay of a real session (real request ids
// from atlas-one.log), copy-paste setup per client, live backend state, and real numbers. English and
// Hausa (?lang=ha). Server-rendered, no frameworks, no tracking.

import { esc } from "./html.ts";
import { ICONS } from "./icons.ts";
import { type PublicStatus, statusWidget } from "./status.ts";

type Lang = "en" | "ha";

const T = {
  en: {
    sub: "Connect any coding agent. Ask for a Hausa, Igbo or Yoruba feature. Get it built and verified on genuine N-ATLaS.",
    connect: "Connect your agent",
    playground: "Try the playground",
    steps: [
      ["plug", "Connect", "One URL in any MCP client."],
      ["chat", "Ask", "Describe the feature in plain words."],
      ["verified", "Verified", "Real N-ATLaS output, proven on your route."],
    ],
    setup: "Connect in one step",
    live: "Live",
    app: "Your app calls a standard API",
    replay: "Replay of real runs on 11 October 2026. Request ids and timings are from the live logs.",
  },
  ha: {
    sub: "Haɗa kowane wakilin coding. Nemi fasali da Hausa, Igbo ko Yarbanci. A gina shi kuma a tabbatar da shi da N-ATLaS na gaske.",
    connect: "Haɗa wakilinka",
    playground: "Gwada a nan",
    steps: [
      ["plug", "Haɗa", "Adireshi ɗaya a kowane MCP client."],
      ["chat", "Tambaya", "Faɗi abin da kake so da sauƙi."],
      ["verified", "An tabbatar", "Amsar N-ATLaS ta gaske, a kan hanyarka."],
    ],
    setup: "Haɗa a mataki ɗaya",
    live: "Kai tsaye",
    app: "Manhajarka tana amfani da API na yau da kullum",
    replay: "Maimaicin aiki na gaske, 11 Oktoba 2026. Lambobin buƙata daga bayanan gaske ne.",
  },
} as const;

function clients(mcp: string): [string, string][] {
  return [
    ["Claude Code", `claude mcp add --transport http atlas-one ${mcp}`],
    ["Codex", `codex mcp add atlas-one --url ${mcp}`],
    ["Cursor", `{ "mcpServers": { "atlas-one": { "url": "${mcp}" } } }`],
    ["VS Code", `{ "servers": { "atlas-one": { "type": "http", "url": "${mcp}" } } }`],
    ["Windsurf", `{ "mcpServers": { "atlas-one": { "serverUrl": "${mcp}" } } }`],
    ["Gemini CLI", `{ "mcpServers": { "atlas-one": { "httpUrl": "${mcp}" } } }`],
    ["Any other MCP client", `${mcp}

# Streamable HTTP + OAuth. Add it as a remote server; your client opens the sign-in.`],
  ];
}

function appCode(api: string): [string, string][] {
  return [
    [
      "curl",
      `curl ${api}/chat/completions \\
  -H "authorization: Bearer $ATLAS_ONE_API_KEY" \\
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

/** The replay: an actual Claude Code session against Atlas One (atlas-one.log, 2026-10-11). */
const REPLAY: [kind: "you" | "call" | "out" | "ok", text: string][] = [
  ["you", "Add a Hausa customer-support route powered by N-ATLaS, and test it."],
  ["call", 'atlas_discover(recipe: "nextjs")'],
  ["out", "backend ready · NCAIR1/N-ATLaS@e294476 · llama.cpp b11552"],
  ["call", 'atlas_bind_project(name: "Hausa Support Demo")'],
  ["out", "Open the link to confirm your key. The key never passes through the agent."],
  ["call", "Write lib/atlas.ts, app/api/support/route.ts (+3 files)"],
  ["call", 'atlas_test(action: "inference", language: "ha")'],
  ["out", "“Babban birnin Najeriya Abuja ne.” · 1,110 ms · req_91d6bec6fdbd…"],
  ["call", 'atlas_test(action: "issue_app_nonce")'],
  ["out", "nonce issued · single use · 10 min"],
  ["call", "POST /api/support  (with x-atlas-verify)"],
  ["out", "200 · Hausa answer · req_714d166c7015…"],
  ["call", 'atlas_test(action: "verify_app")'],
  ["out", "verified: true · same request id req_714d166c7015…"],
  ["ok", "Done. Your route reached genuine N-ATLaS. Powered by Awarri."],
];

const CSS = `
:root{--bg:#fff;--fg:#0b0b0c;--mute:#5e6470;--faint:#8a8f98;--line:rgba(0,0,0,.08);--soft:#f6f6f7;--acc:#0a8f4e;--term:#0b0b0c;--termfg:#e6e6e8}
@media(prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#ededef;--mute:#9a9fa8;--faint:#6b7079;--line:rgba(255,255,255,.08);--soft:#111113;--acc:#2bd47d;--term:#111113;--termfg:#e6e6e8}}
*{box-sizing:border-box;margin:0}html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--fg);font:16px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:inherit;text-decoration:none}
.w{max-width:1080px;margin:0 auto;padding:0 24px}
.i{width:20px;height:20px;flex:none}
code,pre,.mono{font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
nav{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:650;letter-spacing:-.01em}
.navr{display:flex;align-items:center;gap:22px;font-size:14px;color:var(--mute)}.navr a:hover{color:var(--fg)}
.st{display:inline-flex;align-items:center;gap:8px}.dot{width:7px;height:7px;border-radius:50%;background:var(--faint)}
.st.ready .dot{background:var(--acc)}.st.waking .dot,.st.loading .dot{background:#d99a1e;animation:b 1.2s infinite}@keyframes b{50%{opacity:.25}}
.hero{padding:88px 0 40px}
h1{font-size:clamp(40px,6.2vw,76px);line-height:1.02;letter-spacing:-.04em;font-weight:680;max-width:14ch}
.sub{margin-top:20px;font-size:clamp(17px,1.6vw,20px);color:var(--mute);max-width:56ch}
.cta{display:flex;gap:12px;margin-top:32px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:10px;font-weight:550;font-size:15px;border:1px solid var(--line);transition:transform .15s,background .15s}
.btn:hover{transform:translateY(-1px)}.btn.p{background:var(--fg);color:var(--bg);border-color:var(--fg)}.btn .i{width:16px;height:16px}
.term{margin-top:56px;background:var(--term);color:var(--termfg);border-radius:14px;border:1px solid var(--line);overflow:hidden}
.th{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07);font-size:12.5px;color:#8a8f98}
.th button{all:unset;cursor:pointer;color:#8a8f98}.th button:hover{color:#e6e6e8}
.tb{padding:20px 22px 24px;font-size:13.5px;line-height:1.75;min-height:430px}
.ln{display:flex;gap:12px;opacity:0;transform:translateY(4px);transition:opacity .35s,transform .35s}.ln.on{opacity:1;transform:none}
.ln .m{width:14px;flex:none;color:#6b7079}.ln.you{color:#fff;margin-bottom:10px}.ln.you .m{color:#2bd47d}
.ln.call .m{color:#2bd47d}.ln.out{color:#8a8f98;padding-left:26px}.ln.ok{margin-top:10px;color:#2bd47d}
.cap{margin-top:12px;font-size:13px;color:var(--faint)}
.works{display:flex;flex-wrap:wrap;gap:10px 28px;margin-top:40px;color:var(--faint);font-size:14px;font-weight:550;letter-spacing:.01em}
section{padding:88px 0 0}
h2{font-size:clamp(26px,3vw,34px);letter-spacing:-.025em;font-weight:650;line-height:1.15}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.steps>div{background:var(--bg);padding:28px 24px 30px}.steps .i{width:24px;height:24px;color:var(--acc)}
.steps h3{margin-top:18px;font-size:17px;font-weight:600;letter-spacing:-.01em}.steps p{margin-top:4px;color:var(--mute);font-size:15px}
.tabs{display:inline-flex;gap:2px;padding:3px;background:var(--soft);border:1px solid var(--line);border-radius:10px;margin-top:24px;flex-wrap:wrap}
.tabs button{all:unset;cursor:pointer;padding:7px 13px;border-radius:7px;font-size:13.5px;font-weight:550;color:var(--mute)}
.tabs button[aria-selected=true]{background:var(--bg);color:var(--fg);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.code{position:relative;margin-top:12px;background:var(--soft);border:1px solid var(--line);border-radius:12px}
.code pre{padding:18px 56px 18px 18px;font-size:13px;line-height:1.7;overflow-x:auto;white-space:pre}
.cp{all:unset;cursor:pointer;color:var(--faint);padding:6px;border-radius:6px}.code .cp{position:absolute;top:10px;right:10px}.cp:hover{color:var(--fg)}
.off{margin-top:20px;font-size:15px;color:var(--mute)}
.note{margin-top:12px;font-size:14px;color:var(--mute)}
.nums{display:grid;grid-template-columns:repeat(4,1fr);margin-top:28px;border-top:1px solid var(--line)}
.nums div{padding:22px 0 0}.nums b{display:block;font-size:clamp(28px,3.4vw,40px);letter-spacing:-.03em;font-weight:650}.nums span{font-size:13.5px;color:var(--mute)}
#wake{margin-top:28px}#wake-steps{list-style:none;padding:0;display:grid;gap:6px;font-size:14.5px}
#wake-steps li{display:flex;gap:10px;align-items:center;color:var(--faint)}#wake-steps li::before{content:"";width:8px;height:8px;border-radius:50%;border:1.5px solid var(--faint);flex:none}
#wake-steps li.done{color:var(--fg)}#wake-steps li.done::before{background:var(--acc);border-color:var(--acc)}
#wake-steps li.current{color:var(--fg);font-weight:550}#wake-steps li.current::before{border-color:#d99a1e;background:#d99a1e;animation:b 1.2s infinite}
#wake-elapsed{font-size:13px;color:var(--faint);margin-top:8px}
footer{margin-top:112px;padding:32px 0 48px;border-top:1px solid var(--line);font-size:13.5px;color:var(--faint)}
footer .row{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}footer a:hover{color:var(--fg)}
footer .links{display:flex;gap:20px}
@media(max-width:760px){.steps{grid-template-columns:1fr}.nums{grid-template-columns:repeat(2,1fr);row-gap:8px}.navr .hide{display:none}.hero{padding-top:56px}.tb{font-size:12.5px;min-height:520px}}
@media(prefers-reduced-motion:reduce){.ln{opacity:1;transform:none;transition:none}}
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
  var pre=c.parentElement.querySelector("pre:not([hidden])")||c.parentElement.querySelector("pre");
  navigator.clipboard.writeText(pre.textContent); var t=c.innerHTML; c.innerHTML=${JSON.stringify(ICONS.tick)}; setTimeout(function(){c.innerHTML=t},1200);
})});
(function(){
  var lines=document.querySelectorAll(".ln"), reduce=matchMedia("(prefers-reduced-motion: reduce)").matches, timer;
  function play(){
    clearTimeout(timer); lines.forEach(function(l){l.classList.remove("on")});
    if(reduce){lines.forEach(function(l){l.classList.add("on")});return}
    var i=0;(function next(){ if(i>=lines.length)return; var l=lines[i++]; l.classList.add("on");
      timer=setTimeout(next, l.classList.contains("you")?900:l.classList.contains("call")?650:900); })();
  }
  var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){play();io.disconnect()}},{threshold:.3});
  io.observe(document.querySelector(".term"));
  document.getElementById("replay").addEventListener("click",play);
})();
`;

export function homePage(origin: string, status: PublicStatus, lang: Lang = "en"): Response {
  const t = T[lang];
  const mcp = `${origin}/mcp`;
  const api = `${origin}/v1`;
  const stateText = { ready: "N-ATLaS is online", waking: "Waking N-ATLaS", loading: "N-ATLaS is starting", offline: "N-ATLaS is asleep" }[status.backend];
  const tab = (group: string, items: [string, string][]) =>
    `<div class="tabs" role="tablist" data-tabs="${group}">${items
      .map(([name], i) => `<button role="tab" aria-selected="${i === 0}">${esc(name)}</button>`)
      .join("")}</div>
    <div class="code"><button class="cp" aria-label="Copy">${ICONS.copy}</button>${items
      .map(([, code], i) => `<pre data-pane="${group}"${i ? " hidden" : ""}>${esc(code)}</pre>`)
      .join("")}</div>`;

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atlas One · N-ATLaS, one instruction away</title>
<meta name="description" content="Connect any coding agent to genuine N-ATLaS. Ask for a Hausa, Igbo or Yoruba feature; get it built and verified.">
<meta name="theme-color" content="#09090b" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;550;600;650;680&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="w">
<nav>
  <a class="brand" href="/">Atlas One</a>
  <div class="navr">
    <span class="st ${status.backend}" id="status-line"><span class="dot"></span><span id="status-pill">${esc(stateText)}</span></span>
    <a class="hide" href="/playground">Playground</a>
    <a class="hide" href="https://github.com/agapemiteu/atlasone">GitHub</a>
    <a href="${lang === "en" ? "/?lang=ha" : "/"}" aria-label="Language">${lang === "en" ? "Hausa" : "English"}</a>
  </div>
</nav>

<header class="hero">
  <h1>N-ATLaS, one instruction away.</h1>
  <p class="sub">${esc(t.sub)}</p>
  <div class="cta">
    <a class="btn p" href="#connect">${esc(t.connect)} ${ICONS.arrow}</a>
    <a class="btn" href="/playground">${esc(t.playground)}</a>
  </div>
  <div class="term" role="img" aria-label="Replay of a coding agent integrating N-ATLaS through Atlas One">
    <div class="th"><span class="mono">claude · atlas-demo-shop</span><button id="replay" type="button">Replay</button></div>
    <div class="tb mono">${REPLAY.map(
      ([kind, text]) => `<div class="ln ${kind}"><span class="m">${kind === "you" ? "›" : kind === "call" ? "⏺" : kind === "ok" ? "✓" : "⎿"}</span><span>${esc(text)}</span></div>`,
    ).join("")}</div>
  </div>
  <p class="cap">${esc(t.replay)}</p>
  <div class="works"><span>Claude Code</span><span>Codex</span><span>Cursor</span><span>VS Code</span><span>Windsurf</span><span>Gemini CLI</span><span>any MCP client</span></div>
</header>

<section>
  <div class="steps">${t.steps
    .map(([icon, title, line]) => `<div>${ICONS[icon as keyof typeof ICONS]}<h3>${esc(title)}</h3><p>${esc(line)}</p></div>`)
    .join("")}</div>
</section>

<section id="connect">
  <h2>${esc(t.setup)}</h2>
  ${tab("clients", clients(mcp))}
  <p class="note">Approve the permissions, sign in with GitHub. Invite-only during the NAIC 2026 beta.</p>
</section>

<section>
  <h2>${esc(t.live)}</h2>
  <div class="nums">
    <div><b>~4 min</b><span>asleep to online, on demand</span></div>
    <div><b>1.1 s</b><span>Hausa answer, warm</span></div>
    <div><b>4</b><span>languages: en, ha, ig, yo</span></div>
    <div><b>true</b><span>verify_app on a real route</span></div>
  </div>
  ${status.backend === "offline" ? `<p class="off">Asleep to save GPU hours. It wakes automatically on your first request, and you see each stage; until then you get a clear error, never a fake answer.</p>` : ""}
  ${statusWidget(status)}
</section>

<section>
  <h2>${esc(t.app)}</h2>
  ${tab("app", appCode(api))}
  <p class="note">Every response carries <code>x-atlas-request-id</code> and the exact N-ATLaS revision. Keys stay server-side.</p>
</section>

<footer><div class="row">
  <span>N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.</span>
  <span class="links"><a href="https://huggingface.co/NCAIR1/N-ATLaS">Licence</a><a href="/tokens">Tokens</a><a href="https://github.com/agapemiteu/atlasone">GitHub</a><span>NAIC 2026 · PS1</span></span>
</div></footer>
</div>
<script>${JS}</script>
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
