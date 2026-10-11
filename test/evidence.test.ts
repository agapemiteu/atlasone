// Beta evidence (PRD Test 3 and Test 6): milestones are derived from recorded activity, team members are
// excluded from the external summary, testers can be anonymous, tester text is escaped, and the
// feedback form is CSRF-protected and validated.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { buildEvidence, recordConnected, recordTool } from "../src/lib/activity.ts";
import { sessionCookie } from "../src/lib/session.ts";
import { renderEvidence } from "../src/web/evidence.ts";
import { handlePages } from "../src/web/pages.ts";

const SECRET = "test-session-secret-0123456789abcdef";
const ORIGIN = "https://atlas.test";
const T0 = Date.UTC(2026, 9, 12, 9, 0);
const min = (n: number) => T0 + n * 60_000;

async function tester(githubId: string, login: string, client: string, steps: { inferenceAt?: number; verifiedAt?: number; errorAt?: number }) {
  const p = { githubId, login, client };
  await recordConnected(env.DB, p, T0);
  if (steps.errorAt) {
    const payload = { ok: false, error: { code: "BACKEND_WARMING", request_id: "req_warm" } };
    await recordTool(env.DB, p, { tool: "atlas_test", action: "inference", project: "app", ms: 5, payload }, steps.errorAt);
  }
  if (steps.inferenceAt) {
    const payload = { ok: true, request_id: `req_inf_${login}`, output: "SECRET OUTPUT" };
    await recordTool(env.DB, p, { tool: "atlas_test", action: "inference", project: "app", ms: 900, payload }, steps.inferenceAt);
  }
  if (steps.verifiedAt) {
    const payload = { ok: true, action: "verify_app", verified: true, evidence: { request_id: `req_app_${login}` } };
    await recordTool(env.DB, p, { tool: "atlas_test", action: "verify_app", project: "app", ms: 30, payload }, steps.verifiedAt);
  }
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM activity").run();
  await env.DB.prepare("DELETE FROM feedback").run();
});

describe("evidence", () => {
  it("measures each external tester from first connection to real inference and verified app", async () => {
    await tester("1", "ada", "Claude Code", { errorAt: min(1), inferenceAt: min(4), verifiedAt: min(9) });
    await tester("2", "bayo", "Codex", { inferenceAt: min(6), verifiedAt: min(13) });
    await tester("3", "chidi", "Cursor", { inferenceAt: min(2) });
    await tester("9", "agapemiteu", "Claude Code", { inferenceAt: min(1), verifiedAt: min(2) });

    const e = await buildEvidence(env.DB, ["AgapeMiteu"], min(30));
    expect(e.summary).toMatchObject({
      external_testers: 3,
      external_with_real_inference: 3,
      external_with_verified_app: 2,
      median_minutes_to_first_inference: 4,
      median_minutes_to_verified_app: 11,
    });
    const ada = e.testers.find((t) => t.tester === "@ada")!;
    expect(ada).toMatchObject({
      agents: ["Claude Code"],
      first_inference: { minutes_after_connect: 4, request_id: "req_inf_ada" },
      app_verified: { minutes_after_connect: 9, request_id: "req_app_ada" },
      tool_errors: { BACKEND_WARMING: 1 },
    });
    expect(e.testers.at(-1)).toMatchObject({ tester: "@agapemiteu", team: true });
    // Metadata only: model output never reaches the activity log.
    const dump = JSON.stringify(await env.DB.prepare("SELECT * FROM activity").all());
    expect(dump).not.toContain("SECRET OUTPUT");
  });

  it("honours anonymity and escapes tester-written text on the public page", async () => {
    await tester("1", "ada", "Claude Code", { inferenceAt: min(3) });
    await env.DB.prepare(
      "INSERT INTO feedback VALUES ('1', 'ada', 0, 'Claude Code', 'Next.js', 8, 'none', '<script>alert(1)</script>', 5, 1)",
    ).run();
    const e = await buildEvidence(env.DB, []);
    expect(e.testers[0]).toMatchObject({ tester: "Anonymous tester 1", profile: null, feedback: { rating: 5 } });
    expect(e.summary.average_rating).toBe(5);
    const html = await renderEvidence(e).text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).not.toContain("@ada");
  });
});

describe("feedback form", () => {
  const deps = { db: env.DB, sessionSecret: SECRET, origin: ORIGIN, fetcher: fetch, upstreamKey: "k", waitUntil: () => {} };

  async function as(githubId: string, login: string) {
    const cookie = (await sessionCookie(SECRET, { githubId, login })).split(";")[0]!;
    return (init: RequestInit = {}) => handlePages(new Request(`${ORIGIN}/feedback`, { ...init, headers: { cookie } }), deps).then((r) => r!);
  }
  const form = (csrf: string, extra: Record<string, string> = {}) =>
    new URLSearchParams({ csrf, agent: "Codex", stack: "FastAPI", minutes: "12", manual_steps: "pasted the key", issues: "", rating: "4", ...extra });

  it("requires sign-in", async () => {
    const res = (await handlePages(new Request(`${ORIGIN}/feedback`), deps))!;
    expect(res.headers.get("location")).toBe("/login?next=%2Ffeedback");
  });

  it("validates, rejects forged posts, and keeps one answer per tester", async () => {
    const go = await as("77", "bayo");
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await go()).text())![1]!;
    expect((await go({ method: "POST", body: form("forged") })).status).toBe(403);
    expect((await go({ method: "POST", body: form(csrf, { rating: "9" }) })).status).toBe(400);
    expect((await go({ method: "POST", body: form(csrf, { agent: "Not an agent" }) })).status).toBe(400);
    expect((await go({ method: "POST", body: form(csrf) })).status).toBe(200);
    expect((await go({ method: "POST", body: form(csrf, { rating: "5" }) })).status).toBe(200);
    const rows = await env.DB.prepare("SELECT login, agent, stack, minutes, rating, anonymous FROM feedback").all();
    expect(rows.results).toEqual([{ login: "bayo", agent: "Codex", stack: "FastAPI", minutes: 12, rating: 5, anonymous: 0 }]);
  });
});
