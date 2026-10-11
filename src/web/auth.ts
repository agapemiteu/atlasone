// Sign-in and consent (D1, D15, D16): the same flow Claude and Codex connectors use.
//
//   MCP client ─► GET /authorize ─► consent page: which app, where tokens go, scopes (ticked)
//              ─► POST /authorize (Allow) ─► GitHub sign-in (PKCE)
//              ─► GET /auth/github/mcp ─► invite-only check ─► completeAuthorization ─► back to the client
//
//   Atlas pages (claim links, tokens) ─► GET /login?next= ─► GitHub ─► GET /auth/github/web ─► session
//
// The library's consent helpers bind every step to this browser and forbid framing; the
// authorization request itself is kept server-side, never trusted from the form.

import {
  AuthorizationError,
  authorizationErrorRedirect,
  CimdFetchError,
  type ConsentDescription,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { recordConnected } from "../lib/activity.ts";
import { type GithubConfig, githubAuthorizeUrl, githubUser, isAllowed, newVerifier } from "../lib/github.ts";
import {
  clearCookie,
  cookie,
  LOGIN_COOKIE,
  LOGIN_TTL_MS,
  readCookie,
  sessionCookie,
  signValue,
  verifyValue,
} from "../lib/session.ts";
import { ALL_SCOPES, SCOPES } from "../tools/context.ts";
import { esc, messagePage, page } from "./html.ts";

export interface AuthDeps {
  oauth: OAuthHelpers;
  db: D1Database;
  fetcher: typeof fetch;
  github: GithubConfig;
  sessionSecret: string;
  allowedLogins: string | undefined;
  origin: string;
}

/**
 * Post-login redirect target: same-origin paths only. Rejects "//host" and "/\host" (browsers treat
 * both as another origin), backslashes and whitespace anywhere, and anything not starting with "/".
 */
export function safeNextPath(next: string | null, fallback = "/tokens"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\s]/.test(next)) return fallback;
  return next;
}

const MCP_CALLBACK = "/auth/github/mcp";
const WEB_CALLBACK = "/auth/github/web";

const notInvited = (login: string) =>
  messagePage(
    "Atlas One is invite-only",
    `GitHub account @${login} is not on the Atlas One beta list yet. Ask the Atlas One team to add you, then try again.`,
    403,
  );

function consentPage(details: ConsentDescription, handle: string): string {
  const name = esc(details.clientName);
  const origin = details.clientDomain
    ? `Published by <strong>${esc(details.clientDomain)}</strong>.`
    : "This app registered itself, so its name is not verified.";
  // MCP clients typically request only the minimum scope from resource metadata (atlas:read), so
  // pre-tick everything Atlas One needs to do its job; the developer can still untick any of it.
  const scopes = ALL_SCOPES.map((scope) => {
    const required = scope === "atlas:read";
    return `<label class="scope"><input type="checkbox" name="scope" value="${scope}" checked ${required ? "disabled" : ""}>
      <span><code>${scope}</code>${required ? " (required)" : ""}<br><span class="muted">${esc(SCOPES[scope])}</span></span></label>`;
  }).join("");
  return `<div class="card">
<h1>Allow ${name} to use Atlas One?</h1>
<p class="muted">${origin} Access will be sent to <strong>${esc(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p class="warn">This sends access to an app on your computer. Continue only if you just started connecting from it.</p>' : ""}
<form method="post" action="/authorize">
  <input type="hidden" name="handle" value="${esc(handle)}">
  <input type="hidden" name="scope" value="atlas:read">
  ${scopes}
  <p class="muted">Next you will sign in with GitHub. Atlas One only reads your GitHub username and id.</p>
  <p class="muted">Beta: your GitHub username, this app's name and each tool's outcome (never prompts, code or keys)
  are recorded as test evidence for the NAIC 2026 judges and shown on the <a href="/evidence">evidence page</a>.</p>
  <div class="row"><button class="primary" name="decision" value="approve">Allow and continue with GitHub</button>
  <button name="decision" value="deny">Deny</button></div>
</form></div>`;
}

function renderAuthError(error: unknown): Response {
  if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
  if (error instanceof AuthorizationError) return messagePage("Authorization failed", error.description ?? "Please start again from your app.");
  if (error instanceof CimdFetchError) return messagePage("App could not be verified", "Its client metadata document could not be fetched.");
  throw error;
}

