import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AtlasError } from "../src/lib/errors.ts";
import { consumeQuota, LIMITS } from "../src/lib/quota.ts";
import { makeProject } from "./helpers.ts";

const T0 = Date.UTC(2026, 9, 11, 12, 0, 0); // window-aligned: 12:00:00.000 UTC

async function outcome(projectId: string, now: number) {
  try {
    return await consumeQuota(env.DB, projectId, now);
  } catch (e) {
    if (!(e instanceof AtlasError)) throw e;
    return { code: e.code, retryAfterS: e.retryAfterS };
  }
}

describe("consumeQuota", () => {
  it("admits up to the minute limit, then rejects with retry_after", async () => {
    const p = await makeProject();
    for (let i = 1; i <= LIMITS.min; i++) {
      expect(await consumeQuota(env.DB, p, T0 + i)).toEqual({ minute: i, day: i });
    }
    expect(await outcome(p, T0 + 15_000)).toEqual({ code: "RATE_LIMITED", retryAfterS: 45 });
  });

  it("opens a new minute window", async () => {
    const p = await makeProject();
    for (let i = 0; i < LIMITS.min; i++) await consumeQuota(env.DB, p, T0);
    expect(await consumeQuota(env.DB, p, T0 + 60_000)).toEqual({ minute: 1, day: LIMITS.min + 1 });
  });

  it("a minute-limit rejection does not consume daily quota", async () => {
    const p = await makeProject();
    for (let i = 0; i < LIMITS.min; i++) await consumeQuota(env.DB, p, T0);
    for (let i = 0; i < 10; i++) await outcome(p, T0);
    const day = await env.DB.prepare("SELECT count FROM rate_windows WHERE project_id = ? AND window_kind = 'day'")
      .bind(p)
      .first<number>("count");
    expect(day).toBe(LIMITS.min);
  });

  it("enforces the daily limit across minute windows", async () => {
    const p = await makeProject();
    const dayStart = T0 - (T0 % 86_400_000);
    await env.DB.prepare("INSERT INTO rate_windows VALUES (?, 'day', ?, ?)").bind(p, dayStart, LIMITS.day - 1).run();
    expect(await consumeQuota(env.DB, p, T0)).toEqual({ minute: 1, day: LIMITS.day });
    const r = await outcome(p, T0 + 60_000); // fresh minute window, exhausted day
    expect(r).toEqual({ code: "RATE_LIMITED", retryAfterS: 12 * 3600 - 60 });
    expect(await consumeQuota(env.DB, p, dayStart + 86_400_000)).toEqual({ minute: 1, day: 1 });
  });

  it("is exact under a concurrent burst (D12)", async () => {
    const p = await makeProject();
    const results = await Promise.all(Array.from({ length: 50 }, () => outcome(p, T0)));
    expect(results.filter((r) => "minute" in r)).toHaveLength(LIMITS.min);
    expect(results.filter((r) => "code" in r)).toHaveLength(50 - LIMITS.min);
  });

  it("keeps projects independent", async () => {
    const a = await makeProject();
    const b = await makeProject();
    for (let i = 0; i < LIMITS.min; i++) await consumeQuota(env.DB, a, T0);
    expect(await outcome(a, T0)).toMatchObject({ code: "RATE_LIMITED" });
    expect(await consumeQuota(env.DB, b, T0)).toEqual({ minute: 1, day: 1 });
  });
});
