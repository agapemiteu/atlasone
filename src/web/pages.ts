// Signed-in pages: confirm a claim link (D13, D16), manage access (connected agents D26, personal tokens D5),
// beta feedback.
// Every POST carries a CSRF token bound to the signed-in session and the purpose.

import { ACTION_TEXT, loadClaim, redeemClaim } from "../lib/claims.ts";
import { createPersonalToken } from "../lib/credentials.ts";
import { AtlasError } from "../lib/errors.ts";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { listProjects } from "../lib/projects.ts";
import { checkCsrf, csrfToken, readSession, type Session } from "../lib/session.ts";
import { bindProject } from "../tools/bind.ts";
import type { ToolDeps } from "../tools/context.ts";
import { esc, messagePage, page, secretBlock } from "./html.ts";
import { feedbackPage } from "./evidence.ts";
import { playgroundPage, type PlaygroundDeps } from "./playground.ts";

export interface PageDeps extends PlaygroundDeps {
  origin: string;
  /** Connected agents (OAuth grants); absent in tests that do not need them. */
  oauth?: Pick<OAuthHelpers, "listUserGrants" | "revokeGrant" | "lookupClient">;
}

/** Every agent signed in to this account, newest first (grant times are in seconds): the same for every MCP client (D26). */
async function connectedAgents(deps: PageDeps, session: Session) {
  if (!deps.oauth) return [];
  const { items } = await deps.oauth.listUserGrants(session.githubId, { limit: 100 });
  const named = await Promise.all(
    items.map(async (g) => ({
      id: g.id,
      name: (g.metadata as { client?: string } | null)?.client ?? (await deps.oauth!.lookupClient(g.clientId).catch(() => null))?.clientName ?? "MCP client",
      scope: g.scope,
      createdAt: g.createdAt,
    })),
  );
  return named.sort((a, b) => b.createdAt - a.createdAt);
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
<p>Paste it after <code>ATLAS_ONE_API_KEY=</code> in your app's <code>.env.local</code> (your agent opens it for you), then save:</p>
${secretBlock("key", key.secret, "Copy key")}
<details><summary class="muted">Setting it up yourself? Both lines</summary>
${secretBlock("env", `ATLAS_ONE_BASE_URL=${deps.origin}/v1\nATLAS_ONE_API_KEY=${key.secret}`)}</details>
<p class="muted">Don't paste it into an AI chat. If an agent asked for this key, tell it "done"; it verifies with atlas_test.</p></div>`);
    }
    const claim = await loadClaim(deps.db, token, session.githubId);
    return page("Confirm", `<div class="card"><h1>Confirm for ${esc(claim.project_name)}</h1>
<p>Requested by your coding agent or from your Access page: <strong>${esc(ACTION_TEXT[claim.action])}</strong>.</p>
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
    } else if (form.get("op") === "api_key") {
      // Direct API access, no agent (D28): the same project and one-time key page the agents use.
      try {
        const owner = { db: deps.db, owner: session.githubId, origin: deps.origin } as ToolDeps;
        const name = String(form.get("name") ?? "");
        let res = await bindProject(owner, { name });
        if (!res.action_required) res = await bindProject(owner, { name, action: "rotate_key" });
        if (!("claim_url" in res)) throw new AtlasError("INTERNAL");
        const to = new URL(res.claim_url).pathname;
        return new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store" } });
      } catch (err) {
        if (err instanceof AtlasError) return messagePage("Couldn't create the key", err.message, 400);
        throw err;
      }
    } else if (form.get("op") === "disconnect" && deps.oauth) {
      // Signs that agent out: its tokens stop working; it asks to sign in again next time it is used.
      await deps.oauth.revokeGrant(String(form.get("id")), session.githubId);
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
  const agents = (await connectedAgents(deps, session))
    .map(
      (a) => `<tr><td>${esc(a.name)}</td><td>${new Date(a.createdAt * 1000).toISOString().slice(0, 10)}</td><td><small>${esc(a.scope.join(" "))}</small></td>
<td><form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="op" value="disconnect"><input type="hidden" name="id" value="${esc(a.id)}"><button class="danger">Sign out</button></form></td></tr>`,
    )
    .join("");
  const rows = results
    .map(
      (t) => `<tr><td><code>${esc(t.prefix)}…</code></td><td>${new Date(t.created_at).toISOString().slice(0, 10)}</td>
<td>${t.revoked_at ? "revoked" : `<form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="op" value="revoke"><input type="hidden" name="id" value="${esc(t.id)}"><button class="danger">Revoke</button></form>`}</td></tr>`,
    )
    .join("");
  const projects = (await listProjects(deps.db, session.githubId))
    .map((pr) => `<tr><td>${esc(pr.name)}</td><td><code>${esc(pr.slug)}</code></td><td>${pr.active_keys ? "active" : "none"}</td></tr>`)
    .join("");
  return page("Access", `${created}<div class="card"><h1>API keys</h1>
<p class="muted">For direct API access without an agent. One key per project, shown once; creating it again for the same project
replaces the old key. Use it from your server with <code>${esc(deps.origin)}/v1</code> (OpenAI-compatible, model <code>n-atlas-8b</code>).</p>
<form method="post" class="row"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="op" value="api_key">
<input name="name" required maxlength="64" placeholder="Project name, e.g. my-shop" style="flex:1;min-width:200px;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px">
<button class="primary">Create API key</button></form>
<table><tr><th>Project</th><th>Slug</th><th>Key</th></tr>${projects || '<tr><td colspan="3" class="muted">No projects yet.</td></tr>'}</table></div><p></p>
<div class="card"><h1>Connected agents</h1>
<p class="muted">Every coding agent signed in to Atlas One as @${esc(session.login)}. Sign one out here and it asks you to sign in
again next time; this works the same for every agent.</p>
<table><tr><th>Agent</th><th>Connected</th><th>Permissions</th><th></th></tr>${agents || '<tr><td colspan="4" class="muted">No agents connected.</td></tr>'}</table></div><p></p>
<div class="card"><h1>Personal access tokens</h1>
<p class="muted">Most MCP clients sign in with the browser and need no token. Tokens are for clients that cannot open a browser.</p>
<form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="op" value="create"><button class="primary">Create token</button></form>
<table><tr><th>Token</th><th>Created</th><th></th></tr>${rows || '<tr><td colspan="3" class="muted">No tokens yet.</td></tr>'}</table></div>`);
}

export async function handlePages(request: Request, deps: PageDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const claim = /^\/claim\/(cl_[A-Za-z0-9_-]{43})$/.exec(url.pathname);
  if (url.pathname === "/tokens") return new Response(null, { status: 301, headers: { location: "/access" } });
  if (!claim && !["/access", "/playground", "/feedback"].includes(url.pathname)) return null;
  const session = await readSession(request, deps.sessionSecret);
  if (!session) return loginRedirect(url.pathname);
  if (claim) return claimPage(request, deps, claim[1]!, session);
  if (url.pathname === "/feedback") return feedbackPage(request, deps.db, deps.sessionSecret, session);
  return url.pathname === "/playground" ? playgroundPage(request, deps, session) : tokensPage(request, deps, session);
}
