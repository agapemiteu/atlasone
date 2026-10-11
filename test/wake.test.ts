// Wake-on-demand: developers never start the GPU; a request that finds N-ATLaS asleep wakes it, and
// everyone sees the model server's own reported progress.

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resetBackendCache } from "../src/lib/backend.ts";
import { createProjectKey } from "../src/lib/credentials.ts";
import { checkKaggleRun, kaggleAuth, latestWake, redeemBootstrap, requestWake, resetKaggleCheck } from "../src/lib/wake.ts";
import { handleUpstreamRegister } from "../src/routes/upstream.ts";
import { handleV1 } from "../src/routes/v1.ts";
import { ALL_SCOPES } from "../src/tools/context.ts";
import { atlasTest } from "../src/tools/test.ts";
import { publicStatus } from "../src/web/status.ts";
import { strictFetch, UPSTREAM_URL } from "./fake-upstream.ts";
import { makeProject } from "./helpers.ts";

const KAGGLE = { username: "agapemiteu", key: "kaggle-key-123", kernelSlug: "notebookf585471141" };
const ADMIN = "admin-secret-for-tests";

/** Fake world: Kaggle API + a backend that is down (tunnel gone). */
function world(kaggleReply: () => Response = () => Response.json({ ref: "/code/agapemiteu/notebookf585471141", versionNumber: 7 })) {
  const kaggleCalls: { url: string; auth: string | null; body: Record<string, unknown> }[] = [];
  const fetcher = strictFetch(async (input, init) => {
    const url = input.toString();
    if (url.startsWith("https://api.kaggle.com/")) {
      kaggleCalls.push({ url, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
      return kaggleReply();
    }
    throw new TypeError("fetch failed"); // the sleeping backend's tunnel no longer exists
  });
  return { fetcher, kaggleCalls };
}

async function sleepingBackend() {
  await env.DB.prepare("DELETE FROM upstreams").run();
  await env.DB.prepare("DELETE FROM backend_wakes").run();
  await env.DB.prepare(
    "INSERT INTO upstreams (id, url, model_id, model_revision, runtime, registered_at, active) VALUES ('u-old', ?, 'NCAIR1/N-ATLaS', 'e294476928aca9030e924ca27bb8e085e8581273', 'llama.cpp@b11552 f16', 0, 1)",
  )
    .bind(UPSTREAM_URL)
    .run();
}

beforeEach(async () => {
  resetBackendCache();
  await sleepingBackend();
});

describe("requestWake", () => {
  it("starts the Kaggle notebook on GPU T4 x2 with the real server script", async () => {
    const w = world();
    const wake = await requestWake(env.DB, w.fetcher, KAGGLE, "project:p1");
    expect(wake).toMatchObject({ stage: "gpu_requested" });
    expect(w.kaggleCalls).toHaveLength(1);
    const call = w.kaggleCalls[0]!;
    expect(call.url).toBe("https://api.kaggle.com/v1/kernels.KernelsApiService/SaveKernel");
    expect(call.auth).toBe(`Basic ${btoa("agapemiteu:kaggle-key-123")}`);
    expect(call.body).toMatchObject({
      slug: "agapemiteu/notebookf585471141",
      kernelType: "notebook",
      isPrivate: true,
      enableGpu: true,
      enableInternet: true,
      machineShape: "NvidiaTeslaT4",
      kernelExecutionType: "SAVE_AND_RUN_ALL",
    });
    expect(wake!.detail).toBe("Kaggle accepted run (notebook version 7)");
    const nb = JSON.parse(call.body.text as string) as { cells: { source: string }[] };
    const source = nb.cells[0]!.source;
    expect(source).toContain("Genuine N-ATLaS inference on Kaggle");
    expect(source).toContain('report("notebook_started"');
    // Only a single-use bootstrap token goes into the notebook (versions are kept forever), never a key.
    expect(source).toMatch(/^BOOTSTRAP_TOKEN = "bt_[A-Za-z0-9_-]{43}"$/m);
    expect(source).not.toMatch(/atl_admin_|atl_up_|hf_[A-Za-z0-9]{10,}/);
  });

  it("is debounced: concurrent and repeated requests start one GPU run", async () => {
    const w = world();
    await Promise.all(Array.from({ length: 5 }, (_, i) => requestWake(env.DB, w.fetcher, KAGGLE, `project:p${i}`)));
    await requestWake(env.DB, w.fetcher, KAGGLE, "project:again");
    expect(w.kaggleCalls).toHaveLength(1);
    const n = await env.DB.prepare("SELECT count(*) AS n FROM backend_wakes").first<number>("n");
    expect(n).toBe(1);
  });

  it("records Kaggle refusals as a failed wake instead of hanging", async () => {
    const w = world(() => Response.json({ error: "Quota exceeded" }));
    const wake = await requestWake(env.DB, w.fetcher, KAGGLE, "user:1");
    expect(wake).toMatchObject({ stage: "failed" });
    expect(wake!.detail).toContain("Quota exceeded");
  });

  it("retries after a stuck wake times out, and is off without a Kaggle key", async () => {
    const w = world();
    await env.DB.prepare(
      "INSERT INTO backend_wakes (id, requested_at, requested_by, stage, detail, updated_at) VALUES ('old', ?, 'user:1', 'loading_weights', NULL, ?)",
    )
      .bind(Date.now() - 25 * 60_000, Date.now() - 25 * 60_000)
      .run();
    await requestWake(env.DB, w.fetcher, KAGGLE, "user:1");
    expect(w.kaggleCalls).toHaveLength(1);
    expect(await requestWake(env.DB, w.fetcher, null, "user:1")).toBeNull();
  });
});

describe("bootstrap exchange (Kaggle secrets are unavailable to API-started runs)", () => {
  const exchange = (token: string) =>
    handleUpstreamRegister(
      new Request("https://atlas.test/api/upstream/bootstrap", { method: "POST", body: JSON.stringify({ token }) }),
      { db: env.DB, fetcher: world().fetcher, adminKey: ADMIN, upstreamKey: "up-key", allowedHosts: "*.trycloudflare.com", hfToken: "hf-read" },
    ).then((r) => r!);

  it("hands the woken server its keys exactly once", async () => {
    const w = world();
    await requestWake(env.DB, w.fetcher, KAGGLE, "user:1");
    const nb = JSON.parse(w.kaggleCalls[0]!.body.text as string) as { cells: { source: string }[] };
    const token = /BOOTSTRAP_TOKEN = "([^"]+)"/.exec(nb.cells[0]!.source)![1]!;
    const first = await exchange(token);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ upstream_key: "up-key", admin_key: ADMIN, hf_token: "hf-read" });
    expect((await exchange(token)).status).toBe(401);
    expect((await exchange("bt_" + "x".repeat(43))).status).toBe(401);
    expect((await exchange("not-a-token")).status).toBe(401);
  });

  it("refuses tokens older than 30 minutes", async () => {
    const w = world();
    const old = Date.now() - 31 * 60_000;
    await requestWake(env.DB, w.fetcher, KAGGLE, "user:1", old);
    const token = /BOOTSTRAP_TOKEN = "([^"]+)"/.exec((JSON.parse(w.kaggleCalls[0]!.body.text as string) as { cells: { source: string }[] }).cells[0]!.source)![1]!;
    expect(await redeemBootstrap(env.DB, token)).toBeNull();
  });
});

