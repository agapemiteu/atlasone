// Live end-to-end check of the deployed gateway with the official OpenAI SDK, exactly as a
// developer's server would use it. Requires a running N-ATLaS backend (Kaggle) registered with
// the gateway. Exits non-zero on any failure. Never prints keys.
//
//   node --env-file=.env.local scripts/e2e-gateway.mjs

import OpenAI from "openai";

const baseURL = `${process.env.ATLAS_ONE_URL}/v1`;
const apiKey = process.env.ATLAS_ONE_API_KEY;
if (!process.env.ATLAS_ONE_URL || !apiKey) {
  console.error("Set ATLAS_ONE_URL and ATLAS_ONE_API_KEY");
  process.exit(2);
}

const client = new OpenAI({ baseURL, apiKey, maxRetries: 0, timeout: 180_000 });
const results = [];
async function check(name, fn) {
  const t0 = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - t0), ...detail });
  } catch (err) {
    results.push({ name, ok: false, ms: Math.round(performance.now() - t0), error: err?.message ?? String(err) });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await check("models: backend ready with pinned weights", async () => {
  const page = await client.models.list();
  const m = page.data[0];
  assert(m?.id === "n-atlas-8b", `unexpected model ${m?.id}`);
  assert(m.atlas?.backend === "ready", `backend is ${m.atlas?.backend}`);
  return { weights: m.atlas.weights };
});

await check("chat: genuine Hausa answer with provenance", async () => {
  const { data, response } = await client.chat.completions
    .create({
      model: "n-atlas-8b",
      messages: [
        { role: "system", content: "You are a helpful assistant. Reply in Hausa." },
        { role: "user", content: "Menene babban birnin Najeriya?" },
      ],
      max_tokens: 60,
      temperature: 0.2,
    })
    .withResponse();
  const content = data.choices[0]?.message?.content?.trim();
  assert(content, "empty completion");
  assert(response.headers.get("x-atlas-weights")?.startsWith("NCAIR1/N-ATLaS@"), "missing provenance header");
  return {
    request_id: response.headers.get("x-atlas-request-id"),
    weights: response.headers.get("x-atlas-weights"),
    runtime: response.headers.get("x-atlas-runtime"),
    upstream_ms: Number(response.headers.get("x-atlas-upstream-ms")),
    usage: data.usage,
    output: content,
  };
});

await check("stream: SSE tokens arrive and finish", async () => {
  const stream = await client.chat.completions.create({
    model: "n-atlas-8b",
    messages: [
      { role: "system", content: "Reply in Yoruba." },
      { role: "user", content: "Kí ni olú ìlú Nàìjíríà?" },
    ],
    max_tokens: 40,
    stream: true,
  });
  let text = "";
  let chunks = 0;
  for await (const chunk of stream) {
    chunks++;
    text += chunk.choices[0]?.delta?.content ?? "";
  }
  assert(text.trim(), "stream produced no text");
  return { chunks, output: text.trim() };
});

await check("auth: wrong key is rejected", async () => {
  const bad = new OpenAI({ baseURL, apiKey: "atl_live_" + "x".repeat(43), maxRetries: 0 });
  try {
    await bad.models.list();
  } catch (err) {
    assert(err.status === 401, `expected 401, got ${err.status}`);
    return { status: 401, code: err.error?.code };
  }
  throw new Error("wrong key was accepted");
});

await check("validation: other models are refused", async () => {
  try {
    await client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] });
  } catch (err) {
    assert(err.status === 400, `expected 400, got ${err.status}`);
    return { status: 400, code: err.error?.code };
  }
  throw new Error("gpt-4o was accepted");
});

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed}/${results.length}` : `PASSED: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
