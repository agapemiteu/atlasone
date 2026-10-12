// Beta evidence (PRD Test 3 and Test 6, D19, D20): milestones come from the recorded log, team members are
// excluded from the external summary, anonymity holds in every export, tester text is escaped, the event
// log and snapshot are verifiable with the published key, and the feedback form is CSRF-protected.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { buildEvidence, exportEvents, feedbackDue, recordAgentFeedback, recordConnected, recordTool, skillOfferDue } from "../src/lib/activity.ts";
import { loadSigner, sha256Hex, verifyJwt } from "../src/lib/receipts.ts";
import { sessionCookie } from "../src/lib/session.ts";
import { handleEvidence, renderEvidence } from "../src/web/evidence.ts";
import { handlePages } from "../src/web/pages.ts";

const SECRET = "test-session-secret-0123456789abcdef";
const ORIGIN = "https://atlas.test";
const T0 = Date.UTC(2026, 9, 12, 9, 0);
const min = (n: number) => T0 + n * 60_000;

async function tester(githubId: string, login: string, client: string, steps: { inferenceAt?: number; verifiedAt?: number; errorAt?: number }) {
  const p = { githubId, login, client, sessionId: `conn_${githubId}` };
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

const evidenceDeps = async () => ({ db: env.DB, team: ["AgapeMiteu"], secret: SECRET, signer: await loadSigner(env.RECEIPT_SIGNING_KEY), origin: ORIGIN });
const get = async (path: string) => (await handleEvidence(new URL(`${ORIGIN}${path}`), await evidenceDeps()))!;

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM activity").run();
  await env.DB.prepare("DELETE FROM feedback").run();
});

describe("evidence summary", () => {
  it("measures each external tester from first connection to real inference and verified app", async () => {
    await tester("1", "ada", "Claude Code", { errorAt: min(1), inferenceAt: min(4), verifiedAt: min(9) });
    await tester("2", "bayo", "Codex", { inferenceAt: min(6), verifiedAt: min(13) });
    await tester("3", "chidi", "Cursor", { inferenceAt: min(2) });
    await tester("9", "agapemiteu", "Claude Code", { inferenceAt: min(1), verifiedAt: min(2) });

    const e = await buildEvidence(env.DB, ["AgapeMiteu"], SECRET, min(30));
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
      sessions: 1,
      first_inference: { minutes_after_connect: 4, request_id: "req_inf_ada", session: "conn_1" },
      app_verified: { minutes_after_connect: 9, request_id: "req_app_ada" },
      apps_verified: 1,
      tool_errors: { BACKEND_WARMING: 1 },
    });
    expect(ada.tester_id).toMatch(/^t_[0-9a-f]{12}$/);
    // The standard per-tester view: one build per project, then every step in order.
    expect(ada.builds).toEqual([
      { project: "app", sessions: ["conn_1"], started: new Date(min(1)).toISOString(), ended: new Date(min(9)).toISOString(), calls: 3, real_inferences: 1, verified_requests: ["req_app_ada"], errors: 1 },
    ]);
    expect(ada.activity.map((a) => a.event)).toEqual(["connected", "tool_call", "tool_call", "tool_call"]);
    const html = await renderEvidence(e).text();
    expect(html).toContain("Activity by tester");
    expect(html).toContain("Verified app");
    expect(html).toContain("Feedback:</b> not given yet");
    expect(e.testers.at(-1)).toMatchObject({ tester: "@agapemiteu", team: true });
    // Metadata only: model output never reaches the log.
    expect(JSON.stringify(await env.DB.prepare("SELECT * FROM activity").all())).not.toContain("SECRET OUTPUT");
  });

  it("honours anonymity everywhere and escapes tester-written text", async () => {
    await tester("1", "ada", "Claude Code", { inferenceAt: min(3) });
    await env.DB.prepare(
      "INSERT INTO feedback VALUES ('1', 'ada', 0, 'Claude Code', 'Next.js', 8, 'none', '<script>alert(1)</script>', 5, 1, 'https://github.com/ada/shop', 'web', NULL)",
    ).run();
    const e = await buildEvidence(env.DB, [], SECRET);
    expect(e.testers[0]).toMatchObject({ profile: null, feedback: { rating: 5 } });
    expect(e.testers[0]!.tester).toMatch(/^Anonymous tester \(t_[0-9a-f]{12}\)$/);
    const html = await renderEvidence(e).text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).not.toContain("@ada");
    expect(html).not.toContain("github.com/ada");
    expect(e.testers[0]!.feedback!.repo_url).toBeNull();
    expect(await exportEvents(env.DB, [], SECRET)).not.toContain('"ada"');
  });
});

