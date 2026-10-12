// atlas_test: proof, not plausibility (PRD P0-05, P0-07).
//
//   action "inference"       one bounded request through lib/inference.ts (the exact app path).
//                            Waits up to 45s for a loading backend, emitting observed progress.
//   action "issue_app_nonce" single-use nonce (10 min) for proving a specific app route.
//   action "verify_app"      no model call: passes only if a request carrying that nonce reached
//                            the gateway from the app (source 'app') and succeeded (D11).

import { getBackend } from "../lib/backend.ts";
import type { ChatRequest } from "../lib/chat.ts";
import { MODEL_ID } from "../lib/chat.ts";
import { sha256Hex } from "../lib/credentials.ts";
import { AtlasError } from "../lib/errors.ts";
import { newRequestId, runInference } from "../lib/inference.ts";
import { type ProjectSummary, resolveProject } from "../lib/projects.ts";
import { checkKaggleRun, latestWake, requestWake, retryAfterFor, STAGE_TEXT, wakeInFlight } from "../lib/wake.ts";
import type { ToolDeps } from "./context.ts";

export type Language = "en" | "ha" | "ig" | "yo";
export type TestAction = "inference" | "issue_app_nonce" | "verify_app";

export const PROBES: Record<Language, { system: string; user: string }> = {
  en: { system: "Reply in English.", user: "What is the capital of Nigeria?" },
  ha: { system: "Reply in Hausa.", user: "Menene babban birnin Najeriya?" },
  ig: { system: "Reply in Igbo.", user: "Kedu isi obodo Naịjirịa?" },
  yo: { system: "Reply in Yoruba.", user: "Kí ni olú ìlú Nàìjíríà?" },
};

const WARM_WAIT_MS = 45_000;
const POLL_MS = 3_000;
const NONCE_TTL_MS = 10 * 60_000;

export type Progress = (step: number, message: string) => Promise<void>;

export interface TestArgs {
  project: string;
  action?: TestAction;
  language?: Language;
  prompt?: string;
  nonce?: string;
}

export const RECEIPT_SCHEMA = "atlas-one.receipt/v1";

/** EdDSA-signed JWT (RFC 7519/8037) proving this developer's app route reached genuine N-ATLaS (D20). */
async function issueReceipt(deps: ToolDeps, project: ProjectSummary, requestId: string): Promise<string | null> {
  if (!deps.signer) return null;
  const upstream = await deps.db
    .prepare("SELECT model_id, model_revision FROM upstreams WHERE active = 1")
    .first<{ model_id: string; model_revision: string }>();
  return deps.signer.sign("atlas-receipt+jwt", {
    iss: deps.origin,
    sub: `github:${deps.owner}`,
    iat: Math.floor(Date.now() / 1000),
    jti: requestId,
    schema: RECEIPT_SCHEMA,
    login: deps.principal?.login ?? null,
    session: deps.principal?.sessionId ?? null,
    client: deps.principal?.client ?? null,
    project: { id: project.id, slug: project.slug, name: project.name },
    request_id: requestId,
    verified: true,
    source: "app",
    model: upstream ? `${upstream.model_id}@${upstream.model_revision}` : null,
  });
}

export async function atlasTest(deps: ToolDeps, args: TestArgs, progress: Progress, sleep = defaultSleep) {
  const project = await resolveProject(deps.db, deps.owner, args.project);
  switch (args.action ?? "inference") {
    case "issue_app_nonce":
      return issueNonce(deps.db, project.id);
    case "verify_app": {
      const result = await verifyApp(deps.db, project.id, args.nonce);
      if (!result.verified || !result.evidence) return result;
      // Beta evidence: a signed receipt the developer keeps in their own repo, and the questionnaire.
      const receipt = await issueReceipt(deps, project, result.evidence.request_id);
      return {
        ...result,
        ...(receipt && {
          receipt,
          receipt_instructions:
            "With the developer's OK, save this receipt in the repository root as ATLAS_VERIFICATION.jwt and commit it. " +
            `It is an EdDSA-signed JWT; anyone can verify it against ${deps.origin}/.well-known/jwks.json.`,
        }),
        scope:
          "verified proves this app route reached genuine N-ATLaS. It does not grade answers: test correctness and " +
          "reply language with your own examples.",
      };
    }
    default:
      return inference(deps, project.id, args, progress, sleep);
  }
}

function defaultSleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function inference(deps: ToolDeps, projectId: string, args: TestArgs, progress: Progress, sleep: typeof defaultSleep) {
  const t0 = Date.now();
  await progress(1, "Checking the N-ATLaS backend");
  let backend = await getBackend(deps.db, deps.fetcher, { fresh: true });
  while (backend.state === "loading" && Date.now() - t0 < WARM_WAIT_MS) {
    await progress(2, `Backend is loading N-ATLaS weights (${Math.round((Date.now() - t0) / 1000)}s)`);
    await sleep(POLL_MS);
    backend = await getBackend(deps.db, deps.fetcher, { fresh: true });
  }
  if (backend.state === "loading") throw new AtlasError("BACKEND_WARMING", undefined, { retryAfterS: 15 });

  // Asleep: wake it, then relay the server's own progress until it is ready or our wait budget ends.
  if (backend.state === "offline" && deps.kaggle) {
    let wake = await requestWake(deps.db, deps.fetcher, deps.kaggle, `user:${deps.owner}`);
    let shown = "";
    for (let poll = 0; wake && wakeInFlight(wake) && poll < WARM_WAIT_MS / POLL_MS; poll++) {
      if (wake.stage !== shown) await progress(2, `Waking N-ATLaS: ${STAGE_TEXT[wake.stage]}`);
      shown = wake.stage;
      await sleep(POLL_MS);
      await checkKaggleRun(deps.db, deps.fetcher, deps.kaggle ?? null);
      wake = await latestWake(deps.db);
    }
    backend = await getBackend(deps.db, deps.fetcher, { fresh: true });
    if (backend.state !== "ready" && wake && wake.stage !== "failed") {
      throw new AtlasError(
        "BACKEND_WARMING",
        `N-ATLaS is waking up (${STAGE_TEXT[wake.stage]}). A cold start takes about 4-5 minutes; call atlas_test again shortly.`,
        { retryAfterS: retryAfterFor(wake) },
      );
    }
    if (wake?.stage === "failed") throw new AtlasError("MODEL_OFFLINE", `Wake-up failed: ${wake.detail ?? "unknown error"}`);
  }

  // Fail at the observed state; never announce a model request that cannot happen.
  if (backend.state === "offline") {
    throw new AtlasError(
      "MODEL_OFFLINE",
      backend.upstream
        ? "The N-ATLaS backend is not reachable. It may be outside a scheduled availability window."
        : "No N-ATLaS backend is registered.",
    );
  }

  const language = args.language ?? "ha";
  const prompt = args.prompt?.trim();
  if (prompt && prompt.length > 2_000) throw new AtlasError("VALIDATION_FAILED", "'prompt' must be at most 2000 characters.");
  const req: ChatRequest = {
    model: MODEL_ID,
    messages: [
      { role: "system", content: PROBES[language].system },
      { role: "user", content: prompt || PROBES[language].user },
    ],
    max_tokens: 64,
    temperature: 0.2,
    stream: false,
  };

  await progress(3, "Running a genuine N-ATLaS request");
  const requestId = newRequestId();
  const result = await runInference(
    { ...deps, projectId, keyId: null, source: "atlas_test", requestId },
    req,
  );
  const completion = result.completion!;
  return {
    action: "inference",
    verified: "genuine_n_atlas_inference",
    request_id: requestId,
    model: MODEL_ID,
    weights: `${result.upstream.model_id}@${result.upstream.model_revision}`,
    runtime: result.upstream.runtime,
    language,
    latency_ms: result.latencyMs,
    upstream_ms: result.upstreamMs,
    usage: completion.usage,
    finish_reason: completion.finish_reason,
    output_excerpt: completion.content.slice(0, 300),
    validation: { non_empty: true, finish_reason: completion.finish_reason },
  };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function issueNonce(db: D1Database, projectId: string) {
  const nonce = "vn_" + base64url(crypto.getRandomValues(new Uint8Array(24)));
  const expiresAt = Date.now() + NONCE_TTL_MS;
  await db
    .prepare("INSERT INTO verify_nonces (nonce_hash, project_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(nonce), projectId, expiresAt)
    .run();
  return {
    action: "issue_app_nonce",
    nonce,
    header: "x-atlas-verify",
    expires_at: new Date(expiresAt).toISOString(),
    instructions:
      "Call the new app route once with header 'x-atlas-verify: <nonce>' (the route must forward it to Atlas One), " +
      "check the route's response, then call atlas_test with action 'verify_app' and this nonce.",
  };
}

async function verifyApp(db: D1Database, projectId: string, nonce: string | undefined) {
  if (!nonce) throw new AtlasError("VALIDATION_FAILED", "'nonce' is required for action 'verify_app'.");
  const hash = await sha256Hex(nonce);
  const row = await db
    .prepare("SELECT expires_at FROM verify_nonces WHERE nonce_hash = ? AND project_id = ?")
    .bind(hash, projectId)
    .first<{ expires_at: number }>();
  if (!row) throw new AtlasError("VALIDATION_FAILED", "Unknown nonce for this project. Issue one with action 'issue_app_nonce'.");
  if (row.expires_at < Date.now()) throw new AtlasError("CLAIM_EXPIRED", "Nonce expired. Issue a new one.");

  const { results } = await db
    .prepare(
      `SELECT request_id, status, error_code, latency_ms, upstream_ms, created_at FROM request_logs
        WHERE verify_nonce_hash = ? AND project_id = ? AND source = 'app' ORDER BY created_at DESC LIMIT 5`,
    )
    .bind(hash, projectId)
    .all<{ request_id: string; status: number; error_code: string | null; latency_ms: number; upstream_ms: number | null }>();

  const success = results.find((r) => r.status === 200);
  if (success) {
    await db.prepare("DELETE FROM verify_nonces WHERE nonce_hash = ?").bind(hash).run();
    return {
      action: "verify_app",
      verified: true,
      evidence: { ...success, source: "app", meaning: "The app route reached genuine N-ATLaS through Atlas One." },
    };
  }
  return {
    action: "verify_app",
    verified: false,
    attempts: results,
    reason: results.length
      ? `The app's request reached Atlas One but failed with ${results[0]!.error_code}. Fix that before claiming success.`
      : "No request carrying this nonce reached Atlas One. Check the route forwards 'x-atlas-verify' and uses ATLAS_ONE_BASE_URL, then call it again.",
  };
}
