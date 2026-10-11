import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBackendCache } from "../src/lib/backend.ts";
import { sessionCookie } from "../src/lib/session.ts";
import { handlePages } from "../src/web/pages.ts";
import { homePage } from "../src/web/site.ts";
import type { PublicStatus } from "../src/web/status.ts";

function status(backend: PublicStatus["backend"]): PublicStatus {
  return { gateway: "ok", backend, stage: null, stage_text: null, detail: null, wake_started_at: null, updated_at: null, stages: [], last_failure: null };
}
import { fakeUpstream, type Scenario, UPSTREAM_URL } from "./fake-upstream.ts";

const SECRET = "test-session-secret-0123456789abcdef";
const ORIGIN = "https://atlas.test";

describe("how-to page", () => {
  it("gives every major client a setup snippet pointing at the same MCP URL, in English and Hausa", async () => {
    const html = await homePage(ORIGIN, status("ready")).text();
    for (const client of ["Claude Code", "Codex", "Cursor", "VS Code", "Windsurf", "Gemini CLI", "Any other MCP client"]) {
      expect(html, client).toContain(client);
    }
    expect(html.match(new RegExp(`${ORIGIN}/mcp`, "g"))!.length).toBeGreaterThanOrEqual(7);
    expect(html).toContain("A Hausa");
    expect(html).toContain("Powered by Awarri");
    expect(html).toContain("Federal Ministry of Communications");
    expect(html).toContain("N-ATLaS is online");
  });

  it("states an outage honestly", async () => {
    const html = await homePage(ORIGIN, status("offline")).text();
    expect(html).toContain("N-ATLaS is asleep");
    expect(html).toContain("never a fake answer");
    expect(html).toContain("wakes automatically");
  });
});

describe("playground", () => {
  beforeEach(async () => {
    resetBackendCache();
    await env.DB.prepare("DELETE FROM upstreams").run();
    await env.DB.prepare(
      "INSERT INTO upstreams (id, url, model_id, model_revision, runtime, registered_at, active) VALUES ('u1', ?, 'NCAIR1/N-ATLaS', 'e294476928aca9030e924ca27bb8e085e8581273', 'llama.cpp@b11552 f16', 0, 1)",
    )
      .bind(UPSTREAM_URL)
      .run();
  });

  async function as(githubId: string, scenario: Scenario = "ok") {
    const cookie = (await sessionCookie(SECRET, { githubId, login: "dev" })).split(";")[0]!;
    const deps = { db: env.DB, sessionSecret: SECRET, origin: ORIGIN, fetcher: fakeUpstream(scenario).fetcher, upstreamKey: "k", waitUntil: () => {} };
    return (init: RequestInit = {}) =>
      handlePages(new Request(`${ORIGIN}/playground`, { ...init, headers: { cookie } }), deps).then((r) => r!);
  }

  it("requires sign-in", async () => {
    const deps = { db: env.DB, sessionSecret: SECRET, origin: ORIGIN, fetcher: fakeUpstream("ok").fetcher, upstreamKey: "k", waitUntil: () => {} };
    const res = (await handlePages(new Request(`${ORIGIN}/playground`), deps))!;
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Fplayground");
  });

  it("returns genuine output with provenance, through the shared core, on the developer's own project", async () => {
    const go = await as("gh-play");
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await go()).text())![1]!;
    const html = await (await go({ method: "POST", body: new URLSearchParams({ csrf, lang: "ha", prompt: "Sannu" }) })).text();
    expect(html).toContain("Babban birnin Najeriya Abuja ne.");
    expect(html).toContain("NCAIR1/N-ATLaS@e294476928aca9030e924ca27bb8e085e8581273");
    expect(html).toMatch(/req_[0-9a-f]{24}/);
    expect(html).toContain("Powered by Awarri");
    await go({ method: "POST", body: new URLSearchParams({ csrf, lang: "yo", prompt: "" }) });
    const n = await env.DB.prepare("SELECT count(*) AS n FROM projects WHERE owner_github_id = 'gh-play' AND slug = 'playground'").first<number>("n");
    expect(n).toBe(1);
  });

  it("shows an outage as an error, never a substitute answer", async () => {
    const go = await as("gh-play-off", "network-error");
    const csrf = /name="csrf" value="([^"]+)"/.exec(await (await go()).text())![1]!;
    const html = await (await go({ method: "POST", body: new URLSearchParams({ csrf, lang: "ha", prompt: "Sannu" }) })).text();
    expect(html).toContain("MODEL_OFFLINE");
    expect(html).not.toContain("Abuja");
  });

  it("rejects a forged form", async () => {
    const go = await as("gh-play-csrf");
    const res = await go({ method: "POST", body: new URLSearchParams({ csrf: "nope", lang: "ha", prompt: "x" }) });
    expect(res.status).toBe(403);
  });
});