describe("Kaggle run status", () => {
  it("marks a wake failed when Kaggle reports the run errored, instead of 'waking' forever", async () => {
    resetKaggleCheck();
    const statusFetch = strictFetch(async (input) => {
      const url = input.toString();
      if (url.endsWith("/SaveKernel")) return Response.json({ versionNumber: 3 });
      if (url.endsWith("/GetKernelSessionStatus")) return Response.json({ status: "ERROR" });
      throw new TypeError("fetch failed");
    });
    const t0 = Date.now() - 60_000;
    await requestWake(env.DB, statusFetch, KAGGLE, "user:1", t0);
    await env.DB.prepare("UPDATE backend_wakes SET updated_at = ?").bind(t0).run();
    await checkKaggleRun(env.DB, statusFetch, KAGGLE);
    const w = await latestWake(env.DB);
    expect(w).toMatchObject({ stage: "failed" });
    expect(w!.detail).toContain("Kaggle reports the run error");
  });
});

describe("kaggleAuth", () => {
  it("uses Bearer for new KGAT_ tokens and Basic for legacy kaggle.json keys", () => {
    expect(kaggleAuth({ ...KAGGLE, key: "KGAT_abc123" })).toBe("Bearer KGAT_abc123");
    expect(kaggleAuth(KAGGLE)).toBe(`Basic ${btoa("agapemiteu:kaggle-key-123")}`);
  });
});

