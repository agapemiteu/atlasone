// The single path to the model (D7). The /v1 gateway and the atlas_test MCP tool both call
// runInference, so a passing atlas_test exercises exactly what applications use.
//
//   backend state (cached 10s) ── none/offline ─► MODEL_OFFLINE      loading ─► BACKEND_WARMING
//        │ ready
//        ▼
//   consumeQuota ── over ─► RATE_LIMITED            (offline/loading never consume quota)
//        │
//        ▼  POST {upstream}/v1/chat/completions, model forced, 120s timeout
//   network error / tunnel 502,52x ─► MODEL_OFFLINE (state flips)   timeout ─► INFERENCE_TIMEOUT
//   503 loading ─► BACKEND_WARMING     503 other ─► BACKEND_BUSY     400 ─► VALIDATION_FAILED
//   other non-2xx ─► UPSTREAM_ERROR    200 with empty content ─► INVALID_OUTPUT
//        │ 200
//        ▼
//   JSON or SSE passthrough + x-atlas-* provenance headers
//
// Every outcome after authentication is logged via waitUntil (metadata only, never content).

import { type Backend, getBackend, markState, type Upstream } from "./backend.ts";
import { type ChatRequest, MODEL_ID } from "./chat.ts";
import { AtlasError, ERRORS } from "./errors.ts";
import { consumeQuota } from "./quota.ts";
import { retryAfterFor, STAGE_TEXT, type Wake } from "./wake.ts";

const INFERENCE_TIMEOUT_MS = 120_000;
const WARMING_RETRY_S = 15;
const BUSY_RETRY_S = 5;
const TUNNEL_ORIGIN_DOWN = new Set([502, 521, 522, 523, 524, 530]);

export interface InferenceContext {
  db: D1Database;
  fetcher: typeof fetch;
  upstreamKey: string;
  /** Wake-on-demand: starts the sleeping backend for this caller (see lib/wake.ts). Optional. */
  wake?: () => Promise<Wake | null>;
  waitUntil: (promise: Promise<unknown>) => void;
  projectId: string;
  keyId: string | null;
  source: "app" | "atlas_test";
  requestId: string;
  verifyNonceHash?: string | null;
  now?: () => number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface Completion {
  content: string;
  finish_reason: string | null;
  usage: Usage;
}

export interface InferenceResult {
  response: Response;
  upstream: Upstream;
  latencyMs: number;
  upstreamMs: number;
  /** Present for non-streaming requests. */
  completion?: Completion;
}

export function newRequestId(): string {
  return "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

export async function runInference(ctx: InferenceContext, req: ChatRequest): Promise<InferenceResult> {
  const now = ctx.now ?? Date.now;
  const t0 = now();
  let upstreamMs: number | null = null;
  try {
    const backend = await getBackend(ctx.db, ctx.fetcher);
    if (backend.state === "offline" && ctx.wake) await throwWaking(await ctx.wake());
    const upstream = requireReady(backend);
    await consumeQuota(ctx.db, ctx.projectId);

    const tUp = now();
    const res = await callUpstream(ctx, upstream, req);
    upstreamMs = now() - tUp;
    markState(upstream, "ready");

    const headers = provenanceHeaders(ctx.requestId, upstream, upstreamMs);
    if (req.stream) {
      headers.set("content-type", "text/event-stream");
      const body = res.body!.pipeThrough(usageObserver((usage) => log(ctx, t0, now, 200, null, upstreamMs, usage)));
      return { response: new Response(body, { headers }), upstream, latencyMs: now() - t0, upstreamMs };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: unknown; tool_calls?: unknown[] }; finish_reason?: string | null }[];
      usage?: Usage;
    };
    const choice = json.choices?.[0];
    const raw = choice?.message?.content;
    const toolCalls = choice?.message?.tool_calls;
    const content = typeof raw === "string" ? raw : "";
    // A completion is either text or tool calls for the caller to run; neither is an empty answer.
    if (content.trim() === "" && !(Array.isArray(toolCalls) && toolCalls.length > 0)) {
      throw new AtlasError("INVALID_OUTPUT", "The model returned an empty completion.");
    }
    const usage = json.usage ?? {};
    log(ctx, t0, now, 200, null, upstreamMs, usage);
    headers.set("content-type", "application/json");
    return {
      response: new Response(JSON.stringify(json), { headers }),
      upstream,
      latencyMs: now() - t0,
      upstreamMs,
      completion: { content, finish_reason: choice?.finish_reason ?? null, usage },
    };
  } catch (err) {
    const e = err instanceof AtlasError ? err : new AtlasError("INTERNAL");
    if (!(err instanceof AtlasError)) console.error("inference: unexpected error", ctx.requestId, err);
    log(ctx, t0, now, ERRORS[e.code].status, e.code, upstreamMs, {});
    throw e;
  }
}

/** The backend is asleep and a wake is in flight: say so honestly, with the observed stage. */
async function throwWaking(w: Wake | null): Promise<void> {
  if (!w || w.stage === "failed" || w.stage === "ready") return; // fall through to MODEL_OFFLINE
  throw new AtlasError("BACKEND_WARMING", `N-ATLaS is waking up: ${STAGE_TEXT[w.stage]}. Retry shortly.`, {
    retryAfterS: retryAfterFor(w),
  });
}

