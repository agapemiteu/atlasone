import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBackendCache } from "../src/lib/backend.ts";
import { createProjectKey, revokeProjectKeys } from "../src/lib/credentials.ts";
import { consumeQuota } from "../src/lib/quota.ts";
import { ALL_SCOPES } from "../src/tools/context.ts";
import { inspect } from "../src/tools/inspect.ts";
import { fakeUpstream } from "./fake-upstream.ts";
import { makeProject } from "./helpers.ts";

const NOW = Date.UTC(2026, 9, 11, 15, 30, 0);

async function log(projectId: string, row: { status: number; code?: string; latency: number; upstream?: number; ago_min: number; source?: string }) {
  await env.DB.prepare(
    `INSERT INTO request_logs (id, request_id, project_id, source, status, error_code, latency_ms, upstream_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), `req_${crypto.randomUUID().slice(0, 8)}`, projectId, row.source ?? "app", row.status, row.code ?? null, row.latency, row.upstream ?? null, NOW - row.ago_min * 60_000)
    .run();
}

function deps(owner: string) {
  return { db: env.DB, fetcher: fakeUpstream("ok").fetcher, upstreamKey: "k", waitUntil: () => {}, owner, origin: "https://atlas.test", scopes: ALL_SCOPES };
}

beforeEach(() => resetBackendCache());

describe("atlas_inspect", () => {
  it("summarises outcomes, latency percentiles, classified errors, quota and keys", async () => {
    const owner = "gh-insp";
    const projectId = await makeProject(owner, "insp-app");
    for (const latency of [100, 200, 300, 400, 1000]) await log(projectId, { status: 200, latency, upstream: latency - 50, ago_min: 5 });
    await log(projectId, { status: 503, code: "MODEL_OFFLINE", latency: 12, ago_min: 3 });
    await log(projectId, { status: 400, code: "VALIDATION_FAILED", latency: 4, ago_min: 2 });
    await log(projectId, { status: 200, latency: 9999, ago_min: 120 }); // outside the 60-minute window
    await createProjectKey(env.DB, projectId);
    await consumeQuota(env.DB, projectId, NOW);

    const r = await inspect(deps(owner), { project: "insp-app" }, NOW);
    expect(r.requests).toMatchObject({ total: 7, succeeded: 5, failed: 2 });
    expect(r.latency_ms).toMatchObject({ sample: 5, p50: 300, p95: 1000, upstream_p50: 250 });
    expect(r.recent_errors.map((e) => [e.code, e.retryable])).toEqual([
      ["VALIDATION_FAILED", false],
      ["MODEL_OFFLINE", true],
    ]);
    expect(r.quota).toEqual({ minute: { used: 1, limit: 30 }, day: { used: 1, limit: 500 } });
    expect(r.keys).toEqual({ active: 1, revoked: 0 });
    expect(JSON.stringify(r)).not.toMatch(/Abuja|prompt_text/);
  });

  it("widens the window when asked and clamps silly values", async () => {
    const owner = "gh-insp2";
    const projectId = await makeProject(owner, "insp-two");
    await log(projectId, { status: 200, latency: 50, ago_min: 120 });
    expect((await inspect(deps(owner), { project: "insp-two" }, NOW)).requests.total).toBe(0);
    expect((await inspect(deps(owner), { project: "insp-two", window_minutes: 180 }, NOW)).requests.total).toBe(1);
    expect((await inspect(deps(owner), { project: "insp-two", window_minutes: 10 ** 9 }, NOW)).window_minutes).toBe(10080);
  });

  it("reports revoked keys and is scoped to the owner", async () => {
    const projectId = await makeProject("gh-a", "shared-name");
    await createProjectKey(env.DB, projectId);
    await revokeProjectKeys(env.DB, projectId);
    expect((await inspect(deps("gh-a"), { project: "shared-name" }, NOW)).keys).toEqual({ active: 0, revoked: 1 });
    await expect(inspect(deps("gh-b"), { project: "shared-name" }, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
