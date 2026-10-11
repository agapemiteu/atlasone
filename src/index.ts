// Atlas One Worker entry: /v1 gateway (T2), upstream registry (T3), /mcp (T4). OAuth wraps this in T6.

import { AtlasError, toHttpResponse } from "./lib/errors.ts";
import { handleMcp } from "./mcp.ts";
import { handleUpstreamRegister } from "./routes/upstream.ts";
import { handleV1 } from "./routes/v1.ts";

// workerd's fetch throws "Illegal invocation" when called as a method of another object
// (e.g. deps.fetcher(...)). Wrap it once so every injected fetcher is safe to call either way.
const fetcher: typeof fetch = (input, init) => fetch(input, init);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "atlas-one", gateway: "ok" });
    }

    const v1 = await handleV1(request, {
      db: env.DB,
      fetcher,
      upstreamKey: env.ATLAS_UPSTREAM_KEY,
      waitUntil: (p) => ctx.waitUntil(p),
    });
    if (v1) return v1;

    const registered = await handleUpstreamRegister(request, {
      db: env.DB,
      fetcher,
      adminKey: env.ATLAS_ADMIN_KEY,
      upstreamKey: env.ATLAS_UPSTREAM_KEY,
      allowedHosts: env.UPSTREAM_HOSTS,
    });
    if (registered) return registered;

    const mcp = await handleMcp(
      request,
      { db: env.DB, fetcher, upstreamKey: env.ATLAS_UPSTREAM_KEY, waitUntil: (p) => ctx.waitUntil(p) },
      env,
      ctx,
    );
    if (mcp) return mcp;

    return toHttpResponse(new AtlasError("NOT_FOUND"));
  },
} satisfies ExportedHandler<Env>;