function requireReady(backend: Backend): Upstream {
  if (!backend.upstream || backend.state === "offline") {
    throw new AtlasError(
      "MODEL_OFFLINE",
      backend.upstream
        ? "The N-ATLaS backend is not reachable. It may be outside a scheduled availability window."
        : "No N-ATLaS backend is registered.",
    );
  }
  if (backend.state === "loading") {
    throw new AtlasError("BACKEND_WARMING", undefined, { retryAfterS: WARMING_RETRY_S });
  }
  return backend.upstream;
}

async function callUpstream(ctx: InferenceContext, upstream: Upstream, req: ChatRequest): Promise<Response> {
  const payload = {
    ...modelDefaults(ctx.now?.() ?? Date.now()),
    ...req,
    model: MODEL_ID,
    ...(req.stream && { stream_options: { include_usage: true } }),
  };
  let res: Response;
  try {
    const { fetcher } = ctx; // never call as ctx.fetcher(): workerd fetch rejects a foreign `this`
    res = await fetcher(new URL("/v1/chat/completions", upstream.url), {
      method: "POST",
      headers: { authorization: `Bearer ${ctx.upstreamKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new AtlasError("INFERENCE_TIMEOUT", `No response from N-ATLaS within ${INFERENCE_TIMEOUT_MS / 1000}s.`);
    }
    markState(upstream, "offline");
    throw new AtlasError("MODEL_OFFLINE");
  }
  if (res.ok) return res;

  const text = (await res.text()).slice(0, 2_000);
  if (res.status === 503 && /loading/i.test(text)) {
    markState(upstream, "loading");
    throw new AtlasError("BACKEND_WARMING", undefined, { retryAfterS: WARMING_RETRY_S });
  }
  if (res.status === 503) throw new AtlasError("BACKEND_BUSY", undefined, { retryAfterS: BUSY_RETRY_S });
  if (TUNNEL_ORIGIN_DOWN.has(res.status)) {
    markState(upstream, "offline");
    throw new AtlasError("MODEL_OFFLINE");
  }
  if (res.status === 400) throw new AtlasError("VALIDATION_FAILED", `Rejected by the model server: ${upstreamMessage(text)}`);
  console.error("inference: upstream error", ctx.requestId, res.status, text.slice(0, 300));
  throw new AtlasError("UPSTREAM_ERROR");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * N-ATLaS model-card settings, applied server-side so any OpenAI client gets them for free:
 * repetition penalty 1.12 (prevents loops, notably in Yoruba), low default temperature, and the
 * current date passed to the chat template (strftime "%d %b %Y"). A caller's temperature wins.
 */
export function modelDefaults(now: number) {
  const d = new Date(now);
  const date = `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return { temperature: 0.1, repeat_penalty: 1.12, chat_template_kwargs: { date_string: date } };
}

function upstreamMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") return parsed.error.message.slice(0, 300);
  } catch {
    // not JSON; fall through
  }
  return "invalid request.";
}

function provenanceHeaders(requestId: string, upstream: Upstream, upstreamMs: number): Headers {
  return new Headers({
    "cache-control": "no-store",
    "x-atlas-request-id": requestId,
    "x-atlas-model": MODEL_ID,
    "x-atlas-weights": `${upstream.model_id}@${upstream.model_revision}`,
    "x-atlas-runtime": upstream.runtime,
    "x-atlas-upstream-ms": String(upstreamMs),
  });
}

/** Passes SSE bytes through untouched and reports token usage from the final chunk when the stream ends. */
function usageObserver(onEnd: (usage: Usage) => void): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let tail = "";
  let reported = false;
  const done = () => {
    if (reported) return;
    reported = true;
    const prompt = /"prompt_tokens":\s*(\d+)/.exec(tail);
    const completion = /"completion_tokens":\s*(\d+)/.exec(tail);
    onEnd({
      ...(prompt && { prompt_tokens: Number(prompt[1]) }),
      ...(completion && { completion_tokens: Number(completion[1]) }),
    });
  };
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      tail = (tail + decoder.decode(chunk, { stream: true })).slice(-4_096);
    },
    flush: done,
    // Client disconnected mid-stream: still record the request.
    cancel: done,
  });
}

function log(
  ctx: InferenceContext,
  t0: number,
  now: () => number,
  status: number,
  errorCode: string | null,
  upstreamMs: number | null,
  usage: Usage,
): void {
  const write = ctx.db
    .prepare(
      `INSERT INTO request_logs (id, request_id, project_id, key_id, source, verify_nonce_hash, status, error_code,
         latency_ms, upstream_ms, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      ctx.requestId,
      ctx.projectId,
      ctx.keyId,
      ctx.source,
      ctx.verifyNonceHash ?? null,
      status,
      errorCode,
      now() - t0,
      upstreamMs,
      usage.prompt_tokens ?? null,
      usage.completion_tokens ?? null,
      now(),
    )
    .run()
    .catch((err: unknown) => console.error("request_logs write failed", ctx.requestId, err));
  ctx.waitUntil(write);
}
