// Home page. Shows instead of tells: an animated replay of a real run (agent on the left, the app it
// built answering on the right), one-URL setup, use cases with copyable instructions, live backend state.
// Every model output shown is verbatim from the 11 Oct 2026 run (atlas-one.log, docs/NATLAS-INTEGRATION.md).

import { esc } from "./html.ts";
import { ICONS } from "./icons.ts";
import { type PublicStatus, statusWidget } from "./status.ts";
import { clientSnippets, codeTabs, REPO, shell } from "./theme.ts";

type Lang = "en" | "ha";

const T = {
  en: {
    h1: "Nigerian languages in your app, one instruction away.",
    sub: "Connect your coding agent to Atlas One. Ask for a Hausa, Igbo or Yoruba feature. It is built, tested and verified on genuine N-ATLaS.",
    connect: "Connect your agent",
    docs: "Read the docs",
    cases: "What developers build",
    setup: "Add one URL. That is the setup.",
    setupNote: "Your client opens a sign-in. Approve the permissions, sign in with GitHub, then ask for a feature.",
    perClient: "Exact command per client",
    live: "Measured, not promised",
  },
  ha: {
    h1: "Harsunan Najeriya a manhajarka, umarni ɗaya kawai.",
    sub: "Haɗa wakilin coding ɗinka da Atlas One. Nemi fasali da Hausa, Igbo ko Yarbanci. Za a gina shi, a gwada shi, a tabbatar da shi da N-ATLaS na gaske.",
    connect: "Haɗa wakilinka",
    docs: "Karanta bayani",
    cases: "Abin da masu haɓakawa ke ginawa",
    setup: "Ƙara adireshi ɗaya. Shi ke nan.",
    setupNote: "Manhajarka za ta buɗe shiga. Amince da izini, shiga da GitHub, sannan ka nemi fasali.",
    perClient: "Umarni na kowane client",
    live: "An auna, ba alkawari ba",
  },
} as const;

// Verbatim from the live run: question sent to the demo app's /api/support, and N-ATLaS's answer.
const INSTRUCTION = "Add a Hausa customer-support route powered by N-ATLaS, and test it.";
const QUESTION = "Kuna kai kaya zuwa Abuja? Kuma za a iya biya idan an kawo?";
const ANSWER =
  "Eh, muna bayar da isarwa ga dukkan jihohi 36 cikin sa'o'i uku zuwa biyar na aiki. Don biyan kuɗi akan isarwa, " +
  'don Allah a tabbata kun zaɓi "Biya Lokacin Karɓa" a matsayin hanyar biyan kuɗi lokacin yin odar ku ta kan layi.';

const STEPS: [title: string, detail: string][] = [
  ["Read the N-ATLaS recipe", "atlas_discover · backend ready"],
  ["Create the project", "atlas_bind_project · you confirm the key in your browser"],
  ["Write the integration", "lib/atlas.ts · app/api/support/route.ts · +3 files"],
  ["Test N-ATLaS", "“Babban birnin Najeriya Abuja ne.” · 1,110 ms · req_91d6bec6fdbd…"],
  ["Verify the app route", "verified: true · req_714d166c7015…"],
];

const USE_CASES: [icon: keyof typeof ICONS, title: string, line: string, instruction: string, proven: boolean][] = [
  ["chat", "Customer support in Hausa", "Answers grounded in your own FAQ, from your own route.", INSTRUCTION, true],
  ["globe", "Order updates in Yoruba and Igbo", "Turn English notifications into the customer's language at send time.", "Add a function that rewrites our order-status messages in Yoruba or Igbo with N-ATLaS, based on the customer's language setting, and test it.", false],
  ["bolt", "Advice for farmers in their language", "A chat that explains your guides in Hausa, Igbo or Yoruba.", "Add an Igbo chat endpoint that answers farmers' questions using our crop guide in docs/, powered by N-ATLaS, and verify it.", false],
  ["shield", "Plain-language forms", "Explain each field of a form before people submit it.", "Add a 'Explain in my language' button to the sign-up form that explains each field in Hausa, Igbo or Yoruba using N-ATLaS.", false],
];