describe("verifiable exports (D20)", () => {
  it("publishes the signing key as a JWK Set without the private part", async () => {
    const jwks = (await (await get("/.well-known/jwks.json")).json()) as { keys: Record<string, string>[] };
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig" });
    expect(jwks.keys[0]!.d).toBeUndefined();
  });

  it("serves one JSON Lines trace per tester and a signed snapshot whose digest matches the log", async () => {
    await tester("1", "ada", "Claude Code", { inferenceAt: min(4), verifiedAt: min(9) });
    await tester("2", "bayo", "Codex", { inferenceAt: min(6) });
    const all = await (await get("/evidence/events.jsonl")).text();
    const events = all.trimEnd().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(events).toHaveLength(5);
    expect(events[0]).toMatchObject({ schema: "atlas-one.evidence/v1", event: "connected", session: "conn_1", login: "ada" });

    const ada = events.find((e) => e.login === "ada")!.tester as string;
    const trace = (await (await get(`/evidence/events.jsonl?tester=${ada}`)).text()).trimEnd().split("\n").map((l) => JSON.parse(l));
    expect(trace.map((e) => e.event)).toEqual(["connected", "tool_call", "tool_call"]);
    expect(trace.at(-1)).toMatchObject({ action: "verify_app", verified: true, request_id: "req_app_ada", outcome: "ok" });

    const snap = (await (await get("/evidence/snapshot.json")).json()) as { events: string; events_sha256: string; jwt: string };
    expect(snap.events).toBe(all);
    expect(snap.events_sha256).toBe(await sha256Hex(all));
    const jwks = (await (await get("/.well-known/jwks.json")).json()) as never;
    const { header, claims } = await verifyJwt(snap.jwt, jwks);
    expect(header.typ).toBe("atlas-evidence+jwt");
    expect(claims).toMatchObject({ iss: ORIGIN, events_sha256: snap.events_sha256, event_count: 5, summary: { external_testers: 2 } });

    // Any edit to a signed token is detected.
    const [h, p, s] = snap.jwt.split(".");
    const forged = `${h}.${btoa(JSON.stringify({ ...claims, event_count: 50 })).replace(/=+$/, "")}.${s}`;
    await expect(verifyJwt(forged, jwks)).rejects.toThrow("signature does not verify");
    expect(p).toBeTruthy();
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
    expect((await go({ method: "POST", body: form(csrf, { repo_url: "javascript:alert(1)" }) })).status).toBe(400);
    expect((await go({ method: "POST", body: form(csrf, { repo_url: "https://evil.example/x" }) })).status).toBe(400);
    expect((await go({ method: "POST", body: form(csrf) })).status).toBe(200);
    expect((await go({ method: "POST", body: form(csrf, { rating: "5", repo_url: "https://github.com/bayo/api" }) })).status).toBe(200);
    const rows = await env.DB.prepare("SELECT login, agent, stack, minutes, rating, anonymous, repo_url FROM feedback").all();
    expect(rows.results).toEqual([
      { login: "bayo", agent: "Codex", stack: "FastAPI", minutes: 12, rating: 5, anonymous: 0, repo_url: "https://github.com/bayo/api" },
    ]);
  });
});

describe("in-session feedback prompt", () => {
  it("asks again when a long-lived connection verifies a second app, and stays quiet for a day after an answer", async () => {
    // The first external tester's case: one OAuth connection, two builds; the second verification must still ask.
    await tester("9", "tobi", "Codex", { inferenceAt: min(1), verifiedAt: min(5) });
    const p = { githubId: "9", login: "tobi", client: "Codex", sessionId: "conn_9" };
    expect(await feedbackDue(env.DB, p, { verified: true }, min(120))).toBe("app_verified");
    expect(await feedbackDue(env.DB, p, { verified: false }, min(120))).toBeNull();
    await recordAgentFeedback(env.DB, p, { rating: 4, issues: "Igbo wording needs review." }, min(121));
    expect(await feedbackDue(env.DB, p, { verified: true }, min(180))).toBeNull();
    expect(await feedbackDue(env.DB, p, { verified: true }, min(121 + 24 * 60 + 1))).toBe("app_verified");
  });

  it("asks after a long stretch of use: the 12th call since the last answer", async () => {
    const p = { githubId: "8", login: "kemi", client: "Cursor", sessionId: "conn_8" };
    const payload = { ok: true };
    for (let i = 0; i < 10; i++) await recordTool(env.DB, p, { tool: "atlas_discover", action: null, project: null, ms: 1, payload }, min(i));
    expect(await feedbackDue(env.DB, p, { verified: false }, min(11))).toBeNull(); // 11th call
    await recordTool(env.DB, p, { tool: "atlas_discover", action: null, project: null, ms: 1, payload }, min(11));
    expect(await feedbackDue(env.DB, p, { verified: false }, min(12))).toBe("long_session"); // 12th call
  });
});

describe("agent skill offer", () => {
  it("is offered on a developer's 3rd tool call and once more on the 25th, not otherwise", async () => {
    const p = { githubId: "7", login: "zainab", client: "Claude Code", sessionId: "conn_7" };
    const payload = { ok: true };
    const due: number[] = [];
    for (let n = 1; n <= 26; n++) {
      if (await skillOfferDue(env.DB, p)) due.push(n);
      await recordTool(env.DB, p, { tool: "atlas_discover", action: null, project: null, ms: 1, payload }, min(n));
    }
    expect(due).toEqual([3, 25]);
  });
});
