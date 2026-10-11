// Browser playground (a PS1 example solution): signed-in developers send one prompt in English, Hausa,
// Igbo or Yoruba and see genuine N-ATLaS output with its provenance. It runs through the same
// runInference path as apps and atlas_test, against the developer's own "Playground" project, so it is
// quota-limited and logged like any other request. Failures are shown as-is; nothing is simulated.

import { getBackend } from "../lib/backend.ts";
import { MODEL_CARD, MODEL_ID } from "../lib/chat.ts";
import { AtlasError, toErrorBody } from "../lib/errors.ts";
import { newRequestId, runInference } from "../lib/inference.ts";
import { checkCsrf, csrfToken, type Session } from "../lib/session.ts";
import { type Language, PROBES } from "../tools/test.ts";
import { esc, messagePage, page } from "./html.ts";

export interface PlaygroundDeps {
  db: D1Database;
  fetcher: typeof fetch;
  upstreamKey: string;
  waitUntil: (p: Promise<unknown>) => void;
  sessionSecret: string;
}

const LANGS: Record<Language, string> = { en: "English", ha: "Hausa", ig: "Igbo", yo: "Yoruba" };
const MAX_PROMPT = 2_000;

async function playgroundProject(db: D1Database, owner: string): Promise<string> {
  await db
    .prepare("INSERT OR IGNORE INTO projects (id, owner_github_id, name, slug, created_at) VALUES (?, ?, 'Playground', 'playground', ?)")
    .bind(crypto.randomUUID(), owner, Date.now())
    .run();
  const row = await db.prepare("SELECT id FROM projects WHERE owner_github_id = ? AND slug = 'playground'").bind(owner).first<{ id: string }>();
  return row!.id;
}

function form(csrf: string, lang: Language, prompt: string, state: string) {
  const options = (Object.keys(LANGS) as Language[])
    .map((l) => `<option value="${l}" ${l === lang ? "selected" : ""}>${LANGS[l]}</option>`)
    .join("");
  return `<div class="card"><h1>Playground</h1>
<p class="muted">Backend: <strong>${esc(state)}</strong>. Each run uses your Playground project quota (30/min, 500/day).</p>
<form method="post">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<p><label>Reply language <select name="lang">${options}</select></label></p>
<p><textarea name="prompt" rows="4" maxlength="${MAX_PROMPT}" style="width:100%;font:inherit;padding:8px" placeholder="${esc(PROBES[lang].user)}">${esc(prompt)}</textarea></p>
<div class="row"><button class="primary">Send to N-ATLaS</button></div></form></div>`;
}

export async function playgroundPage(request: Request, deps: PlaygroundDeps, session: Session): Promise<Response> {
  const csrf = await csrfToken(deps.sessionSecret, session, "playground");
  const backend = await getBackend(deps.db, deps.fetcher);
  if (request.method !== "POST") return page("Playground", form(csrf, "ha", "", backend.state));

  const data = await request.formData();
  if (!(await checkCsrf(deps.sessionSecret, session, "playground", data.get("csrf")))) {
    return messagePage("Request blocked", "This form expired or did not come from Atlas One. Reload the page.", 403);
  }
  const lang = (Object.keys(LANGS).includes(String(data.get("lang"))) ? String(data.get("lang")) : "ha") as Language;
  const prompt = String(data.get("prompt") ?? "").trim().slice(0, MAX_PROMPT) || PROBES[lang].user;
  const requestId = newRequestId();

  let result: string;
  try {
    const projectId = await playgroundProject(deps.db, session.githubId);
    const r = await runInference(
      { db: deps.db, fetcher: deps.fetcher, upstreamKey: deps.upstreamKey, waitUntil: deps.waitUntil, projectId, keyId: null, source: "atlas_test", requestId },
      {
        model: MODEL_ID,
        messages: [
          { role: "system", content: PROBES[lang].system },
          { role: "user", content: prompt },
        ],
        max_tokens: 256,
        stream: false,
      },
    );
    result = `<div class="card"><h1>N-ATLaS replied</h1>
<pre style="white-space:pre-wrap">${esc(r.completion!.content)}</pre>
<p class="muted">${esc(MODEL_CARD.attribution)}</p>
<table>
<tr><td>request_id</td><td><code>${esc(requestId)}</code></td></tr>
<tr><td>weights</td><td><code>${esc(`${r.upstream.model_id}@${r.upstream.model_revision}`)}</code></td></tr>
<tr><td>runtime</td><td><code>${esc(r.upstream.runtime)}</code></td></tr>
<tr><td>latency</td><td>${r.latencyMs} ms total, ${r.upstreamMs} ms in the model server</td></tr>
<tr><td>tokens</td><td>${r.completion!.usage.prompt_tokens ?? "?"} in, ${r.completion!.usage.completion_tokens ?? "?"} out</td></tr>
</table></div><p></p>`;
  } catch (err) {
    const e = toErrorBody(err instanceof AtlasError ? err : new AtlasError("INTERNAL"), requestId);
    result = `<div class="card"><h1>No answer</h1><p><code>${esc(e.code)}</code>: ${esc(e.message)}</p>
<p class="muted">request_id <code>${esc(requestId)}</code>. Atlas One never shows a substitute answer.</p></div><p></p>`;
  }
  return page("Playground", result + form(csrf, lang, prompt, backend.state));
}
