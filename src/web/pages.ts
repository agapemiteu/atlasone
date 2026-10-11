// Signed-in pages: confirm a claim link (D13, D16), manage personal access tokens (D5), beta feedback.
// Every POST carries a CSRF token bound to the signed-in session and the purpose.

import { ACTION_TEXT, loadClaim, redeemClaim } from "../lib/claims.ts";
import { createPersonalToken } from "../lib/credentials.ts";
import { AtlasError } from "../lib/errors.ts";
import { checkCsrf, csrfToken, readSession, type Session } from "../lib/session.ts";
import { esc, messagePage, page, secretBlock } from "./html.ts";
import { feedbackPage } from "./evidence.ts";
import { playgroundPage, type PlaygroundDeps } from "./playground.ts";

export interface PageDeps extends PlaygroundDeps {
  origin: string;
}

const loginRedirect = (path: string) =>
  new Response(null, { status: 302, headers: { location: `/login?next=${encodeURIComponent(path)}`, "cache-control": "no-store" } });

function errorPage(err: unknown): Response {
  if (err instanceof AtlasError) {
    const status = err.code === "FORBIDDEN" ? 403 : err.code === "CLAIM_EXPIRED" ? 410 : 404;
    const hint =
      err.code === "CLAIM_EXPIRED"
        ? " Links work once. If you didn't copy the key, ask your coding agent to rotate it (atlas_bind_project with action 'rotate_key') and open the new link."
        : "";
    return messagePage("This link can't be used", err.message + hint, status);
  }
  throw err;
}

// Back/forward cache can show a confirm page whose link was already used; reload to show the real state.
const NO_STALE_PAGE = `<script>addEventListener("pageshow",(e)=>{if(e.persisted)location.reload()})</script>`;

async function claimPage(request: Request, deps: PageDeps, token: string, session: Session): Promise<Response> {
  const purpose = `claim:${token}`;
  try {
    if (request.method === "POST") {
      const form = await request.formData();
      if (!(await checkCsrf(deps.sessionSecret, session, purpose, form.get("csrf")))) {
        return messagePage("Request blocked", "This form expired or did not come from Atlas One. Reload the link.", 403);
      }
      const { claim, key } = await redeemClaim(deps.db, token, session.githubId);
      if (!key) {
        return page("Keys revoked", `<div class="card"><h1>Keys revoked</h1>
<p>All keys for <strong>${esc(claim.project_name)}</strong> are revoked. Apps using them now receive <code>KEY_REVOKED</code>.</p></div>`);
      }
      return page("Your project key", `<div class="card"><h1>Project key for ${esc(claim.project_name)}</h1>
<p class="warn">Shown once. Atlas One keeps only a fingerprint, so copy it now.</p>
<p>Add this to your app's <strong>server-side</strong> environment (for example <code>.env.local</code>, which must be in <code>.gitignore</code>):</p>
${secretBlock("key", `ATLAS_ONE_BASE_URL=${deps.origin}/v1\nATLAS_ONE_API_KEY=${key.secret}`)}
<p class="muted">Don't paste it into your AI chat. Your agent only needs to know it's in place; it will verify with atlas_test.</p></div>`);
    }
    const claim = await loadClaim(deps.db, token, session.githubId);
    return page("Confirm", `<div class="card"><h1>Confirm for ${esc(claim.project_name)}</h1>
<p>Your coding agent asked Atlas One to: <strong>${esc(ACTION_TEXT[claim.action])}</strong>.</p>
<p class="muted">Signed in as @${esc(session.login)}. This link works once and expires ${new Date(claim.expires_at).toUTCString()}.</p>
<form method="post"><input type="hidden" name="csrf" value="${await csrfToken(deps.sessionSecret, session, purpose)}">
<div class="row"><button class="${claim.action === "revoke_key" ? "danger" : "primary"}">Confirm</button></div></form></div>${NO_STALE_PAGE}`);
  } catch (err) {
    return errorPage(err);
  }
}

async function tokensPage(request: Request, deps: PageDeps, session: Session): Promise<Response> {
  const purpose = "tokens";
  let created = "";
  if (request.method === "POST") {
    const form = await request.formData();
    if (!(await checkCsrf(deps.sessionSecret, session, purpose, form.get("csrf")))) {
      return messagePage("Request blocked", "This form expired or did not come from Atlas One. Reload the page.", 403);
    }
    if (form.get("op") === "create") {
      const pat = await createPersonalToken(deps.db, session.githubId);
      created = `<div class="card"><h1>New personal access token</h1>
<p class="warn">Shown once. Use it only for MCP clients that cannot sign in with a browser (CI, containers).</p>
${secretBlock("pat", pat.secret)}
<p>Example (Claude Code):</p><pre>claude mcp add --transport http atlas-one ${esc(deps.origin)}/mcp --header "Authorization: Bearer ${esc(pat.secret)}"</pre></div><p></p>`;
    } else if (form.get("op") === "revoke") {
      await deps.db
        .prepare("UPDATE personal_tokens SET revoked_at = ? WHERE id = ? AND owner_github_id = ? AND revoked_at IS NULL")
        .bind(Date.now(), String(form.get("id")), session.githubId)
        .run();
    }
  }
  const { results } = await deps.db
    .prepare("SELECT id, prefix, created_at, last_used_at, revoked_at FROM personal_tokens WHERE owner_github_id = ? ORDER BY created_at DESC")
    .bind(session.githubId)
    .all<{ id: string; prefix: string; created_at: number; last_used_at: number | null; revoked_at: number | null }>();
  const csrf = await csrfToken(deps.sessionSecret, session, purpose);
  const rows = results
    .map(
      (t) => `<tr><td><code>${esc(t.prefix)}…</code></td><td>${new Date(t.created_at).toISOString().slice(0, 10)}</td>
<td>${t.revoked_at ? "revoked" : `<form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="op" value="revoke"><input type="hidden" name="id" value="${esc(t.id)}"><button class="danger">Revoke</button></form>`}</td></tr>`,
    )
    .join("");
  return page("Personal access tokens", `${created}<div class="card"><h1>Personal access tokens</h1>
<p class="muted">Most MCP clients sign in with the Connect button and need no token. Tokens are for clients that cannot open a browser. Signed in as @${esc(session.login)}.</p>
<form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="op" value="create"><button class="primary">Create token</button></form>
<table><tr><th>Token</th><th>Created</th><th></th></tr>${rows || '<tr><td colspan="3" class="muted">No tokens yet.</td></tr>'}</table></div>`);
}

export async function handlePages(request: Request, deps: PageDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const claim = /^\/claim\/(cl_[A-Za-z0-9_-]{43})$/.exec(url.pathname);
  if (!claim && !["/tokens", "/playground", "/feedback"].includes(url.pathname)) return null;
  const session = await readSession(request, deps.sessionSecret);
  if (!session) return loginRedirect(url.pathname);
  if (claim) return claimPage(request, deps, claim[1]!, session);
  if (url.pathname === "/feedback") return feedbackPage(request, deps.db, deps.sessionSecret, session);
  return url.pathname === "/playground" ? playgroundPage(request, deps, session) : tokensPage(request, deps, session);
}