describe("progress reported by the model server", () => {
  const post = (path: string, body: unknown, admin: string | null = ADMIN) =>
    handleUpstreamRegister(
      new Request(`https://atlas.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(admin ? { authorization: `Bearer ${admin}` } : {}) },
        body: JSON.stringify(body),
      }),
      { db: env.DB, fetcher: world().fetcher, adminKey: ADMIN, upstreamKey: "k", allowedHosts: "*.trycloudflare.com" },
    ).then((r) => r!);

  it("requires the admin key and a known stage, then updates the live status", async () => {
    await requestWake(env.DB, world().fetcher, KAGGLE, "user:1");
    expect((await post("/api/upstream/progress", { stage: "loading_weights" }, null)).status).toBe(401);
    expect((await post("/api/upstream/progress", { stage: "ready" })).status).toBe(400); // only registration says ready
    expect((await post("/api/upstream/progress", { stage: "hacked" })).status).toBe(400);
    expect((await post("/api/upstream/progress", { stage: "loading_weights", detail: "both T4 GPUs" })).status).toBe(200);

    const s = await publicStatus(env.DB, world().fetcher);
    expect(s).toMatchObject({ backend: "waking", stage: "loading_weights", stage_text: "Loading N-ATLaS onto the GPUs", detail: "both T4 GPUs" });
    expect(s.stages.filter((x) => x.done).map((x) => x.id)).toEqual([
      "gpu_requested",
      "notebook_started",
      "fetching_runtime",
      "downloading_model",
    ]);
    expect(s.stages.find((x) => x.current)!.id).toBe("loading_weights");
  });

  it("sleeping returns the status to asleep", async () => {
    await requestWake(env.DB, world().fetcher, KAGGLE, "user:1");
    await post("/api/upstream/progress", { stage: "sleeping", detail: "idle 20 min" });
    expect((await publicStatus(env.DB, world().fetcher)).backend).toBe("offline");
    expect((await latestWake(env.DB))!.stage).toBe("sleeping");
  });
});

describe("callers see an honest waking state", () => {
  it("an app request wakes N-ATLaS and gets BACKEND_WARMING with Retry-After, not a fake answer", async () => {
    const w = world();
    const projectId = await makeProject();
    const { secret } = await createProjectKey(env.DB, projectId);
    const res = (await handleV1(
      new Request("https://atlas.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Sannu" }] }),
      }),
      { db: env.DB, fetcher: w.fetcher, upstreamKey: "k", waitUntil: () => {}, kaggle: KAGGLE },
    ))!;
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("90");
    const body = (await res.json()) as { error: { code: string; message: string }; choices?: unknown };
    expect(body.error.code).toBe("BACKEND_WARMING");
    expect(body.error.message).toContain("Requesting a free GPU");
    expect(body).not.toHaveProperty("choices");
    expect(w.kaggleCalls).toHaveLength(1);
  });

  it("without wake-on-demand configured the same request is MODEL_OFFLINE", async () => {
    const w = world();
    const projectId = await makeProject();
    const { secret } = await createProjectKey(env.DB, projectId);
    const res = (await handleV1(
      new Request("https://atlas.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Sannu" }] }),
      }),
      { db: env.DB, fetcher: w.fetcher, upstreamKey: "k", waitUntil: () => {} },
    ))!;
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("MODEL_OFFLINE");
    expect(w.kaggleCalls).toHaveLength(0);
  });

  it("atlas_test wakes it, relays the server's stages as progress, then asks the agent to retry", async () => {
    const w = world();
    const owner = "gh-wake";
    await makeProject(owner, "wake-app");
    const messages: string[] = [];
    let polls = 0;
    const sleep = async () => {
      // The model server reports progress while atlas_test waits.
      polls++;
      if (polls === 1) await env.DB.prepare("UPDATE backend_wakes SET stage = 'notebook_started'").run();
      if (polls === 2) await env.DB.prepare("UPDATE backend_wakes SET stage = 'downloading_model'").run();
    };
    // The wait is bounded by poll count (45s / 3s), so the fake sleep runs out the budget instantly.
    await expect(
      atlasTest(
        { db: env.DB, fetcher: w.fetcher, upstreamKey: "k", waitUntil: () => {}, owner, origin: "https://atlas.test", scopes: ALL_SCOPES, kaggle: KAGGLE },
        { project: "wake-app" },
        async (_s, m) => void messages.push(m),
        sleep,
      ),
    ).rejects.toMatchObject({ code: "BACKEND_WARMING" });
    expect(polls).toBe(15);
    expect(messages).toContain("Waking N-ATLaS: Requesting a free GPU (2x T4)");
    expect(messages).toContain("Waking N-ATLaS: GPU assigned, server notebook started");
    expect(messages).toContain("Waking N-ATLaS: Downloading N-ATLaS weights");
    expect(messages).not.toContain("Running a genuine N-ATLaS request");
  });
});