const CSS = `
.hero{padding:96px 0 0;text-align:center}
.hero h1{max-width:17ch;margin:0 auto}
.hero .lead{max-width:60ch;margin:22px auto 0}
.cta{display:flex;gap:12px;justify-content:center;margin-top:32px;flex-wrap:wrap}
.demo{margin-top:64px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);border:1px solid var(--line);border-radius:18px;overflow:hidden;text-align:left;background:var(--bg);box-shadow:0 1px 2px rgba(0,0,0,.04),0 30px 70px -30px rgba(15,23,42,.22)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:10px;height:42px;padding:0 16px;border-bottom:1px solid var(--line);background:var(--soft);font-size:12.5px;color:var(--faint)}
.bar button{all:unset;cursor:pointer;font-weight:550;color:var(--mute)}.bar button:hover{color:var(--fg)}
.agent{border-right:1px solid var(--line);background:#fcfcfd;display:flex;flex-direction:column}
.prompt{margin:20px 20px 6px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--bg);font-size:14.5px;min-height:76px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.prompt small{display:block;font-size:11.5px;color:var(--faint);font-weight:550;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
#typed::after{content:"";display:inline-block;width:2px;height:1.1em;background:var(--fg);margin-left:1px;vertical-align:-3px;animation:b 1s steps(1) infinite}
.demo.typed #typed::after{display:none}
.tasks{list-style:none;padding:10px 20px 22px;display:grid;gap:2px}
.tasks li{display:flex;gap:12px;padding:9px 0;opacity:.38;transition:opacity .3s}
.tasks li.run,.tasks li.done{opacity:1}
.tasks .ic{width:18px;height:18px;border-radius:50%;border:1.5px solid #c9ccd2;flex:none;margin-top:2px;position:relative}
.tasks li.run .ic{border-color:#d4d6db;border-top-color:var(--acc);animation:spin .8s linear infinite}
.tasks li.done .ic{background:var(--acc);border-color:var(--acc)}
.tasks li.done .ic::after{content:"";position:absolute;left:5px;top:2px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
@keyframes spin{to{transform:rotate(360deg)}}
.tasks b{display:block;font-size:14.5px;font-weight:600}
.tasks small{display:block;font-size:12.5px;color:var(--mute);max-height:0;overflow:hidden;transition:max-height .35s}
.tasks li.run small,.tasks li.done small{max-height:40px}
.app{display:flex;flex-direction:column;background:var(--bg)}
.url{flex:1;max-width:260px;height:24px;border-radius:6px;background:var(--bg);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--mute)}
.lights{display:flex;gap:6px}.lights i{width:10px;height:10px;border-radius:50%;background:#e2e3e6}
.shop{padding:26px 28px 28px;flex:1;position:relative}
.shop header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:14px}
.shop header b{font-size:18px;letter-spacing:-.02em}.shop header span{font-size:13px;color:var(--faint)}
.faq{margin-top:14px;display:grid;gap:10px;font-size:13.5px;color:var(--mute)}.faq b{color:var(--fg);font-weight:600;display:block}
.ask{margin-top:18px;border:1px solid var(--line);border-radius:14px;padding:16px;opacity:0;transform:translateY(10px);transition:opacity .5s,transform .5s;box-shadow:0 8px 24px -16px rgba(0,0,0,.2)}
.ask.in{opacity:1;transform:none}
.ask label{font-size:13px;font-weight:600}
.qrow{display:flex;gap:8px;margin-top:10px}
.q{flex:1;min-height:40px;border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-size:13.5px;background:var(--soft)}
.qb{height:40px;padding:0 14px;border-radius:9px;background:var(--fg);color:#fff;font-size:13.5px;font-weight:550;display:flex;align-items:center;transition:transform .1s}
.qb.press{transform:scale(.95);opacity:.8}
.ans{margin-top:12px;font-size:14px;line-height:1.6;min-height:22px}
.dots span{display:inline-block;width:6px;height:6px;margin-right:4px;border-radius:50%;background:var(--faint);animation:b 1s infinite}.dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}
.meta{margin-top:8px;font-size:12px;color:var(--faint);opacity:0;transition:opacity .4s}.meta.in{opacity:1}
.vf{position:absolute;left:28px;right:28px;bottom:20px;display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:12px;background:var(--accbg);color:var(--acc);font-size:13.5px;font-weight:600;opacity:0;transform:translateY(8px);transition:opacity .5s,transform .5s}
.vf.in{opacity:1;transform:none}.vf .i{width:18px;height:18px}
.shop{padding-bottom:84px}
.cap{margin-top:14px;font-size:13px;color:var(--faint);text-align:center}
.works{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 30px;margin-top:44px;color:var(--faint);font-size:14px;font-weight:550}
section{padding-top:120px}
.sh{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap}
.sh a{font-size:15px;font-weight:550;color:var(--acc);display:inline-flex;align-items:center;gap:4px}.sh a .i{width:16px;height:16px}
.cases{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:36px}
.case{border:1px solid var(--line);border-radius:16px;padding:24px;display:flex;flex-direction:column;gap:10px;transition:box-shadow .2s,border-color .2s}
.case:hover{border-color:#d6d7db;box-shadow:0 12px 30px -18px rgba(0,0,0,.2)}
.case>.i{width:24px;height:24px;color:var(--acc)}
.case p{color:var(--mute);font-size:15px}
.case .proven{font-size:12.5px;color:var(--acc);font-weight:600;display:flex;align-items:center;gap:5px}.case .proven .i{width:14px;height:14px}
.instr{margin-top:auto;display:flex;gap:8px;align-items:flex-start;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 8px 10px 12px;font-size:12.5px;line-height:1.55}
.instr span{flex:1}
.urlbox{margin-top:32px;display:flex;align-items:center;gap:12px;max-width:760px;padding:8px 8px 8px 20px;border:1px solid var(--line);border-radius:14px;background:var(--soft);box-shadow:inset 0 1px 2px rgba(0,0,0,.03)}
.urlbox .mono{flex:1;font-size:clamp(13px,1.6vw,17px);overflow-x:auto;white-space:nowrap}
.urlbox .cpy{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px;border-radius:10px;background:var(--fg);color:#fff;font-size:14px;font-weight:550}
.urlbox .cpy .i{width:16px;height:16px}
.note{margin-top:14px;font-size:15px;color:var(--mute)}
details{margin-top:28px}summary{cursor:pointer;font-size:15px;font-weight:550;color:var(--mute);list-style:none;display:inline-flex;align-items:center;gap:6px}
summary::-webkit-details-marker{display:none}summary .i{width:16px;height:16px;transition:transform .2s}details[open] summary .i{transform:rotate(90deg)}
details .tabs{margin-top:16px}
.nums{display:grid;grid-template-columns:repeat(4,1fr);margin-top:36px;border-top:1px solid var(--line)}
.nums div{padding:24px 16px 0 0}.nums b{display:block;font-size:clamp(30px,3.6vw,44px);letter-spacing:-.035em;font-weight:660}.nums span{font-size:14px;color:var(--mute)}
.off{margin-top:24px;font-size:15px;color:var(--mute)}
#wake{margin-top:28px}#wake-steps{list-style:none;padding:0;display:grid;gap:6px;font-size:14.5px}
#wake-steps li{display:flex;gap:10px;align-items:center;color:var(--faint)}#wake-steps li::before{content:"";width:8px;height:8px;border-radius:50%;border:1.5px solid var(--faint);flex:none}
#wake-steps li.done{color:var(--fg)}#wake-steps li.done::before{background:var(--acc);border-color:var(--acc)}
#wake-steps li.current{color:var(--fg);font-weight:550}#wake-steps li.current::before{border-color:var(--warn);background:var(--warn);animation:b 1.2s infinite}
#wake-elapsed{font-size:13px;color:var(--faint);margin-top:8px}
@media(max-width:860px){.demo{grid-template-columns:1fr}.agent{border-right:0;border-bottom:1px solid var(--line)}.cases{grid-template-columns:1fr}.nums{grid-template-columns:repeat(2,1fr);row-gap:8px}.hero{padding-top:64px}section{padding-top:88px}}
@media(max-width:520px){.shop{padding:20px 18px 84px}.vf{left:18px;right:18px}.urlbox{padding-left:14px}.urlbox .cpy span{display:none}}
`;

