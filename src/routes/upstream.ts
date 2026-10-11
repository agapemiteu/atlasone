// Upstream self-registration (D3). The Kaggle server calls this when it prints READY, because its
// tunnel URL changes every session.
//
//   admin key (timing-safe) ─► https URL, host on allowlist, no path/credentials (SSRF guard, PRD §8)
//        ─► model must be NCAIR1/N-ATLaS at a 40-hex revision
//        ─► /health must be ready AND /v1/models must accept OUR upstream key and list n-atlas-8b
//           (proves the server is ours, not just any reachable host)
//        ─► atomically deactivate the old row and activate the new one

import { probe, resetBackendCache, type Upstream } from "../lib/backend.ts";
import { MODEL_ID } from "../lib/chat.ts";
import { bearer, sha256Hex } from "../lib/credentials.ts";
import { AtlasError, toHttpResponse } from "../lib/errors.ts";

export interface UpstreamDeps {
  db: D1Database;
  fetcher: typeof fetch;
  adminKey: string;
  upstreamKey: string;
  /** Comma-separated host patterns; "*." matches any subdomain. */
  allowedHosts: string;
}

const MODEL_WEIGHTS = "NCAIR1/N-ATLaS";

async function sameSecret(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  const enc = new TextEncoder();
  return crypto.subtle.timingSafeEqual(enc.encode(ha), enc.encode(hb));
}

export function hostAllowed(host: string, patterns: string): boolean {
  return patterns
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .some((p) => (p.startsWith("*.") ? host.endsWith(p.slice(1)) : host === p));
}

function parseUpstreamUrl(raw: unknown, allowedHosts: string): string {
  if (typeof raw !== "string") throw new AtlasError("VALIDATION_FAILED", "'url' is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AtlasError("VALIDATION_FAILED", "'url' is not a valid URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new AtlasError("VALIDATION_FAILED", "'url' must be a bare https origin, e.g. https://name.trycloudflare.com");
  }
  if (!hostAllowed(url.hostname.toLowerCase(), allowedHosts)) {
    throw new AtlasError("FORBIDDEN", "Upstream host is not on the allowlist.");
  }
  return url.origin;
}

async function servesOurModel(origin: string, deps: UpstreamDeps): Promise<boolean> {
  try {
    const res = await deps.fetcher(new URL("/v1/models", origin), {
      headers: { authorization: `Bearer ${deps.upstreamKey}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: { id?: string }[] };
    return body.data?.some((m) => m.id === MODEL_ID) ?? false;
  } catch {
    return false;
  }
}

export async function handleUpstreamRegister(request: Request, deps: UpstreamDeps): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (pathname !== "/api/upstream/register") return null;
  try {
    if (request.method !== "POST") throw new AtlasError("NOT_FOUND");
    const token = bearer(request.headers.get("authorization"));
    if (!token || !deps.adminKey || !(await sameSecret(token, deps.adminKey))) throw new AtlasError("AUTH_REQUIRED");

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const origin = parseUpstreamUrl(body?.url, deps.allowedHosts);
    if (body?.model_id !== MODEL_WEIGHTS) throw new AtlasError("VALIDATION_FAILED", `'model_id' must be '${MODEL_WEIGHTS}'.`);
    if (typeof body.model_revision !== "string" || !/^[0-9a-f]{40}$/.test(body.model_revision)) {
      throw new AtlasError("VALIDATION_FAILED", "'model_revision' must be a 40-character commit hash.");
    }
    if (typeof body.runtime !== "string" || !/^[\w .@/:+-]{1,64}$/.test(body.runtime)) {
      throw new AtlasError("VALIDATION_FAILED", "'runtime' must be a short description, e.g. 'llama.cpp@b11552 f16'.");
    }

    const upstream: Upstream = {
      id: crypto.randomUUID(),
      url: origin,
      model_id: MODEL_WEIGHTS,
      model_revision: body.model_revision,
      runtime: body.runtime,
    };
    const state = await probe(upstream, deps.fetcher);
    if (state !== "ready") throw new AtlasError("MODEL_OFFLINE", `Upstream health is '${state}'; register after READY.`);
    if (!(await servesOurModel(origin, deps))) {
      throw new AtlasError("FORBIDDEN", "Upstream did not accept the Atlas upstream key or does not serve n-atlas-8b.");
    }

    await deps.db.batch([
      deps.db.prepare("UPDATE upstreams SET active = 0 WHERE active = 1"),
      deps.db
        .prepare(
          "INSERT INTO upstreams (id, url, model_id, model_revision, runtime, registered_at, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
        )
        .bind(upstream.id, upstream.url, upstream.model_id, upstream.model_revision, upstream.runtime, Date.now()),
    ]);
    resetBackendCache();
    return Response.json({ ok: true, upstream_id: upstream.id, url: origin, state });
  } catch (err) {
    return toHttpResponse(err);
  }
}
