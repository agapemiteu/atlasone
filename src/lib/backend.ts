// Backend state: is genuine N-ATLaS inference reachable right now? (PRD P0-03, §9)
//
//   active upstream row ──none──► offline
//          │
//          ▼  GET {url}/health (2s)
//   200 ─► ready      503 "Loading model" ─► loading      anything else / unreachable ─► offline
//
// State is cached per isolate for 10s (D9) so warm requests skip the probe. A failed inference call
// overwrites the cache immediately (markState), so an outage is never hidden for long.
// All signals are observed; nothing here guesses or simulates model behaviour.

export type BackendState = "ready" | "loading" | "offline";

export interface Upstream {
  id: string;
  url: string;
  model_id: string;
  model_revision: string;
  runtime: string;
}

export interface Backend {
  upstream: Upstream | null;
  state: BackendState;
  checkedAt: number;
}

export const CACHE_MS = 10_000;
const PROBE_TIMEOUT_MS = 2_000;

let cache: Backend | null = null;

/** Test hook: forget cached state. */
export function resetBackendCache(): void {
  cache = null;
}

/** Records an observed state change from a real inference attempt. */
export function markState(upstream: Upstream, state: BackendState, now = Date.now()): void {
  cache = { upstream, state, checkedAt: now };
}

export async function activeUpstream(db: D1Database): Promise<Upstream | null> {
  return db
    .prepare("SELECT id, url, model_id, model_revision, runtime FROM upstreams WHERE active = 1")
    .first<Upstream>();
}

export async function probe(upstream: Upstream, fetcher: typeof fetch): Promise<BackendState> {
  try {
    const res = await fetcher(new URL("/health", upstream.url), { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (res.ok) return "ready";
    const text = res.status === 503 ? await res.text() : "";
    return /loading/i.test(text) ? "loading" : "offline";
  } catch {
    return "offline";
  }
}

/** Current backend. `fresh` bypasses the cache (atlas_discover always reports live state). */
export async function getBackend(
  db: D1Database,
  fetcher: typeof fetch,
  opts: { fresh?: boolean; now?: number } = {},
): Promise<Backend> {
  const now = opts.now ?? Date.now();
  if (!opts.fresh && cache && now - cache.checkedAt < CACHE_MS) return cache;
  const upstream = await activeUpstream(db);
  const state = upstream ? await probe(upstream, fetcher) : "offline";
  cache = { upstream, state, checkedAt: now };
  return cache;
}
