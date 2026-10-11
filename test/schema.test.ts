import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { makeProject } from "./helpers.ts";

describe("schema invariants", () => {
  it("binding is unique per (owner, slug) but slugs can repeat across owners (P0-04)", async () => {
    await makeProject("owner-a", "shop");
    await expect(makeProject("owner-a", "shop")).rejects.toThrow(/UNIQUE/);
    await expect(makeProject("owner-b", "shop")).resolves.toBeTypeOf("string");
  });

  it("allows only one active upstream", async () => {
    const insert = (id: string) =>
      env.DB.prepare(
        "INSERT INTO upstreams (id, url, model_id, model_revision, runtime, registered_at, active) VALUES (?, 'https://x.trycloudflare.com', 'n-atlas-8b', 'rev', 'llama.cpp', 0, 1)",
      )
        .bind(id)
        .run();
    await insert("u1");
    await expect(insert("u2")).rejects.toThrow(/UNIQUE/);
  });

  it("rejects unknown log sources and window kinds", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO request_logs (id, request_id, project_id, source, status, latency_ms, created_at) VALUES ('l', 'r', 'p', 'browser', 200, 1, 0)",
      ).run(),
    ).rejects.toThrow(/CHECK/);
    await expect(
      env.DB.prepare("INSERT INTO rate_windows VALUES ('p', 'hour', 0, 1)").run(),
    ).rejects.toThrow(/CHECK/);
  });
});

describe("worker", () => {
  it("serves /health and a structured 404", async () => {
    const health = await exports.default.fetch("https://atlas.test/health");
    expect(await health.json()).toEqual({ service: "atlas-one", gateway: "ok" });
    const missing = await exports.default.fetch("https://atlas.test/nope");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
