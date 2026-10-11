// Public, read-only backend status (no secrets, no requester identity), shared by GET /api/status, the
// home page and the playground. While N-ATLaS wakes, pages poll it and render each observed stage.

import { getBackend } from "../lib/backend.ts";
import {
  checkKaggleRun,
  type KaggleConfig,
  latestWake,
  STAGE_TEXT,
  WAKE_STAGES,
  type WakeStage,
  wakeInFlight,
} from "../lib/wake.ts";
import { esc } from "./html.ts";

export interface PublicStatus {
  gateway: "ok";
  backend: "ready" | "loading" | "offline" | "waking";
  stage: WakeStage | null;
  stage_text: string | null;
  detail: string | null;
  wake_started_at: string | null;
  updated_at: string | null;
  stages: { id: string; text: string; done: boolean; current: boolean }[];
  /** The most recent wake failed within the last 30 minutes, with its reason. */
  last_failure: string | null;
}

export async function publicStatus(db: D1Database, fetcher: typeof fetch, kaggle: KaggleConfig | null = null): Promise<PublicStatus> {
  await checkKaggleRun(db, fetcher, kaggle); // a dead Kaggle run shows as failed, not "waking" forever
  const [backend, wake] = await Promise.all([getBackend(db, fetcher), latestWake(db)]);
  const waking = backend.state !== "ready" && wakeInFlight(wake);
  const current = backend.state === "ready" ? WAKE_STAGES.length - 1 : waking ? WAKE_STAGES.indexOf(wake!.stage as never) : -1;
  return {
    gateway: "ok",
    backend: waking ? "waking" : backend.state,
    stage: waking || backend.state === "ready" ? (wake?.stage ?? null) : null,
    stage_text: waking ? STAGE_TEXT[wake!.stage] : null,
    detail: waking ? (wake!.detail ?? null) : null,
    wake_started_at: waking ? new Date(wake!.requested_at).toISOString() : null,
    updated_at: wake ? new Date(wake.updated_at).toISOString() : null,
    last_failure:
      backend.state !== "ready" && wake?.stage === "failed" && Date.now() - wake.updated_at < 30 * 60_000 ? (wake.detail ?? "unknown error") : null,
    stages: WAKE_STAGES.map((id, i) => ({ id, text: STAGE_TEXT[id], done: i < current || (i === current && id === "ready"), current: i === current && id !== "ready" })),
  };
}

/** Progress list markup plus a small poller that refreshes it until N-ATLaS is online. */
export function statusWidget(s: PublicStatus): string {
  const steps = s.stages
    .map((st) => `<li data-stage="${st.id}" class="${st.done ? "done" : st.current ? "current" : ""}">${esc(st.text)}</li>`)
    .join("");
  return `<style>
#wake-steps{list-style:none;padding:0;margin:10px 0}#wake-steps li{padding:3px 0 3px 22px;position:relative;color:var(--muted)}
#wake-steps li::before{content:"○";position:absolute;left:0}#wake-steps li.done{color:var(--fg)}#wake-steps li.done::before{content:"✓";color:var(--accent)}
#wake-steps li.current{color:var(--fg);font-weight:600}#wake-steps li.current::before{content:"●";color:#b7791f;animation:p 1s infinite}
@keyframes p{50%{opacity:.3}}
</style>
<div id="wake" ${s.backend === "waking" ? "" : 'hidden'}><ol id="wake-steps">${steps}</ol><p class="muted" id="wake-elapsed"></p></div>
<script>
(function(){
  var started=${JSON.stringify(s.wake_started_at)};
  function tick(){
    fetch("/api/status",{cache:"no-store"}).then(function(r){return r.json()}).then(function(s){
      var box=document.getElementById("wake"); var pill=document.getElementById("status-pill");
      if(s.backend==="waking"){box.hidden=false;started=s.wake_started_at;}
      s.stages.forEach(function(st){var li=document.querySelector('#wake-steps li[data-stage="'+st.id+'"]'); if(li) li.className=st.done?"done":st.current?"current":"";});
      if(pill){pill.textContent="● "+(s.backend==="ready"?"N-ATLaS is online":s.backend==="waking"?"Waking N-ATLaS: "+s.stage_text:s.backend==="loading"?"N-ATLaS is starting":s.last_failure?"Last wake-up failed: "+s.last_failure:"N-ATLaS is asleep");
        pill.className="pill "+(s.backend==="ready"?"ok":s.backend==="offline"?"off":"warn");}
      if(s.backend!=="ready") setTimeout(tick,4000); else if(box) setTimeout(function(){box.hidden=true},4000);
    }).catch(function(){setTimeout(tick,8000)});
    if(started){var sec=Math.round((Date.now()-Date.parse(started))/1000);var e=document.getElementById("wake-elapsed");if(e)e.textContent="Started "+sec+"s ago. Cold starts take about 4-5 minutes on free GPUs.";}
  }
  ${s.backend === "ready" ? "" : "tick();"}
})();
</script>`;
}
