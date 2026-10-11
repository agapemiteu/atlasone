// Phase A smoke test: proves genuine N-ATLaS inference end to end.
// Usage: node --env-file=.env.local scripts/smoke.mjs
// Needs ATLAS_UPSTREAM_URL and ATLAS_UPSTREAM_KEY. Exits non-zero on any failure. Never prints the key.

const base = process.env.ATLAS_UPSTREAM_URL?.replace(/\/$/, "");
const key = process.env.ATLAS_UPSTREAM_KEY;
if (!base || !key) {
  console.error("Set ATLAS_UPSTREAM_URL and ATLAS_UPSTREAM_KEY");
  process.exit(2);
}

const COLD_START_BUDGET_MS = 900_000;

// Every phase shown is an observed fact, never a time-based guess:
//   connecting -> no answer yet -> server says "loading" (HTTP 503) -> ready (200).
// A gateway error with no origin behind it (e.g. tunnel up, server gone) is MODEL_OFFLINE.
const PHASE_LABELS = {
  connecting: "Connecting to Atlas One inference",
  waiting: "Waiting for the inference server to respond",
  loading: "Server is up: loading N-ATLaS weights onto the GPU",
};
const UNREACHABLE_GRACE_MS = 60_000;

// Polls /health (unauthenticated in vLLM and llama.cpp) until the model server is ready,
// showing live progress so a cold start never looks like a hang.
async function waitForReady() {
  const t0 = performance.now();
  const frames = ["   ", ".  ", ".. ", "..."];
  let tick = 0;
  let phase = "connecting";
  let shown = null;
  const tty = process.stdout.isTTY;
  const timer = setInterval(() => {
    const ms = performance.now() - t0;
    if (phase === "connecting" && ms > 3_000) phase = "waiting";
    const slow = ms > 150_000 ? " (slower than usual)" : "";
    const line = `${PHASE_LABELS[phase]}${frames[tick++ % frames.length]} ${Math.round(ms / 1000)}s${slow}`;
    if (tty) process.stdout.write(`\r\x1b[2K${line}`);
    else if (phase !== shown) console.log(line);
    shown = phase;
  }, 400);

  try {
    while (performance.now() - t0 < COLD_START_BUDGET_MS) {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
      if (res?.ok) return Math.round(performance.now() - t0);
      if (res?.status === 503) phase = "loading";
      else if (res && phase !== "loading" && performance.now() - t0 > UNREACHABLE_GRACE_MS) {
        throw new Error(`MODEL_OFFLINE: inference server unreachable (HTTP ${res.status}). Is the server session running?`);
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    throw new Error(`MODEL_OFFLINE: server not ready after ${COLD_START_BUDGET_MS / 1000}s`);
  } finally {
    clearInterval(timer);
    if (tty) process.stdout.write("\r\x1b[2K");
  }
}

async function call(path, init = {}) {
  const t0 = performance.now();
  const res = await fetch(base + path, {
    ...init,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(120_000),
  });
  const ms = Math.round(performance.now() - t0);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status} after ${ms}ms: ${JSON.stringify(body)}`);
  return { body, ms };
}

const warmupMs = await waitForReady();
console.log(warmupMs > 3_000 ? `Ready: cold start took ${Math.round(warmupMs / 1000)}s` : "Ready: server was warm");

const models = await call("/v1/models");
console.log("models:", models.body.data.map((m) => m.id).join(", "));

const chat = await call("/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "n-atlas-8b",
    messages: [{ role: "user", content: "Ka gaishe ni a Hausa, kuma ka bayyana kanka a jumla ɗaya." }],
    max_tokens: 96,
    temperature: 0.3,
  }),
});

const text = chat.body.choices?.[0]?.message?.content?.trim();
if (!text) throw new Error("Empty completion: not counted as inference success");

console.log(JSON.stringify({
  status: "ok",
  request_id: chat.body.id,
  model: chat.body.model,
  warmup_ms: warmupMs,
  inference_latency_ms: chat.ms,
  usage: chat.body.usage,
  output: text,
}, null, 2));
