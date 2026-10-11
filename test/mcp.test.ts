// MCP conformance (D8): the official MCP client SDK drives the server in both protocol eras a real
// agent might speak (2025 "legacy" and 2026-07-28), routed straight into the Worker's handler.

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createExecutionContext, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBackendCache } from "../src/lib/backend.ts";
import { createPersonalToken, createProjectKey } from "../src/lib/credentials.ts";
import { handleMcp } from "../src/mcp.ts";
import { handleV1 } from "../src/routes/v1.ts";
import { atlasTest } from "../src/tools/test.ts";
import { fakeUpstream, type Scenario, strictFetch, UPSTREAM_URL } from "./fake-upstream.ts";
import { makeProject } from "./helpers.ts";

const ORIGIN = "https://atlas.test";
const ERAS = [
  ["2025 (legacy)", undefined],
  ["2026-07-28", { pin: "2026-07-28" }],
] as const;

async function registerUpstream() {
  await env.DB.prepare("DELETE FROM upstreams").run();
  await env.DB.prepare(
    "INSERT INTO upstreams (id, url, model_id, model_revision, runtime, registered_at, active) VALUES ('u1', ?, 'NCAIR1/N-ATLaS', 'e294476928aca9030e924ca27bb8e085e8581273', 'llama.cpp@b11552 f16', 0, 1)",
  )
    .bind(UPSTREAM_URL)
    .run();
}

async function world(scenario: Scenario = "ok", mode?: (typeof ERAS)[number][1]) {
  await registerUpstream();
  const owner = `gh-${crypto.randomUUID().slice(0, 8)}`;
  const slug = `shop-${crypto.randomUUID().slice(0, 6)}`;
  const projectId = await makeProject(owner, slug);
  const pat = await createPersonalToken(env.DB, owner);
  const up = fakeUpstream(scenario);
  const pending: Promise<unknown>[] = [];
  const deps = { db: env.DB, fetcher: up.fetcher, upstreamKey: "k", waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const route = strictFetch(async (input, init) => {
    const req = new Request(input, init);
    return (await handleMcp(req, deps, env, createExecutionContext()))!;
  });
  const client = new Client({ name: "conformance", version: "1.0.0" }, mode ? { versionNegotiation: { mode } } : undefined);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
      fetch: route,
      requestInit: { headers: { authorization: `Bearer ${pat.secret}` } },
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text: string }[])[0]!.text;
    return { isError: res.isError === true, body: JSON.parse(text) as Record<string, any> };
  };
  const settle = () => Promise.all(pending);
  return { client, call, owner, slug, projectId, up, deps, settle };
}

beforeEach(() => resetBackendCache());

describe("authentication", () => {
  it("rejects missing and unknown tokens with 401 + WWW-Authenticate before any MCP work", async () => {
    const deps = { db: env.DB, fetcher: fakeUpstream("ok").fetcher, upstreamKey: "k", waitUntil: () => {} };
    for (const auth of [undefined, "Bearer atl_pat_" + "x".repeat(43), "Bearer atl_live_" + "y".repeat(43)]) {
      const res = (await handleMcp(
        new Request(`${ORIGIN}/mcp`, { method: "POST", headers: auth ? { authorization: auth } : {}, body: "{}" }),
        deps,
        env,
        createExecutionContext(),
      ))!;
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain("Bearer");
    }
    expect(await handleMcp(new Request(`${ORIGIN}/other`), deps, env, createExecutionContext())).toBeNull();
  });
});