const SCRIPT = `
(function(){
  var demo=document.getElementById("demo"); if(!demo) return;
  var INS=${JSON.stringify(INSTRUCTION)}, Q=${JSON.stringify(QUESTION)}, A=${JSON.stringify(ANSWER)};
  var $=function(id){return document.getElementById(id)}, steps=demo.querySelectorAll(".tasks li"), run=0;
  var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  function wait(ms,id){return new Promise(function(ok,stop){setTimeout(function(){id===run?ok():stop()},ms)})}
  async function type(el,text,ms,id){for(var i=1;i<=text.length;i++){el.textContent=text.slice(0,i);await wait(ms,id)}}
  function mark(i,c){steps[i].className=c}
  function reset(){demo.classList.remove("typed");$("typed").textContent="";$("q").textContent="";$("ans").innerHTML="";
    steps.forEach(function(s){s.className=""});["ask","meta","vf"].forEach(function(k){$(k).classList.remove("in")})}
  function final(){reset();demo.classList.add("typed");$("typed").textContent=INS;steps.forEach(function(s){s.className="done"});
    $("q").textContent=Q;$("ans").textContent=A;["ask","meta","vf"].forEach(function(k){$(k).classList.add("in")})}
  async function play(){
    var id=++run; reset(); if(reduce){final();return}
    try{
      await wait(500,id); await type($("typed"),INS,26,id); demo.classList.add("typed"); await wait(450,id);
      var dur=[900,1300,1700];
      for(var i=0;i<3;i++){mark(i,"run");await wait(dur[i],id);mark(i,"done")}
      $("ask").classList.add("in"); await wait(500,id);
      mark(3,"run"); await wait(1110,id); mark(3,"done");
      mark(4,"run"); await wait(400,id); await type($("q"),Q,32,id); await wait(300,id);
      $("qb").classList.add("press"); await wait(160,id); $("qb").classList.remove("press");
      $("ans").innerHTML='<span class="dots"><span></span><span></span><span></span></span>'; await wait(1400,id);
      var words=A.split(" "); $("ans").textContent="";
      for(var w=0;w<words.length;w++){$("ans").textContent+=(w?" ":"")+words[w];await wait(55,id)}
      $("meta").classList.add("in"); await wait(500,id); mark(4,"done"); $("vf").classList.add("in");
    }catch(e){}
  }
  var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){play();io.disconnect()}},{threshold:.35});
  io.observe(demo); $("replay").addEventListener("click",play);
})();
`;

