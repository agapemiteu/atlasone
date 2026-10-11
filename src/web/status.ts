// Public, read-only backend status (no secrets, no requester identity), shared by GET /api/status, the
// web front end. While N-ATLaS wakes, the home page polls it and renders each observed stage.

import { getBackend } from "../lib/backend.ts";
import {
  checkKaggleRun,
  type KaggleConfig,
  latestWake,
  STAGE_TEXT,
  WAKE_STAGES,
  type WakeStage,
  wakeInFlight,
} from "../lib/wake.ts";
import type { PublicStatus } from "../lib/public-status.ts";

export type { PublicStatus };


export async function publicStatus(db: D1Database, fetcher: typeof fetch, kaggle: KaggleConfig | null = null): Promise<PublicStatus> {
  await checkKaggleRun(db, fetcher, kaggle); // a dead Kaggle run shows as failed, not "waking" forever
  const [backend, wake] = await Promise.all([getBackend(db, fetcher), latestWake(db)]);
  const waking = backend.state !== "ready" && wakeInFlight(wake);
  const current = backend.state === "ready" ? WAKE_STAGES.length - 1 : waking ? WAKE_STAGES.indexOf(wake!.stage as never) : -1;
  return {
    gateway: "ok",
    backend: waking ? "waking" : backend.state,
    stage: waking || backend.state === "ready" ? (wake?.stage ?? null) : null,
    stage_text: waking ? STAGE_TEXT[wake!.stage] : null,
    detail: waking ? (wake!.detail ?? null) : null,
    wake_started_at: waking ? new Date(wake!.requested_at).toISOString() : null,
    updated_at: wake ? new Date(wake.updated_at).toISOString() : null,
    last_failure:
      backend.state !== "ready" && wake?.stage === "failed" && Date.now() - wake.updated_at < 30 * 60_000 ? (wake.detail ?? "unknown error") : null,
    stages: WAKE_STAGES.map((id, i) => ({ id, text: STAGE_TEXT[id], done: i < current || (i === current && id === "ready"), current: i === current && id !== "ready" })),
  };
}