for (const [era, mode] of ERAS) {
  describe(`MCP ${era}`, () => {
    it("negotiates the intended protocol era", async () => {
      const { client } = await world("ok", mode);
      expect(client.getProtocolEra()).toBe(mode ? "modern" : "legacy");
      if (mode) expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
    });

    it("lists exactly the Atlas tools with honest annotations", async () => {
      const { client } = await world("ok", mode);
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["atlas_discover", "atlas_test"]);
      const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
      expect(byName.atlas_discover!.annotations).toMatchObject({ readOnlyHint: true });
      expect(byName.atlas_test!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
      expect(byName.atlas_test!.inputSchema.required).toContain("project");
    });

    it("atlas_discover reports live backend, own projects only, and a ready-to-use recipe", async () => {
      const w = await world("ok", mode);
      await makeProject("someone-else", `secret-${crypto.randomUUID().slice(0, 6)}`);
      const { body, isError } = await w.call("atlas_discover", { recipe: "nextjs" });
      expect(isError).toBe(false);
      expect(body).toMatchObject({ ok: true, gateway: "ok", backend: { state: "ready" } });
      expect(body.model).toMatchObject({ id: "n-atlas-8b", attribution: "Powered by Awarri", languages: ["en", "ha", "ig", "yo"] });
      expect(body.api.base_url).toBe(`${ORIGIN}/v1`);
      expect(body.projects.map((p: { slug: string }) => p.slug)).toEqual([w.slug]);
      expect(body.recipe).toContain(`ATLAS_ONE_BASE_URL=${ORIGIN}/v1`);
      expect(body.recipe).not.toContain("{{BASE_URL}}");
    });

    it("atlas_test inference returns genuine evidence through the shared core", async () => {
      const w = await world("ok", mode);
      const { body, isError } = await w.call("atlas_test", { project: w.slug, language: "ha" });
      expect(isError).toBe(false);
      expect(body).toMatchObject({
        ok: true,
        verified: "genuine_n_atlas_inference",
        model: "n-atlas-8b",
        weights: "NCAIR1/N-ATLaS@e294476928aca9030e924ca27bb8e085e8581273",
        output_excerpt: "Babban birnin Najeriya Abuja ne.",
      });
      expect(body.request_id).toMatch(/^req_/);
      const sent = w.up.calls.find((c) => c.path === "/v1/chat/completions")!.body!;
      expect(sent.messages).toEqual([
        { role: "system", content: "Reply in Hausa." },
        { role: "user", content: "Menene babban birnin Najeriya?" },
      ]);
      await w.settle();
      const log = await env.DB.prepare("SELECT source, status FROM request_logs WHERE request_id = ?").bind(body.request_id).first();
      expect(log).toEqual({ source: "atlas_test", status: 200 });
    });

    it("atlas_test reports an outage as an error with no fabricated output (PRD Test 4)", async () => {
      const w = await world("network-error", mode);
      const { body, isError } = await w.call("atlas_test", { project: w.slug });
      expect(isError).toBe(true);
      expect(body).toMatchObject({ ok: false, error: { code: "MODEL_OFFLINE", retryable: true } });
      expect(JSON.stringify(body)).not.toContain("Abuja");
      expect(body).not.toHaveProperty("verified");
    });

    it("cannot touch another developer's project", async () => {
      const w = await world("ok", mode);
      const theirs = `their-${crypto.randomUUID().slice(0, 6)}`;
      await makeProject("someone-else", theirs);
      const { body, isError } = await w.call("atlas_test", { project: theirs });
      expect(isError).toBe(true);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("nonce-bound app verification proves the specific route (D11)", async () => {
      const w = await world("ok", mode);
      const { secret } = await createProjectKey(env.DB, w.projectId);
      const issued = (await w.call("atlas_test", { project: w.slug, action: "issue_app_nonce" })).body;
      expect(issued).toMatchObject({ ok: true, header: "x-atlas-verify" });

      // Before the app calls: not verified, with an actionable reason.
      const early = (await w.call("atlas_test", { project: w.slug, action: "verify_app", nonce: issued.nonce })).body;
      expect(early).toMatchObject({ ok: true, verified: false });

      // An unrelated call with the same key does NOT verify the route.
      await handleV1(
        new Request(`${ORIGIN}/v1/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
        }),
        w.deps,
      );
      await w.settle();
      expect((await w.call("atlas_test", { project: w.slug, action: "verify_app", nonce: issued.nonce })).body.verified).toBe(false);

      // The app route forwards the nonce: verified, then the nonce is spent.
      await handleV1(
        new Request(`${ORIGIN}/v1/chat/completions`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-atlas-verify": issued.nonce },
          body: JSON.stringify({ messages: [{ role: "user", content: "Sannu" }] }),
        }),
        w.deps,
      );
      await w.settle();
      const ok = (await w.call("atlas_test", { project: w.slug, action: "verify_app", nonce: issued.nonce })).body;
      expect(ok).toMatchObject({ ok: true, verified: true, evidence: { status: 200, source: "app" } });
      const again = await w.call("atlas_test", { project: w.slug, action: "verify_app", nonce: issued.nonce });
      expect(again.isError).toBe(true);
    });

    it("serves recipes as resources for clients that support them", async () => {
      const { client } = await world("ok", mode);
      const res = await client.readResource({ uri: "atlas://recipes/generic" });
      expect((res.contents[0] as { text: string }).text).toContain(`${ORIGIN}/v1`);
    });
  });
}

describe("atlas_test warm-up wait", () => {
  it("waits through an observed 'loading' backend, reporting progress, then runs inference", async () => {
    await registerUpstream();
    const owner = "gh-warm";
    await makeProject(owner, "warm-app");
    let healthCalls = 0;
    const okUpstream = fakeUpstream("ok").fetcher;
    const fetcher = strictFetch(async (input, init) => {
      const path = new URL(input.toString()).pathname;
      if (path === "/health") {
        healthCalls++;
        return healthCalls < 3 ? new Response('{"error":{"message":"Loading model"}}', { status: 503 }) : Response.json({ status: "ok" });
      }
      return okUpstream(input, init); // plain call: strict fakes reject method-style invocation
    });
    const messages: string[] = [];
    const result = await atlasTest(
      { db: env.DB, fetcher, upstreamKey: "k", waitUntil: () => {}, owner, origin: ORIGIN },
      { project: "warm-app" },
      async (_step, message) => void messages.push(message),
      async () => {},
    );
    expect(result).toMatchObject({ verified: "genuine_n_atlas_inference" });
    expect(messages[0]).toBe("Checking the N-ATLaS backend");
    expect(messages.filter((m) => m.startsWith("Backend is loading"))).toHaveLength(2);
    expect(messages.at(-1)).toBe("Running a genuine N-ATLaS request");
  });

  it("fails at the backend check when offline, without announcing a model request", async () => {
    await env.DB.prepare("DELETE FROM upstreams").run();
    const owner = "gh-off";
    await makeProject(owner, "off-app");
    const messages: string[] = [];
    await expect(
      atlasTest(
        { db: env.DB, fetcher: fakeUpstream("ok").fetcher, upstreamKey: "k", waitUntil: () => {}, owner, origin: ORIGIN },
        { project: "off-app" },
        async (_s, m) => void messages.push(m),
        async () => {},
      ),
    ).rejects.toMatchObject({ code: "MODEL_OFFLINE" });
    expect(messages).toEqual(["Checking the N-ATLaS backend"]);
  });
});
