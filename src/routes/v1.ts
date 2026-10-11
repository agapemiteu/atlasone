// OpenAI-compatible gateway for finished applications. Server-side use only: no CORS headers are
// sent, so browsers cannot call it cross-origin and project keys stay out of client bundles (PRD §8).

import { getBackend } from "../lib/backend.ts";
import { MODEL_CARD, MODEL_ID, parseChatRequest } from "../lib/chat.ts";
import { bearer, sha256Hex, verifyProjectKey } from "../lib/credentials.ts";
import { AtlasError, toHttpResponse } from "../lib/errors.ts";
import { newRequestId, runInference } from "../lib/inference.ts";
import { type KaggleConfig, requestWake } from "../lib/wake.ts";

export interface GatewayDeps {
  db: D1Database;
  fetcher: typeof fetch;
  upstreamKey: string;
  waitUntil: (promise: Promise<unknown>) => void;
  /** Wake-on-demand config; null disables waking (backend stays MODEL_OFFLINE until started). */
  kaggle?: KaggleConfig | null;
}

const NONCE = /^[A-Za-z0-9_-]{16,128}$/;

/** Handles /v1/*; returns null for paths it does not own. */
export async function handleV1(request: Request, deps: GatewayDeps): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/v1/")) return null;
  const requestId = newRequestId();
  try {
    const route = `${request.method} ${pathname}`;
    if (route !== "POST /v1/chat/completions" && route !== "GET /v1/models") {
      throw new AtlasError("NOT_FOUND", "Supported: POST /v1/chat/completions, GET /v1/models.");
    }
    const key = await verifyProjectKey(deps.db, bearer(request.headers.get("authorization")));

    if (route === "GET /v1/models") {
      const backend = await getBackend(deps.db, deps.fetcher);
      return Response.json(
        {
          object: "list",
          data: [
            {
              id: MODEL_ID,
              object: "model",
              created: 0,
              owned_by: "NCAIR1 / Awarri",
              atlas: {
                ...MODEL_CARD,
                weights: backend.upstream ? `${backend.upstream.model_id}@${backend.upstream.model_revision}` : null,
                backend: backend.state,
              },
            },
          ],
        },
        { headers: { "x-atlas-request-id": requestId, "cache-control": "no-store" } },
      );
    }

    const chat = await parseChatRequest(request);
    const nonce = request.headers.get("x-atlas-verify");
    const result = await runInference(
      {
        ...deps,
        wake: () => requestWake(deps.db, deps.fetcher, deps.kaggle ?? null, `project:${key.projectId}`),
        projectId: key.projectId,
        keyId: key.keyId,
        source: "app",
        requestId,
        verifyNonceHash: nonce && NONCE.test(nonce) ? await sha256Hex(nonce) : null,
      },
      chat,
    );
    return result.response;
  } catch (err) {
    return toHttpResponse(err, requestId);
  }
}
