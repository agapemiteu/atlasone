// Atlas One Worker entry. T1 ships only the health route; /v1 (T2), upstream registry (T3),
// MCP (T4) and OAuth (T6) are added here as they land.

import { AtlasError, toHttpResponse } from "./lib/errors.ts";

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "atlas-one", gateway: "ok" });
    }
    return toHttpResponse(new AtlasError("NOT_FOUND"));
  },
} satisfies ExportedHandler<Env>;
