import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBackendCache } from "../src/lib/backend.ts";
import { createProjectKey, revokeProjectKeys, sha256Hex } from "../src/lib/credentials.ts";
import { LIMITS } from "../src/lib/quota.ts";
import { handleV1 } from "../src/routes/v1.ts";
import { fakeUpstream, type Scenario, UPSTREAM_URL } from "./fake-upstream.ts";
import { makeProject } from "./helpers.ts";

const UPSTREAM_KEY = "test-upstream-key";
const HAUSA = { messages: [{ role: "user", content: "Menene babban birnin Najeriya?" }], max_tokens: 32 };

async function registerUpstream() {
  await env.DB.prepare("DELETE FROM upstreams").run();
  await env.DB.prepare(
    "INSERT INTO upstreams (id, url, model_id, model_revision, runtime, registered_at, active) VALUES ('u1', ?, 'NCAIR1/N-ATLaS', 'e294476928aca9030e924ca27bb8e085e8581273', 'llama.cpp@b11552 f16', 0, 1)",
  )
    .bind(UPSTREAM_URL)
    .run();
}

async function setup(scenario: Scenario = "ok", opts: { upstream?: boolean } = {}) {
  if (opts.upstream !== false) await registerUpstream();
  const projectId = await makeProject();
  const { secret } = await createProjectKey(env.DB, projectId);
  const up = fakeUpstream(scenario);
  const pending: Promise<unknown>[] = [];
  const deps = { db: env.DB, fetcher: up.fetcher, upstreamKey: UPSTREAM_KEY, waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const call = async (body: unknown = HAUSA, init: { key?: string | null; headers?: Record<string, string>; path?: string; method?: string } = {}) => {
    const headers = new Headers({ "content-type": "application/json", ...init.headers });
    const key = init.key === undefined ? secret : init.key;
    if (key) headers.set("authorization", `Bearer ${key}`);
    const method = init.method ?? "POST";
    const res = await handleV1(
      new Request(`https://atlas.test${init.path ?? "/v1/chat/completions"}`, {
        method,
        headers,
        body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      }),
      deps,
    );
    return res!;
  };
  const logs = async () => {
    await Promise.all(pending);
    return (await env.DB.prepare("SELECT * FROM request_logs WHERE project_id = ? ORDER BY created_at").bind(projectId).all())
      .results as Record<string, unknown>[];
  };
  return { projectId, secret, up, call, logs };
}

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

beforeEach(() => resetBackendCache());

describe("POST /v1/chat/completions: success", () => {
  it("returns genuine upstream output with provenance and logs metadata only", async () => {
    const t = await setup("ok");
    const res = await t.call({ ...HAUSA, model: "n-atlas-8b" });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-atlas-request-id")).toMatch(/^req_[0-9a-f]{24}$/);
    expect(res.headers.get("x-atlas-weights")).toBe("NCAIR1/N-ATLaS@e294476928aca9030e924ca27bb8e085e8581273");
    expect(res.headers.get("x-atlas-runtime")).toBe("llama.cpp@b11552 f16");
    expect(res.headers.has("access-control-allow-origin")).toBe(false);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    expect(body.choices[0]!.message.content).toBe("Babban birnin Najeriya Abuja ne.");

    const completion = t.up.calls.find((c) => c.path === "/v1/chat/completions")!;
    expect(completion.auth).toBe(`Bearer ${UPSTREAM_KEY}`);
    expect(completion.body).toMatchObject({ model: "n-atlas-8b", max_tokens: 32, stream: false });

    const [log] = await t.logs();
    expect(log).toMatchObject({ status: 200, source: "app", error_code: null, prompt_tokens: 31, completion_tokens: 13 });
    expect(log!.request_id).toBe(res.headers.get("x-atlas-request-id"));
    expect(JSON.stringify(log)).not.toContain("Abuja");
    expect(JSON.stringify(log)).not.toContain("Najeriya");
  });

  it("applies N-ATLaS model-card defaults server-side; caller temperature wins", async () => {
    const t = await setup("ok");
    await t.call(HAUSA);
    const sent = t.up.calls.find((c) => c.path === "/v1/chat/completions")!.body!;
    expect(sent).toMatchObject({ temperature: 0.1, repeat_penalty: 1.12 });
    expect((sent.chat_template_kwargs as { date_string: string }).date_string).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/);
    await t.call({ ...HAUSA, temperature: 0.7 });
    const second = t.up.calls.filter((c) => c.path === "/v1/chat/completions")[1]!.body!;
    expect(second.temperature).toBe(0.7);
  });

  it("forwards only allowlisted fields", async () => {
    const t = await setup("ok");
    await t.call({ ...HAUSA, temperature: 0.2, grammar: "root ::= x", n_probs: 5 });
    const sent = t.up.calls.find((c) => c.path === "/v1/chat/completions")!.body!;
    expect(sent.temperature).toBe(0.2);
    expect(sent).not.toHaveProperty("grammar");
    expect(sent).not.toHaveProperty("n_probs");
  });

  it("forwards structured output (response_format) in the OpenAI shape and rejects malformed ones", async () => {
    const t = await setup("ok");
    const schema = { type: "object", properties: { sentiment: { enum: ["positive", "negative"] } }, required: ["sentiment"] };
    await t.call({ ...HAUSA, response_format: { type: "json_schema", json_schema: { name: "review", schema, strict: true, extra: 1 } } });
    const sent = t.up.calls.find((c) => c.path === "/v1/chat/completions")!.body!;
    expect(sent.response_format).toEqual({ type: "json_schema", json_schema: { name: "review", schema, strict: true } });
    expect(await errorCode(await t.call({ ...HAUSA, response_format: { type: "xml" } }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ ...HAUSA, response_format: { type: "json_schema", json_schema: { name: "x" } } }))).toBe("VALIDATION_FAILED");
    expect(t.up.calls.filter((c) => c.path === "/v1/chat/completions")).toHaveLength(1);
  });

  it("forwards function calling (tools, tool_choice, the tool-result round trip) and rejects malformed ones", async () => {
    const t = await setup("ok");
    const tool = { type: "function", function: { name: "track_order", description: "Order status", parameters: { type: "object" } } };
    const call = { id: "call_1", type: "function", function: { name: "track_order", arguments: '{"order_id":"KF-1042"}' } };
    await t.call({
      messages: [
        { role: "user", content: "Ina odar KF-1042?" },
        { role: "assistant", content: null, tool_calls: [call] },
        { role: "tool", tool_call_id: "call_1", content: '{"status":"shipped"}' },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "track_order" } },
    });
    const sent = t.up.calls.find((c) => c.path === "/v1/chat/completions")!.body!;
    expect(sent.tools).toEqual([tool]);
    expect(sent.tool_choice).toEqual({ type: "function", function: { name: "track_order" } });
    expect((sent.messages as unknown[])[1]).toEqual({ role: "assistant", content: null, tool_calls: [call] });
    expect((sent.messages as unknown[])[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: '{"status":"shipped"}' });
    expect(await errorCode(await t.call({ ...HAUSA, tools: [{ type: "function", function: { name: "bad name!" } }] }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ ...HAUSA, tools: [tool], tool_choice: { type: "function", function: { name: "other" } } }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ messages: [{ role: "assistant", content: null }] }))).toBe("VALIDATION_FAILED");
  });

  it("streams SSE through untouched and logs usage at the end", async () => {
    const t = await setup("ok");
    const res = await t.call({ ...HAUSA, stream: true });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text).toContain('"content":"Abuja"');
    expect(text.trim().endsWith("data: [DONE]")).toBe(true);
    expect(t.up.calls.find((c) => c.path === "/v1/chat/completions")!.body).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    const [log] = await t.logs();
    expect(log).toMatchObject({ status: 200, prompt_tokens: 31, completion_tokens: 2 });
  });

  it("records a hashed verification nonce (D11)", async () => {
    const t = await setup("ok");
    const nonce = "vn_" + "a".repeat(30);
    await t.call(HAUSA, { headers: { "x-atlas-verify": nonce } });
    await t.call(HAUSA, { headers: { "x-atlas-verify": "short" } });
    const logs = await t.logs();
    expect(logs[0]!.verify_nonce_hash).toBe(await sha256Hex(nonce));
    expect(logs[1]!.verify_nonce_hash).toBeNull();
  });

  it("caches backend state for 10s instead of probing every request (D9)", async () => {
    const t = await setup("ok");
    await t.call();
    await t.call();
    expect(t.up.calls.filter((c) => c.path === "/health")).toHaveLength(1);
  });
});

