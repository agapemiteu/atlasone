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
import { sha256Hex } from "./credentials.ts";

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

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
  /** Where the model server reports progress and registers: this Worker's public origin. */
  atlasOrigin: string;
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

export const BOOTSTRAP_TTL_MS = 30 * 60_000;
const BOOTSTRAP_LINE = "BOOTSTRAP_TOKEN = None";
const ORIGIN_LINE = /^ATLAS_ONE_URL = ".*"$/m;

/**
 * The Kaggle notebook that runs the model server: one code cell holding inference/kaggle_serve.py with a
 * single-use bootstrap token. Kaggle secrets are unavailable to API-started runs, and notebook versions
 * are kept forever, so the notebook never contains long-lived keys: it trades this token once for them.
 */
export function serverNotebook(bootstrapToken: string, atlasOrigin: string): string {
  if (!serverScript.includes(BOOTSTRAP_LINE) || !ORIGIN_LINE.test(serverScript)) throw new Error("server script is missing a placeholder");
  // The origin comes from this Worker's config, so moving Atlas One to a new URL cannot strand the server.
  const source = serverScript
    .replace(BOOTSTRAP_LINE, `BOOTSTRAP_TOKEN = ${JSON.stringify(bootstrapToken)}`)
    .replace(ORIGIN_LINE, `ATLAS_ONE_URL = ${JSON.stringify(atlasOrigin)}`);
  return JSON.stringify({
    cells: [{ cell_type: "code", execution_count: null, metadata: {}, outputs: [], source }],
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
    },
    nbformat: 4,
    nbformat_minor: 4,
  });
}

/** New Kaggle API tokens (KGAT_...) are bearer tokens; legacy kaggle.json keys use Basic username:key. */
export function kaggleAuth(kaggle: KaggleConfig): string {
  return kaggle.key.startsWith("KGAT_") ? `Bearer ${kaggle.key}` : `Basic ${btoa(`${kaggle.username}:${kaggle.key}`)}`;
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
  const bootstrap = "bt_" + b64url(crypto.getRandomValues(new Uint8Array(32)));
  // Claim the wake first so concurrent requests do not all start Kaggle runs.
  const claimed = await db
    .prepare(
      `INSERT INTO backend_wakes (id, requested_at, requested_by, stage, detail, updated_at, bootstrap_hash)
       SELECT ?1, ?2, ?3, 'gpu_requested', NULL, ?2, ?5
        WHERE NOT EXISTS (SELECT 1 FROM backend_wakes WHERE requested_at > ?4 AND stage NOT IN ('ready', 'sleeping', 'failed'))`,
    )
    .bind(id, now, requestedBy, now - WAKE_TIMEOUT_MS, await sha256Hex(bootstrap))
    .run();
  if (claimed.meta.changes !== 1) return latestWake(db);

  try {
    const res = await fetcher("https://api.kaggle.com/v1/kernels.KernelsApiService/SaveKernel", {
      method: "POST",
      headers: {
        authorization: kaggleAuth(kaggle),
        "content-type": "application/json",
        "user-agent": "atlas-one",
      },
      body: JSON.stringify({
        slug: `${kaggle.username}/${kaggle.kernelSlug}`,
        newTitle: kaggle.kernelSlug,
        text: serverNotebook(bootstrap, kaggle.atlasOrigin),
        language: "python",
        kernelType: "notebook",
        isPrivate: true,
        enableGpu: true,
        enableInternet: true,
        machineShape: "NvidiaTeslaT4", // GPU T4 x2 (Kaggle docs); one 16 GB GPU cannot hold N-ATLaS F16
        // Without this Kaggle may only save the notebook; we need a new version that actually runs.
        kernelExecutionType: "SAVE_AND_RUN_ALL",
        datasetDataSources: [],
        kernelDataSources: [],
        competitionDataSources: [],
        modelDataSources: [],
        categoryIds: [],
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; versionNumber?: number; url?: string };
    if (!res.ok || body.error) throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
    // Evidence that Kaggle accepted a run: the new notebook version number.
    await db
      .prepare("UPDATE backend_wakes SET detail = ? WHERE id = ?")
      .bind(`Kaggle accepted run (notebook version ${body.versionNumber ?? "?"})`, id)
      .run();
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

/**
 * Trades a wake's bootstrap token for the model server's keys, exactly once, within its TTL.
 * Returns null for unknown, used or expired tokens.
 */
export async function redeemBootstrap(db: D1Database, token: string, now = Date.now()): Promise<{ wakeId: string } | null> {
  if (!/^bt_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = await db
    .prepare(
      `UPDATE backend_wakes SET bootstrap_used_at = ?1
        WHERE bootstrap_hash = ?2 AND bootstrap_used_at IS NULL AND requested_at > ?3
        RETURNING id`,
    )
    .bind(now, await sha256Hex(token), now - BOOTSTRAP_TTL_MS)
    .first<{ id: string }>();
  return row ? { wakeId: row.id } : null;
}

let lastKaggleCheck = 0;
const KAGGLE_CHECK_EVERY_MS = 30_000;
const NO_PROGRESS_GRACE_MS = 45_000;

/**
 * If a wake shows no progress from the model server, ask Kaggle how the run is doing (throttled) and
 * record a failure Kaggle reports, so nobody is told "waking" about a run that already died.
 */
export async function checkKaggleRun(db: D1Database, fetcher: typeof fetch, kaggle: KaggleConfig | null, now = Date.now()) {
  if (!kaggle || now - lastKaggleCheck < KAGGLE_CHECK_EVERY_MS) return;
  const wake = await latestWake(db);
  if (!wake || !wakeInFlight(wake, now) || wake.stage !== "gpu_requested" || now - wake.updated_at < NO_PROGRESS_GRACE_MS) return;
  lastKaggleCheck = now;
  try {
    const res = await fetcher("https://api.kaggle.com/v1/kernels.KernelsApiService/GetKernelSessionStatus", {
      method: "POST",
      headers: { authorization: kaggleAuth(kaggle), "content-type": "application/json", "user-agent": "atlas-one" },
      body: JSON.stringify({ userName: kaggle.username, kernelSlug: kaggle.kernelSlug }),
    });
    const body = (await res.json()) as { status?: string; failureMessage?: string };
    const status = body.status ?? "QUEUED"; // Kaggle omits the default value
    if (/ERROR|CANCEL|COMPLETE/.test(status)) {
      await recordStage(db, "failed", `Kaggle reports the run ${status.toLowerCase()}${body.failureMessage ? `: ${body.failureMessage}` : ""}`, wake.id, now);
    }
  } catch {
    // Kaggle unreachable: keep the current stage; the wake still times out after 20 minutes.
  }
}

/** Test hook. */
export function resetKaggleCheck(): void {
  lastKaggleCheck = 0;
}
