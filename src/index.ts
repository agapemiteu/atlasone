// Atlas One Worker entry. Routes are added as tasks land: /v1 (T2), upstream registry (T3),
// MCP (T4), OAuth (T6).

import { AtlasError, toHttpResponse } from "./lib/errors.ts";
import { handleUpstreamRegister } from "./routes/upstream.ts";
import { handleV1 } from "./routes/v1.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "atlas-one", gateway: "ok" });
    }

    const v1 = await handleV1(request, {
      db: env.DB,
      fetcher: fetch,
      upstreamKey: env.ATLAS_UPSTREAM_KEY,
      waitUntil: (p) => ctx.waitUntil(p),
    });
    if (v1) return v1;

    const registered = await handleUpstreamRegister(request, {
      db: env.DB,
      fetcher: fetch,
      adminKey: env.ATLAS_ADMIN_KEY,
      upstreamKey: env.ATLAS_UPSTREAM_KEY,
      allowedHosts: env.UPSTREAM_HOSTS,
    });
    if (registered) return registered;

    return toHttpResponse(new AtlasError("NOT_FOUND"));
  },
} satisfies ExportedHandler<Env>;