describe("POST /v1/chat/completions: failures are honest (PRD §9)", () => {
  const cases: [Scenario, number, string][] = [
    ["loading", 503, "BACKEND_WARMING"],
    ["loading-on-call", 503, "BACKEND_WARMING"],
    ["busy", 429, "BACKEND_BUSY"],
    ["bad-request", 400, "VALIDATION_FAILED"],
    ["server-error", 502, "UPSTREAM_ERROR"],
    ["tunnel-down", 503, "MODEL_OFFLINE"],
    ["network-error", 503, "MODEL_OFFLINE"],
    ["timeout", 504, "INFERENCE_TIMEOUT"],
    ["empty", 502, "INVALID_OUTPUT"],
  ];
  for (const [scenario, status, code] of cases) {
    it(`${scenario} -> ${status} ${code}, logged, no fabricated output`, async () => {
      const t = await setup(scenario);
      const res = await t.call();
      expect(res.status).toBe(status);
      const body = (await res.json()) as { error: { code: string }; choices?: unknown };
      expect(body.error.code).toBe(code);
      expect(body).not.toHaveProperty("choices");
      const [log] = await t.logs();
      expect(log).toMatchObject({ status, error_code: code });
    });
  }

  it("no registered backend -> MODEL_OFFLINE without consuming quota", async () => {
    await env.DB.prepare("DELETE FROM upstreams").run();
    const t = await setup("ok", { upstream: false });
    const res = await t.call();
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe("MODEL_OFFLINE");
    const used = await env.DB.prepare("SELECT count(*) AS n FROM rate_windows WHERE project_id = ?").bind(t.projectId).first<number>("n");
    expect(used).toBe(0);
  });

  it("an observed outage flips cached state so the next request fails fast", async () => {
    const t = await setup("network-error");
    await t.call();
    const before = t.up.calls.length;
    const res = await t.call();
    expect(await errorCode(res)).toBe("MODEL_OFFLINE");
    expect(t.up.calls.length).toBe(before);
  });

  it("warming and busy responses carry Retry-After", async () => {
    expect((await (await setup("loading")).call()).headers.get("retry-after")).toBe("15");
    resetBackendCache();
    expect((await (await setup("busy")).call()).headers.get("retry-after")).toBe("5");
  });

  it("surfaces the model server's validation message", async () => {
    const t = await setup("bad-request");
    const body = (await (await t.call()).json()) as { error: { message: string } };
    expect(body.error.message).toContain("exceeds the available context size");
  });

  it("enforces the per-minute quota with Retry-After (D12)", async () => {
    const t = await setup("ok");
    for (let i = 0; i < LIMITS.min; i++) expect((await t.call()).status).toBe(200);
    const res = await t.call();
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe("RATE_LIMITED");
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("authentication and validation", () => {
  it("rejects missing, wrong and revoked keys before touching the backend", async () => {
    const t = await setup("ok");
    expect(await errorCode(await t.call(HAUSA, { key: null }))).toBe("AUTH_REQUIRED");
    expect(await errorCode(await t.call(HAUSA, { key: "atl_live_" + "x".repeat(43) }))).toBe("INVALID_KEY");
    await revokeProjectKeys(env.DB, t.projectId);
    const res = await t.call();
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("KEY_REVOKED");
    expect(t.up.calls).toHaveLength(0);
  });

  it("rejects other models, bad bodies and oversized requests", async () => {
    const t = await setup("ok");
    expect(await errorCode(await t.call({ ...HAUSA, model: "gpt-4o" }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call("{not json"))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ messages: [] }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ messages: [{ role: "tool", content: "x" }] }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ ...HAUSA, max_tokens: 5000 }))).toBe("VALIDATION_FAILED");
    expect(await errorCode(await t.call({ ...HAUSA, stream: "yes" }))).toBe("VALIDATION_FAILED");
    const big = await t.call({ messages: [{ role: "user", content: "a".repeat(70_000) }] });
    expect(big.status).toBe(413);
    expect(t.up.calls.filter((c) => c.path === "/v1/chat/completions")).toHaveLength(0);
  });

  it("serves GET /v1/models with provenance, and 404s unknown routes", async () => {
    const t = await setup("ok");
    const models = await t.call(undefined, { method: "GET", path: "/v1/models" });
    const body = (await models.json()) as { data: { id: string; atlas: Record<string, unknown> }[] };
    expect(body.data[0]).toMatchObject({
      id: "n-atlas-8b",
      atlas: { weights: "NCAIR1/N-ATLaS@e294476928aca9030e924ca27bb8e085e8581273", backend: "ready", attribution: "Powered by Awarri" },
    });
    expect((await t.call(undefined, { method: "GET", path: "/v1/chat/completions" })).status).toBe(404);
    expect((await t.call(HAUSA, { path: "/v1/embeddings" })).status).toBe(404);
    expect(await handleV1(new Request("https://atlas.test/other"), {} as never)).toBeNull();
  });
});
