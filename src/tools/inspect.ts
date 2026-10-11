// atlas_inspect (PRD P0-08, Tool 4): what happened to this project's requests, without content.
// Counts by status and source, success latency p50/p95, recent errors with request ids and
// retryable/non-retryable classification, current quota usage, key state and backend state.

import { getBackend } from "../lib/backend.ts";
import { ERRORS, type ErrorCode } from "../lib/errors.ts";
import { resolveProject } from "../lib/projects.ts";
import { LIMITS } from "../lib/quota.ts";
import type { ToolDeps } from "./context.ts";

const MAX_WINDOW_MIN = 7 * 24 * 60;

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export async function inspect(deps: ToolDeps, args: { project: string; window_minutes?: number }, now = Date.now()) {
  const project = await resolveProject(deps.db, deps.owner, args.project);
  const windowMin = Math.min(Math.max(Math.round(args.window_minutes ?? 60), 1), MAX_WINDOW_MIN);
  const since = now - windowMin * 60_000;

  const [byStatus, latencies, errors, keys, quota, backend] = await Promise.all([
    deps.db
      .prepare(
        `SELECT source, status, error_code, count(*) AS n FROM request_logs
          WHERE project_id = ? AND created_at >= ? GROUP BY source, status, error_code ORDER BY n DESC`,
      )
      .bind(project.id, since)
      .all<{ source: string; status: number; error_code: string | null; n: number }>(),
    deps.db
      .prepare(
        `SELECT latency_ms, upstream_ms FROM request_logs
          WHERE project_id = ? AND created_at >= ? AND status = 200 ORDER BY created_at DESC LIMIT 1000`,
      )
      .bind(project.id, since)
      .all<{ latency_ms: number; upstream_ms: number | null }>(),
    deps.db
      .prepare(
        `SELECT request_id, source, status, error_code, latency_ms, created_at FROM request_logs
          WHERE project_id = ? AND created_at >= ? AND status <> 200 ORDER BY created_at DESC LIMIT 10`,
      )
      .bind(project.id, since)
      .all<{ request_id: string; source: string; status: number; error_code: string | null; latency_ms: number; created_at: number }>(),
    deps.db
      .prepare(
        `SELECT sum(revoked_at IS NULL) AS active, sum(revoked_at IS NOT NULL) AS revoked FROM api_keys WHERE project_id = ?`,
      )
      .bind(project.id)
      .first<{ active: number | null; revoked: number | null }>(),
    deps.db
      .prepare(
        `SELECT window_kind, count FROM rate_windows WHERE project_id = ?
          AND ((window_kind = 'min' AND window_start = ?) OR (window_kind = 'day' AND window_start = ?))`,
      )
      .bind(project.id, now - (now % 60_000), now - (now % 86_400_000))
      .all<{ window_kind: "min" | "day"; count: number }>(),
    getBackend(deps.db, deps.fetcher),
  ]);

  const total = byStatus.results.reduce((s, r) => s + r.n, 0);
  const ok = byStatus.results.filter((r) => r.status === 200).reduce((s, r) => s + r.n, 0);
  const lat = latencies.results.map((r) => r.latency_ms).sort((a, b) => a - b);
  const up = latencies.results.flatMap((r) => (r.upstream_ms === null ? [] : [r.upstream_ms])).sort((a, b) => a - b);
  const used = Object.fromEntries(quota.results.map((r) => [r.window_kind, r.count]));
  const classify = (code: string | null) =>
    code && code in ERRORS ? { retryable: ERRORS[code as ErrorCode].retryable } : { retryable: null };

  return {
    project: { id: project.id, slug: project.slug, name: project.name },
    window_minutes: windowMin,
    requests: {
      total,
      succeeded: ok,
      failed: total - ok,
      by_outcome: byStatus.results.map((r) => ({ source: r.source, status: r.status, code: r.error_code, count: r.n })),
    },
    latency_ms: {
      sample: lat.length,
      p50: percentile(lat, 50),
      p95: percentile(lat, 95),
      upstream_p50: percentile(up, 50),
      upstream_p95: percentile(up, 95),
    },
    recent_errors: errors.results.map((e) => ({
      request_id: e.request_id,
      source: e.source,
      status: e.status,
      code: e.error_code,
      ...classify(e.error_code),
      at: new Date(e.created_at).toISOString(),
    })),
    keys: { active: keys?.active ?? 0, revoked: keys?.revoked ?? 0 },
    quota: {
      minute: { used: used.min ?? 0, limit: LIMITS.min },
      day: { used: used.day ?? 0, limit: LIMITS.day },
    },
    backend: backend.state,
    notes: [
      "Metadata only: prompts and completions are never stored.",
      "Requests with an unknown or revoked key cannot be attributed to a project, so they are not counted here.",
    ],
  };
}