export async function handleAuth(request: Request, deps: AuthDeps): Promise<Response | null> {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/authorize" && request.method === "GET") {
      const authRequest = await deps.oauth.parseAuthRequest(request);
      const details = await deps.oauth.describeConsent(authRequest);
      const consent = await deps.oauth.beginConsent(authRequest);
      return page(`Authorize ${details.clientName}`, consentPage(details, consent.handle), { headers: consent.headers });
    }

    if (url.pathname === "/authorize" && request.method === "POST") {
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await deps.oauth.denyConsent(request, handle);
        denied.headers.set("location", denied.redirectTo);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const scope = [...new Set(form.getAll("scope").map(String))].filter((s) => (ALL_SCOPES as string[]).includes(s));
      const approved = await deps.oauth.approveConsent(request, handle, { scope });
      const verifier = newVerifier();
      const upstream = await deps.oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
      upstream.headers.set(
        "location",
        await githubAuthorizeUrl(deps.github, `${deps.origin}${MCP_CALLBACK}`, upstream.state, verifier),
      );
      return new Response(null, { status: 302, headers: upstream.headers });
    }

    if (url.pathname === MCP_CALLBACK) {
      const resumed = await deps.oauth.finishUpstream<{ verifier: string }>(request);
      const code = url.searchParams.get("code");
      if (url.searchParams.get("error") || !code) {
        resumed.headers.set("location", authorizationErrorRedirect(resumed.request, "access_denied"));
        return new Response(null, { status: 302, headers: resumed.headers });
      }
      const user = await githubUser(deps.github, code, resumed.data.verifier, `${deps.origin}${MCP_CALLBACK}`, deps.fetcher);
      if (!(await isAllowed(deps.db, deps.allowedLogins, user.login))) return notInvited(user.login);
      const scopes = resumed.request.scope;
      const client = await deps.oauth
        .describeConsent(resumed.request)
        .then((d) => d.clientName)
        .catch(() => null);
      const { redirectTo } = await deps.oauth.completeAuthorization({
        request: resumed.request,
        userId: user.id,
        metadata: { login: user.login },
        scope: scopes,
        props: { githubId: user.id, login: user.login, scopes, client },
      });
      await recordConnected(deps.db, { githubId: user.id, login: user.login, client });
      resumed.headers.set("location", redirectTo);
      // Also sign the browser in, so claim links the agent hands over open without a second login.
      resumed.headers.append("set-cookie", await sessionCookie(deps.sessionSecret, { githubId: user.id, login: user.login }));
      return new Response(null, { status: 302, headers: resumed.headers });
    }

    if (url.pathname === "/login") {
      const safeNext = safeNextPath(url.searchParams.get("next"));
      const state = newVerifier();
      const verifier = newVerifier();
      const headers = new Headers({
        "set-cookie": cookie(LOGIN_COOKIE, await signValue(deps.sessionSecret, { state, verifier, next: safeNext }, LOGIN_TTL_MS), LOGIN_TTL_MS / 1000),
        location: await githubAuthorizeUrl(deps.github, `${deps.origin}${WEB_CALLBACK}`, state, verifier),
        "cache-control": "no-store",
      });
      return new Response(null, { status: 302, headers });
    }

    if (url.pathname === WEB_CALLBACK) {
      const pending = await verifyValue<{ state: string; verifier: string; next: string; exp: number }>(
        deps.sessionSecret,
        readCookie(request, LOGIN_COOKIE),
      );
      const code = url.searchParams.get("code");
      if (!pending || !code || url.searchParams.get("state") !== pending.state) {
        return messagePage("Sign-in expired", "Please start again.", 400);
      }
      const user = await githubUser(deps.github, code, pending.verifier, `${deps.origin}${WEB_CALLBACK}`, deps.fetcher);
      if (!(await isAllowed(deps.db, deps.allowedLogins, user.login))) return notInvited(user.login);
      const headers = new Headers({ location: pending.next, "cache-control": "no-store" });
      headers.append("set-cookie", await sessionCookie(deps.sessionSecret, { githubId: user.id, login: user.login }));
      headers.append("set-cookie", clearCookie(LOGIN_COOKIE));
      return new Response(null, { status: 302, headers });
    }
  } catch (error) {
    return renderAuthError(error);
  }
  return null;
}
