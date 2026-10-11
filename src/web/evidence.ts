// Beta evidence for the NAIC judges (PRD Test 3 and Test 6): the public /evidence page and /evidence.json,
// built live from the activity log, and the signed-in /feedback questionnaire. Metadata only.

import { buildEvidence, type Evidence, type TesterEvidence } from "../lib/activity.ts";
import { checkCsrf, csrfToken, type Session } from "../lib/session.ts";
import { esc, messagePage, page } from "./html.ts";

export const AGENTS = ["Claude Code", "Codex", "Cursor", "VS Code", "Windsurf", "Gemini CLI", "Other"] as const;

const LIMITS = { stack: 80, manual_steps: 1000, issues: 2000 } as const;

const WIDE = "<style>main{max-width:1040px}td,th{font-size:.88rem}td small{color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}.grid div{border:1px solid var(--line);border-radius:12px;padding:14px}.grid b{display:block;font-size:1.6rem;letter-spacing:-.02em}</style>";

const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "–");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function milestone(m: TesterEvidence["first_inference"]): string {
  if (!m) return "–";
  const mins = m.minutes_after_connect === null ? "" : `<br><small>${m.minutes_after_connect} min after connecting</small>`;
  return `<code>${esc(m.request_id)}</code>${mins}`;
}

function testerRow(t: TesterEvidence): string {
  const name = t.profile ? `<a href="${esc(t.profile)}">${esc(t.tester)}</a>` : esc(t.tester);
  const fb = t.feedback
    ? `${t.feedback.rating}/5 · ${esc(t.feedback.agent)} · ${esc(t.feedback.stack)}${t.feedback.minutes === null ? "" : ` · ${t.feedback.minutes} min`}` +
      (t.feedback.issues ? `<br><small>${esc(t.feedback.issues)}</small>` : "")
    : "–";
  const errors = Object.entries(t.tool_errors).map(([code, n]) => `${code} ×${n}`).join(", ");
  return `<tr><td>${name}${t.team ? " <small>(team)</small>" : ""}<br><small>${esc(t.agents.join(", ") || "–")}</small></td>
<td>${when(t.connected_at)}</td><td>${milestone(t.first_inference)}</td><td>${milestone(t.app_verified)}</td>
<td>${plural(t.tool_calls, "call")}${errors ? `<br><small>${esc(errors)}</small>` : ""}</td><td>${fb}</td></tr>`;
}

export function renderEvidence(e: Evidence): Response {
  const s = e.summary;
  const stat = (v: number | null, label: string, unit = "") => `<div><b>${v === null ? "–" : `${v}${unit}`}</b><span class="muted">${label}</span></div>`;
  const body = `${WIDE}<div class="card"><h1>Beta evidence</h1>
<p class="muted">Live from the Atlas One database, generated ${when(e.generated_at)}. Every tester signed in with their own GitHub
account and their own coding agent; Atlas One records metadata only (never prompts, code or keys). Request ids match the
<code>x-atlas-request-id</code> header on the real N-ATLaS responses. Machine-readable: <a href="/evidence.json">/evidence.json</a>.</p>
<div class="grid">
${stat(s.external_testers, "external testers")}
${stat(s.external_with_real_inference, "ran real N-ATLaS")}
${stat(s.external_with_verified_app, "verified their app")}
${stat(s.median_minutes_to_first_inference, "median to first inference", " min")}
${stat(s.median_minutes_to_verified_app, "median to verified app", " min")}
${stat(s.average_rating, `average rating (${plural(s.feedback_responses, "response")})`, "/5")}
</div>
<div style="overflow-x:auto"><table><tr><th>Tester · agent</th><th>Connected</th><th>First real inference</th><th>App verified</th><th>Tool calls</th><th>Feedback</th></tr>
${e.testers.map(testerRow).join("") || '<tr><td colspan="6" class="muted">No testers yet.</td></tr>'}</table></div>
<p class="muted">Times are measured by Atlas One from the tester's first sign-in. "Team" rows are the Atlas One team and are excluded from the summary.</p></div>`;
  return page("Beta evidence", body);
}

