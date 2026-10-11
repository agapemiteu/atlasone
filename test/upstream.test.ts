import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getBackend, resetBackendCache } from "../src/lib/backend.ts";
import { handleUpstreamRegister, hostAllowed } from "../src/routes/upstream.ts";

const ADMIN = "admin-secret-for-tests";
const UP_KEY = "upstream-key-for-tests";
const REV = "e294476928aca9030e924ca27bb8e085e8581273";
const GOOD = { url: "https://alpha-beta.trycloudflare.com", model_id: "NCAIR1/N-ATLaS", model_revision: REV, runtime: "llama.cpp@b11552 f16" };

type Mode = "ok" | "loading" | "wrong-key" | "other-model" | "down";

function server(mode: Mode) {
  const hits: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString());
    hits.push(url.host + url.pathname);
    if (mode === "down") throw new TypeError("fetch failed");
    if (url.pathname === "/health") {
      return mode === "loading" ? new Response('{"error":{"message":"Loading model"}}', { status: 503 }) : Response.json({ status: "ok" });
    }
    const auth = new Headers(init?.headers).get("authorization");
    if (mode === "wrong-key" || auth !== `Bearer ${UP_KEY}`) return new Response("unauthorized", { status: 401 });
    return Response.json({ data: [{ id: mode === "other-model" ? "llama-3-8b" : "n-atlas-8b" }] });
  }) as typeof fetch;
  return { fetcher, hits };
}

async function register(body: unknown, opts: { mode?: Mode; admin?: string | null; method?: string } = {}) {
  const s = server(opts.mode ?? "ok");
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.admin !== null) headers.set("authorization", `Bearer ${opts.admin ?? ADMIN}`);
  const res = await handleUpstreamRegister(
    new Request("https://atlas.test/api/upstream/register", { method: opts.method ?? "POST", headers, body: opts.method === "GET" ? undefined : JSON.stringify(body) }),
    { db: env.DB, fetcher: s.fetcher, adminKey: ADMIN, upstreamKey: UP_KEY, allowedHosts: "*.trycloudflare.com, gpu.example.org" },
  );
  return { res: res!, hits: s.hits, json: (await res!.clone().json()) as Record<string, any> };
}

beforeEach(async () => {
  resetBackendCache();
  await env.DB.prepare("DELETE FROM upstreams").run();
});

describe("hostAllowed", () => {
  it("matches subdomain wildcards and exact hosts only", () => {
    const list = "*.trycloudflare.com, gpu.example.org";
    expect(hostAllowed("a-b.trycloudflare.com", list)).toBe(true);
    expect(hostAllowed("gpu.example.org", list)).toBe(true);
    expect(hostAllowed("trycloudflare.com", list)).toBe(false);
    expect(hostAllowed("evil-trycloudflare.com", list)).toBe(false);
    expect(hostAllowed("trycloudflare.com.evil.io", list)).toBe(false);
    expect(hostAllowed("x.gpu.example.org", list)).toBe(false);
  });
});

describe("POST /api/upstream/register (D3)", () => {
  it("activates a verified upstream and replaces the previous one atomically", async () => {
    const first = await register(GOOD);
    expect(first.res.status).toBe(200);
    expect(first.json).toMatchObject({ ok: true, url: GOOD.url, state: "ready" });
    const second = await register({ ...GOOD, url: "https://gamma.trycloudflare.com" });
    expect(second.res.status).toBe(200);
    const rows = (await env.DB.prepare("SELECT url, active FROM upstreams ORDER BY registered_at").all()).results;
    expect(rows).toEqual([
      { url: GOOD.url, active: 0 },
      { url: "https://gamma.trycloudflare.com", active: 1 },
    ]);
    const backend = await getBackend(env.DB, server("ok").fetcher);
    expect(backend.upstream?.url).toBe("https://gamma.trycloudflare.com");
  });

  it("requires the admin key", async () => {
    expect((await register(GOOD, { admin: null })).json.error.code).toBe("AUTH_REQUIRED");
    expect((await register(GOOD, { admin: "nope" })).res.status).toBe(401);
    expect((await register(GOOD, { method: "GET" })).res.status).toBe(404);
  });

  it("blocks SSRF-style URLs before any network call (PRD §8)", async () => {
    for (const url of [
      "http://alpha.trycloudflare.com",
      "https://169.254.169.254",
      "https://localhost",
      "https://alpha.trycloudflare.com/v1",
      "https://alpha.trycloudflare.com:8443",
      "https://user:pw@alpha.trycloudflare.com",
      "https://alpha.trycloudflare.com.evil.io",
      "not a url",
    ]) {
      const r = await register({ ...GOOD, url });
      expect(r.res.status, url).toBeGreaterThanOrEqual(400);
      expect(r.hits, url).toHaveLength(0);
    }
  });

  it("validates model provenance fields", async () => {
    expect((await register({ ...GOOD, model_id: "meta-llama/Llama-3-8B" })).json.error.code).toBe("VALIDATION_FAILED");
    expect((await register({ ...GOOD, model_revision: "main" })).json.error.code).toBe("VALIDATION_FAILED");
    expect((await register({ ...GOOD, runtime: "x".repeat(100) })).json.error.code).toBe("VALIDATION_FAILED");
  });

  it("refuses servers that are not ready or not ours", async () => {
    expect((await register(GOOD, { mode: "loading" })).json.error.code).toBe("MODEL_OFFLINE");
    expect((await register(GOOD, { mode: "down" })).json.error.code).toBe("MODEL_OFFLINE");
    expect((await register(GOOD, { mode: "wrong-key" })).json.error.code).toBe("FORBIDDEN");
    expect((await register(GOOD, { mode: "other-model" })).json.error.code).toBe("FORBIDDEN");
    const active = await env.DB.prepare("SELECT count(*) AS n FROM upstreams").first<number>("n");
    expect(active).toBe(0);
  });
});
