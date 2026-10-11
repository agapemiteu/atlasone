// Per-project quotas (D4, D12), enforced before any request reaches the model.
//
//   request ─► minute counter: conditional upsert ── at limit ─► RATE_LIMITED (nothing changed)
//                     │ +1
//                     ▼
//              day counter: conditional upsert ──── at limit ─► RATE_LIMITED (day exhausted)
//                     │ +1
//                     ▼
//                  admitted
//
// Each upsert is a single SQLite statement, so it is atomic: concurrent requests cannot both take
// the last slot. A request rejected by the minute limit never consumes daily quota.

import { AtlasError } from "./errors.ts";

export const LIMITS = { min: 30, day: 500 } as const;
const WINDOW_MS = { min: 60_000, day: 86_400_000 } as const;

type Window = keyof typeof LIMITS;

const UPSERT = `
  INSERT INTO rate_windows (project_id, window_kind, window_start, count) VALUES (?1, ?2, ?3, 1)
  ON CONFLICT (project_id, window_kind, window_start)
    DO UPDATE SET count = count + 1 WHERE count < ?4
  RETURNING count`;

async function take(db: D1Database, projectId: string, kind: Window, now: number): Promise<number | null> {
  const start = now - (now % WINDOW_MS[kind]);
  const row = await db.prepare(UPSERT).bind(projectId, kind, start, LIMITS[kind]).first<{ count: number }>();
  return row?.count ?? null;
}

function secondsLeft(kind: Window, now: number): number {
  return Math.ceil((WINDOW_MS[kind] - (now % WINDOW_MS[kind])) / 1000);
}

export interface QuotaUsage {
  minute: number;
  day: number;
}

/** Admits one request for the project or throws RATE_LIMITED with retry_after. */
export async function consumeQuota(db: D1Database, projectId: string, now = Date.now()): Promise<QuotaUsage> {
  const minute = await take(db, projectId, "min", now);
  if (minute === null) {
    throw new AtlasError("RATE_LIMITED", `Limit of ${LIMITS.min} requests per minute reached for this project.`, {
      retryAfterS: secondsLeft("min", now),
    });
  }
  const day = await take(db, projectId, "day", now);
  if (day === null) {
    throw new AtlasError("RATE_LIMITED", `Limit of ${LIMITS.day} requests per day reached for this project.`, {
      retryAfterS: secondsLeft("day", now),
    });
  }
  return { minute, day };
}
