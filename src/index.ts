// Atlas One Worker entry.
//
//   OAuthProvider ─┬─ /mcp ............ authenticated (OAuth token or personal token) ─► serveMcp
//                  ├─ /token, /register, /.well-known/* ... handled by the library (OAuth 2.1, DCR, CIMD)
//                  └─ everything else ─► app():
//                        /health · /v1/* gateway · /api/upstream/register · /authorize + GitHub callbacks
//                        · /login · /claim/:token · /tokens · /

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { verifyPersonalToken } from "./lib/credentials.ts";
import { AtlasError, toHttpResponse } from "./lib/errors.ts";
import { MCP_PATH, serveMcp } from "./mcp.ts";
import { handleUpstreamRegister } from "./routes/upstream.ts";
import { handleV1 } from "./routes/v1.ts";
import { ALL_SCOPES } from "./tools/context.ts";
import { handleAuth } from "./web/auth.ts";
import { evidenceResponse } from "./web/evidence.ts";
import type { KaggleConfig } from "./lib/wake.ts";
import { handlePages } from "./web/pages.ts";
import { publicStatus } from "./web/status.ts";

/** What completeAuthorization() stores, and what a personal token resolves to. */
export interface AtlasProps {
  githubId: string;
  login: string | null;
  scopes: string[];
  /** MCP client name from the consent page (absent on grants made before beta evidence existed). */
  client?: string | null;
}

// workerd's fetch throws "Illegal invocation" when called as a method of another object
// (e.g. deps.fetcher(...)). Wrap it once so every injected fetcher is safe to call either way.
const fetcher: typeof fetch = (input, init) => fetch(input, init);

/** Wake-on-demand is on only when the Kaggle key secret is set. */
function kaggleConfig(env: Env): KaggleConfig | null {
  return env.KAGGLE_KEY ? { username: env.KAGGLE_USERNAME, key: env.KAGGLE_KEY, kernelSlug: env.KAGGLE_KERNEL, atlasOrigin: env.PUBLIC_ORIGIN } : null;
}

async function app(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const waitUntil = (p: Promise<unknown>) => ctx.waitUntil(p);
  const kaggle = kaggleConfig(env);
  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ service: "atlas-one", gateway: "ok" });
  }
  if (request.method === "GET" && (url.pathname === "/evidence" || url.pathname === "/evidence.json")) {
    return evidenceResponse(env.DB, (env.TEAM_GITHUB_LOGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean), url.pathname.endsWith(".json"));
  }
  if (request.method === "GET" && url.pathname === "/api/status") {
    return Response.json(await publicStatus(env.DB, fetcher, kaggle), { headers: { "cache-control": "no-store" } });
  }

  const response =
    (await handleV1(request, { db: env.DB, fetcher, upstreamKey: env.ATLAS_UPSTREAM_KEY, waitUntil, kaggle })) ??
    (await handleUpstreamRegister(request, {
      db: env.DB,
      fetcher,
      adminKey: env.ATLAS_ADMIN_KEY,
      upstreamKey: env.ATLAS_UPSTREAM_KEY,
      allowedHosts: env.UPSTREAM_HOSTS,
      hfToken: env.HF_TOKEN,
    })) ??
    (await handleAuth(request, {
      oauth: env.OAUTH_PROVIDER,
      db: env.DB,
      fetcher,
      github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
      sessionSecret: env.SESSION_SECRET,
      allowedLogins: env.ALLOWED_GITHUB_LOGINS,
      origin: env.PUBLIC_ORIGIN,
    })) ??
    (await handlePages(request, {
      db: env.DB,
      fetcher,
      upstreamKey: env.ATLAS_UPSTREAM_KEY,
      waitUntil,
      sessionSecret: env.SESSION_SECRET,
      origin: env.PUBLIC_ORIGIN,
      kaggle,
    }));
  if (response) return response;

  return toHttpResponse(new AtlasError("NOT_FOUND"));
}

let provider: { origin: string; instance: OAuthProvider<Env> } | null = null;

function oauthProvider(env: Env): OAuthProvider<Env> {
  if (provider?.origin === env.PUBLIC_ORIGIN) return provider.instance;
  const resource = `${env.PUBLIC_ORIGIN}${MCP_PATH}`;
  const instance = new OAuthProvider<Env>({
    apiRoute: MCP_PATH,
    apiHandler: {
      fetch(request, env, ctx) {
        const props = (ctx as ExecutionContext & { props: AtlasProps }).props;
        return serveMcp(
          request,
          {
            db: env.DB,
            fetcher,
            upstreamKey: env.ATLAS_UPSTREAM_KEY,
            waitUntil: (p) => ctx.waitUntil(p),
            owner: props.githubId,
            principal: { githubId: props.githubId, login: props.login, client: props.client ?? null },
            origin: env.PUBLIC_ORIGIN,
            scopes: props.scopes,
            kaggle: kaggleConfig(env),
          },
          env,
          ctx,
        );
      },
    },
    defaultHandler: { fetch: (request, env, ctx) => app(request, env as Env, ctx) },
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: ALL_SCOPES,
    requiredScopes: ["atlas:read"],
    resourceMetadata: { resource, authorization_servers: [env.PUBLIC_ORIGIN], resource_name: "Atlas One" },
    // Personal access tokens (D5): minted by Atlas One for this resource, for clients without a browser.
    resolveExternalToken: async ({ token, env }) => {
      try {
        const pat = await verifyPersonalToken(env.DB, token);
        const props: AtlasProps = { githubId: pat.ownerGithubId, login: null, scopes: ALL_SCOPES, client: "Personal token" };
        return { props, audience: resource };
      } catch {
        return null;
      }
    },
  });
  provider = { origin: env.PUBLIC_ORIGIN, instance };
  return instance;
}

const ROOT_PRM = "/.well-known/oauth-protected-resource";
// Sign-in, consent, token and registration endpoints: limited per client IP (wrangler AUTH_LIMITER).
const AUTH_PATHS = new Set(["/register", "/authorize", "/token", "/login", "/auth/github/mcp", "/auth/github/web"]);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Clients that skip the WWW-Authenticate hint fall back to the root metadata URL (MCP spec);
    // serve the /mcp resource's document there too, so every client generation can discover sign-in.
    const url = new URL(request.url);
    if (AUTH_PATHS.has(url.pathname)) {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.AUTH_LIMITER.limit({ key: ip });
      if (!success) return toHttpResponse(new AtlasError("RATE_LIMITED", "Too many sign-in requests. Try again in a minute.", { retryAfterS: 60 }));
    }
    if (url.pathname === ROOT_PRM) {
      url.pathname = `${ROOT_PRM}${MCP_PATH}`;
      return oauthProvider(env).fetch(new Request(url, request), env, ctx);
    }
    return oauthProvider(env).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
