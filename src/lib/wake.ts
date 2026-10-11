// Wake-on-demand: developers never start the GPU. When an authenticated request finds N-ATLaS asleep,
// Atlas One starts the Kaggle notebook through Kaggle's API and reports real progress.
//
//   request finds backend offline ─► requestWake() ── recent wake in flight? ─► reuse it (debounced)
//                                         │ no
//                                         ▼  Kaggle SaveKernel (notebook = inference/kaggle_serve.py,
//                                            GPU T4 x2, internet on) ─► stage gpu_requested
//   model server ─► POST /api/upstream/progress (admin key) ─► notebook_started … warming_up
//   model server ─► POST /api/upstream/register            ─► ready
//   model server idle 20 min ─► progress "sleeping" and exits (protects the free GPU quota)
//
// Every stage shown to users is one of these observed events; nothing is estimated.

import serverScript from "../../inference/kaggle_serve.py";

export const WAKE_STAGES = [
  "gpu_requested",
  "notebook_started",
  "fetching_runtime",
  "downloading_model",
  "loading_weights",
  "warming_up",
  "ready",
] as const;
export const TERMINAL_STAGES = ["ready", "sleeping", "failed"] as const;
export type WakeStage = (typeof WAKE_STAGES)[number] | "sleeping" | "failed";

export const STAGE_TEXT: Record<WakeStage, string> = {
  gpu_requested: "Requesting a free GPU (2x T4)",
  notebook_started: "GPU assigned, server notebook started",
  fetching_runtime: "Fetching the inference runtime",
  downloading_model: "Downloading N-ATLaS weights",
  loading_weights: "Loading N-ATLaS onto the GPUs",
  warming_up: "Warming up",
  ready: "N-ATLaS is online",
  sleeping: "N-ATLaS went to sleep after being idle",
  failed: "Wake-up failed",
};

/** A wake that has not reached a terminal stage within this long is treated as stuck. */
const WAKE_TIMEOUT_MS = 20 * 60_000;

export interface KaggleConfig {
  username: string;
  key: string;
  kernelSlug: string;
}

export interface Wake {
  id: string;
  stage: WakeStage;
  detail: string | null;
  requested_at: number;
  updated_at: number;
}

export function wakeInFlight(w: Wake | null, now = Date.now()): boolean {
  return !!w && !(TERMINAL_STAGES as readonly string[]).includes(w.stage) && now - w.requested_at < WAKE_TIMEOUT_MS;
}

export async function latestWake(db: D1Database): Promise<Wake | null> {
  return db
    .prepare("SELECT id, stage, detail, requested_at, updated_at FROM backend_wakes ORDER BY requested_at DESC LIMIT 1")
    .first<Wake>();
}

/** The Kaggle notebook that runs the model server: one code cell holding inference/kaggle_serve.py. */
export function serverNotebook(): string {
  return JSON.stringify({
    cells: [{ cell_type: "code", execution_count: null, metadata: {}, outputs: [], source: serverScript }],
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
    },
    nbformat: 4,
    nbformat_minor: 4,
  });
}

/**
 * Starts the backend unless a wake is already in flight. Returns the wake to report.
 * Kaggle errors are recorded as a failed wake so callers see the truth, not a silent hang.
 */
export async function requestWake(
  db: D1Database,
  fetcher: typeof fetch,
  kaggle: KaggleConfig | null,
  requestedBy: string,
  now = Date.now(),
): Promise<Wake | null> {
  if (!kaggle) return null;
  const current = await latestWake(db);
  if (wakeInFlight(current, now)) return current;

  const id = crypto.randomUUID();
  // Claim the wake first so concurrent requests do not all start Kaggle runs.
  const claimed = await db
    .prepare(
      `INSERT INTO backend_wakes (id, requested_at, requested_by, stage, detail, updated_at)
       SELECT ?1, ?2, ?3, 'gpu_requested', NULL, ?2
        WHERE NOT EXISTS (SELECT 1 FROM backend_wakes WHERE requested_at > ?4 AND stage NOT IN ('ready', 'sleeping', 'failed'))`,
    )
    .bind(id, now, requestedBy, now - WAKE_TIMEOUT_MS)
    .run();
  if (claimed.meta.changes !== 1) return latestWake(db);

  try {
    const res = await fetcher("https://api.kaggle.com/v1/kernels.KernelsApiService/SaveKernel", {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${kaggle.username}:${kaggle.key}`)}`,
        "content-type": "application/json",
        "user-agent": "atlas-one",
      },
      body: JSON.stringify({
        slug: `${kaggle.username}/${kaggle.kernelSlug}`,
        newTitle: kaggle.kernelSlug,
        text: serverNotebook(),
        language: "python",
        kernelType: "notebook",
        isPrivate: true,
        enableGpu: true,
        enableInternet: true,
        machineShape: "NvidiaTeslaT4", // GPU T4 x2 (Kaggle docs); one 16 GB GPU cannot hold N-ATLaS F16
        datasetDataSources: [],
        kernelDataSources: [],
        competitionDataSources: [],
        modelDataSources: [],
        categoryIds: [],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok || body.error) throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  } catch (err) {
    await recordStage(db, "failed", `Kaggle did not start the server: ${String(err).slice(0, 200)}`, id);
  }
  return latestWake(db);
}

/** Records a stage reported by the model server (or by registration) on the most recent wake. */
export async function recordStage(db: D1Database, stage: WakeStage, detail: string | null, wakeId?: string, now = Date.now()) {
  const target = wakeId ?? (await latestWake(db))?.id;
  if (!target) {
    // A server started by hand still reports progress; give it a row so status pages can show it.
    await db
      .prepare("INSERT INTO backend_wakes (id, requested_at, requested_by, stage, detail, updated_at) VALUES (?, ?, 'manual', ?, ?, ?)")
      .bind(crypto.randomUUID(), now, stage, detail, now)
      .run();
    return;
  }
  await db.prepare("UPDATE backend_wakes SET stage = ?, detail = ?, updated_at = ? WHERE id = ?").bind(stage, detail, now, target).run();
}

/** Seconds a caller should wait before retrying, based on how far the observed wake has progressed. */
export function retryAfterFor(w: Wake | null): number {
  const i = w ? WAKE_STAGES.indexOf(w.stage as (typeof WAKE_STAGES)[number]) : -1;
  return i >= 4 ? 20 : i >= 1 ? 60 : 90;
}
