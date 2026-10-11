// Live MCP check against the deployed Atlas One with the official MCP client SDK, in both
// protocol eras real agents speak. Runs the full agent workflow, including nonce-bound app
// verification through the real /v1 gateway. Reports honestly when the backend is offline.
//
//   node --env-file=.env.local scripts/e2e-mcp.mjs [project-slug]

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import OpenAI from "openai";

const { ATLAS_ONE_URL: base, ATLAS_ONE_PAT: pat, ATLAS_ONE_API_KEY: appKey } = process.env;
if (!base || !pat || !appKey) {
  console.error("Set ATLAS_ONE_URL, ATLAS_ONE_PAT and ATLAS_ONE_API_KEY");
  process.exit(2);
}
const project = process.argv[2] ?? "e2e-gateway";

async function connect(mode) {
  const client = new Client({ name: "atlas-e2e", version: "1.0.0" }, mode ? { versionNegotiation: { mode } } : undefined);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${pat}`, "user-agent": "atlas-one-e2e/1.0" } },
    }),
  );
  return client;
}

async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args }, { onprogress: (p) => console.log(`    progress: ${p.message ?? p.progress}`) });
  return { isError: res.isError === true, ...JSON.parse(res.content[0].text) };
}

let failures = 0;
const check = (cond, label, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!cond) failures++;
};

for (const [era, mode] of [["2025 (legacy)", undefined], ["2026-07-28", { pin: "2026-07-28" }]]) {
  console.log(`\n== MCP ${era} ==`);
  const client = await connect(mode);
  check(client.getProtocolEra() === (mode ? "modern" : "legacy"), "protocol era", client.getNegotiatedProtocolVersion() ?? "");

  const { tools } = await client.listTools();
  check(tools.map((t) => t.name).sort().join() === "atlas_bind_project,atlas_discover,atlas_inspect,atlas_test", "tools listed", tools.map((t) => t.name).join(", "));

  const d = await call(client, "atlas_discover", { recipe: "nextjs" });
  check(d.ok && d.gateway === "ok", "atlas_discover", `backend=${d.backend?.state}  projects=${d.projects?.map((p) => p.slug).join(",")}`);
  check(d.recipe?.includes(`${base}/v1`), "nextjs recipe rendered with live base URL");

  const t = await call(client, "atlas_test", { project, action: "inference", language: "yo" });
  if (d.backend?.state === "ready") {
    check(t.ok && t.verified === "genuine_n_atlas_inference", "atlas_test inference", `${t.request_id}  ${t.latency_ms}ms  "${t.output_excerpt}"`);
  } else {
    check(t.isError && t.error?.code === "MODEL_OFFLINE", "atlas_test reports offline honestly (no output)", t.error?.code);
  }

  if (d.backend?.state === "ready") {
    const n = await call(client, "atlas_test", { project, action: "issue_app_nonce" });
    check(n.ok && n.nonce, "issue_app_nonce");
    const before = await call(client, "atlas_test", { project, action: "verify_app", nonce: n.nonce });
    check(before.ok && before.verified === false, "verify_app before the app call is false");

    // Simulate the integrated app route: it forwards x-atlas-verify to Atlas One.
    const atlas = new OpenAI({ baseURL: `${base}/v1`, apiKey: appKey, maxRetries: 0 });
    const reply = await atlas.chat.completions.create(
      { model: "n-atlas-8b", messages: [{ role: "system", content: "Reply in Hausa." }, { role: "user", content: "Sannu, yaya kake?" }], max_tokens: 40 },
      { headers: { "x-atlas-verify": n.nonce } },
    );
    check(Boolean(reply.choices[0]?.message?.content), "app call via gateway", `"${reply.choices[0]?.message?.content?.trim()}"`);
    await new Promise((r) => setTimeout(r, 1500)); // request log is written after the response
    const after = await call(client, "atlas_test", { project, action: "verify_app", nonce: n.nonce });
    check(after.ok && after.verified === true, "verify_app after the app call is true", after.evidence?.request_id ?? after.reason);
  }
  await client.close();
}

console.log(failures ? `\nFAILED: ${failures}` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