export async function evidenceResponse(db: D1Database, team: string[], json: boolean): Promise<Response> {
  const evidence = await buildEvidence(db, team);
  if (!json) return renderEvidence(evidence);
  return Response.json(evidence, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
}

function feedbackForm(csrf: string, session: Session, prior: Record<string, string | number | null> | null, error = ""): string {
  const v = (k: string) => esc(String(prior?.[k] ?? ""));
  const agentOptions = AGENTS.map((a) => `<option${prior?.agent === a ? " selected" : ""}>${a}</option>`).join("");
  const ratings = [1, 2, 3, 4, 5]
    .map((n) => `<label style="margin-right:14px"><input type="radio" name="rating" value="${n}" required${prior?.rating === n ? " checked" : ""}> ${n}</label>`)
    .join("");
  return `<div class="card"><h1>How did it go?</h1>
<p class="muted">Two minutes. Signed in as @${esc(session.login)}. Your answers appear on the public <a href="/evidence">evidence page</a> for the NAIC 2026 judges.</p>
${error ? `<p class="warn">${esc(error)}</p>` : ""}
<form method="post" style="display:grid;gap:14px">
<input type="hidden" name="csrf" value="${csrf}">
<label>Agent you used<br><select name="agent" required>${agentOptions}</select></label>
<label>Your app's stack (e.g. Next.js, Express, FastAPI)<br><input name="stack" required maxlength="${LIMITS.stack}" value="${v("stack")}" style="width:100%"></label>
<label>Minutes from connecting to a verified feature<br><input name="minutes" type="number" min="0" max="1440" value="${v("minutes")}"></label>
<label>Manual steps you had to do yourself<br><textarea name="manual_steps" maxlength="${LIMITS.manual_steps}" rows="3" style="width:100%">${v("manual_steps")}</textarea></label>
<label>Anything confusing, broken, or wrong in the N-ATLaS answers<br><textarea name="issues" maxlength="${LIMITS.issues}" rows="3" style="width:100%">${v("issues")}</textarea></label>
<div>Would you use Atlas One again? (1 = no, 5 = definitely)<br>${ratings}</div>
<label><input type="checkbox" name="anonymous"${prior?.anonymous === 1 ? " checked" : ""}> Show me as anonymous on the evidence page</label>
<div class="row"><button class="primary">Send feedback</button></div>
</form></div>`;
}

const text = (form: FormData, k: keyof typeof LIMITS) => String(form.get(k) ?? "").trim().slice(0, LIMITS[k]);

export async function feedbackPage(request: Request, db: D1Database, secret: string, session: Session): Promise<Response> {
  const purpose = "feedback";
  const csrf = await csrfToken(secret, session, purpose);
  const prior = await db
    .prepare("SELECT agent, stack, minutes, manual_steps, issues, rating, anonymous FROM feedback WHERE github_id = ?")
    .bind(session.githubId)
    .first<Record<string, string | number | null>>();
  if (request.method !== "POST") return page("Feedback", feedbackForm(csrf, session, prior));

  const form = await request.formData();
  if (!(await checkCsrf(secret, session, purpose, form.get("csrf")))) {
    return messagePage("Request blocked", "This form expired or did not come from Atlas One. Reload the page.", 403);
  }
  const agent = String(form.get("agent") ?? "");
  const rating = Number(form.get("rating"));
  const minutesRaw = String(form.get("minutes") ?? "").trim();
  const minutes = minutesRaw === "" ? null : Number(minutesRaw);
  const entry = {
    agent,
    stack: text(form, "stack"),
    minutes,
    manual_steps: text(form, "manual_steps"),
    issues: text(form, "issues"),
    rating,
    anonymous: form.get("anonymous") ? 1 : 0,
  };
  const invalid =
    !(AGENTS as readonly string[]).includes(agent) ? "Pick the agent you used." :
    !entry.stack ? "Tell us your app's stack." :
    !Number.isInteger(rating) || rating < 1 || rating > 5 ? "Pick a rating from 1 to 5." :
    minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) ? "Minutes must be a whole number from 0 to 1440." :
    "";
  if (invalid) return page("Feedback", feedbackForm(csrf, session, entry, invalid), { status: 400 });

  await db
    .prepare(
      `INSERT INTO feedback (github_id, login, submitted_at, agent, stack, minutes, manual_steps, issues, rating, anonymous)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (github_id) DO UPDATE SET login = excluded.login, submitted_at = excluded.submitted_at, agent = excluded.agent,
         stack = excluded.stack, minutes = excluded.minutes, manual_steps = excluded.manual_steps, issues = excluded.issues,
         rating = excluded.rating, anonymous = excluded.anonymous`,
    )
    .bind(session.githubId, session.login, Date.now(), agent, entry.stack, minutes, entry.manual_steps, entry.issues, rating, entry.anonymous)
    .run();
  return page("Thank you", `<div class="card"><h1>Thank you</h1><p>Your feedback is recorded. See it with everyone's results on the
<a href="/evidence">evidence page</a>. You can update it any time from <a href="/feedback">/feedback</a>.</p></div>`);
}