export function homePage(origin: string, status: PublicStatus, lang: Lang = "en"): Response {
  const t = T[lang];
  const mcp = `${origin}/mcp`;
  const stateText = { ready: "N-ATLaS is online", waking: "Waking N-ATLaS", loading: "N-ATLaS is starting", offline: "N-ATLaS is asleep" }[status.backend];

  const body = `<main class="w">
<header class="hero">
  <h1>${esc(t.h1)}</h1>
  <p class="lead">${esc(t.sub)}</p>
  <div class="cta"><a class="btn p" href="#connect">${esc(t.connect)} ${ICONS.arrow}</a><a class="btn" href="/docs">${esc(t.docs)}</a></div>

  <div class="demo" id="demo" role="img" aria-label="A coding agent adds a Hausa support route through Atlas One; the app then answers a customer in Hausa and the route is verified.">
    <div class="agent">
      <div class="bar"><span class="mono">your coding agent</span><button id="replay" type="button">Replay</button></div>
      <div class="prompt"><small>You</small><span id="typed"></span></div>
      <ol class="tasks">${STEPS.map(([title, detail]) => `<li><span class="ic"></span><div><b>${esc(title)}</b><small class="mono">${esc(detail)}</small></div></li>`).join("")}</ol>
    </div>
    <div class="app">
      <div class="bar"><span class="lights"><i></i><i></i><i></i></span><span class="url mono">localhost:3000</span><span style="width:42px"></span></div>
      <div class="shop">
        <header><b>Kano Fabrics</b><span>Customer support</span></header>
        <div class="faq"><p><b>Do you deliver outside Kano?</b>Yes. We deliver to all 36 states within 3 to 5 working days.</p><p><b>Can I pay on delivery?</b>Pay on delivery is available in Kano, Abuja and Lagos.</p></div>
        <div class="ask" id="ask">
          <label>Tambayi mataimakinmu</label>
          <div class="qrow"><div class="q" id="q"></div><span class="qb" id="qb">Tambaya</span></div>
          <div class="ans" id="ans"></div>
          <div class="meta mono" id="meta">Powered by Awarri · req_714d166c70154f5ba50b47d5</div>
        </div>
        <div class="vf" id="vf">${ICONS.verified}<span>verified: true · this answer came from genuine N-ATLaS</span></div>
      </div>
    </div>
  </div>
  <p class="cap">Real run, sped up. The question, the Hausa answer and the request ids are verbatim from 11 October 2026.</p>
  <div class="works"><span>Claude Code</span><span>Codex</span><span>Cursor</span><span>VS Code</span><span>Windsurf</span><span>Gemini CLI</span><span>Any MCP client</span></div>
</header>

<section id="connect">
  <h2>${esc(t.setup)}</h2>
  <div class="urlbox"><span class="mono" id="mcp-url">${esc(mcp)}</span><button class="cpy cp" data-copy="mcp-url" aria-label="Copy URL">${ICONS.copy}<span>Copy</span></button></div>
  <p class="note">${esc(t.setupNote)} Invite-only during the NAIC 2026 beta.</p>
  <details><summary>${ICONS.arrow}${esc(t.perClient)}</summary>${codeTabs("clients", clientSnippets(mcp))}</details>
</section>

<section id="use-cases">
  <div class="sh"><h2>${esc(t.cases)}</h2><a href="/docs">Docs ${ICONS.arrow}</a></div>
  <div class="cases">${USE_CASES.map(
    ([icon, title, line, instruction, proven], i) => `<article class="case">${ICONS[icon]}
      <h3>${esc(title)}</h3><p>${esc(line)}</p>
      ${proven ? `<span class="proven">${ICONS.tick}Built and verified live, shown above</span>` : ""}
      <div class="instr mono"><span id="uc${i}">${esc(instruction)}</span><button class="cp" data-copy="uc${i}" aria-label="Copy instruction">${ICONS.copy}</button></div>
    </article>`,
  ).join("")}</div>
</section>

<section>
  <h2>${esc(t.live)}</h2>
  <div class="nums">
    <div><b>~4 min</b><span>asleep to online, on demand</span></div>
    <div><b>1.1 s</b><span>Hausa answer, warm</span></div>
    <div><b>4</b><span>languages: en, ha, ig, yo</span></div>
    <div><b>true</b><span>verify_app on a real app route</span></div>
  </div>
  ${status.backend === "offline" ? `<p class="off">N-ATLaS is asleep to save GPU hours. It wakes automatically on your first request, and you see each stage. Until then you get a clear error, never a fake answer.</p>` : ""}
  ${statusWidget(status)}
</section>
</main>`;

  return shell({
    lang,
    title: "Atlas One · N-ATLaS, one instruction away",
    description: "Connect any coding agent to genuine N-ATLaS. Ask for a Hausa, Igbo or Yoruba feature; get it built, tested and verified.",
    navRight: `<span class="st ${status.backend}" id="status-line"><span class="dot"></span><span id="status-pill">${esc(stateText)}</span></span>
      <a class="hide" href="#use-cases">Use cases</a><a href="/docs">Docs</a><a class="hide" href="/playground">Playground</a>
      <a class="hide" href="${REPO}">GitHub</a><a href="${lang === "en" ? "/?lang=ha" : "/"}">${lang === "en" ? "Hausa" : "English"}</a>`,
    body,
    css: CSS,
    script: SCRIPT,
  });
}
