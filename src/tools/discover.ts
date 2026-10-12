// atlas_discover: everything an agent needs before integrating, with LIVE backend state
// (the gateway being up is reported separately from the model being reachable, PRD §6).
// An agent that discovers is about to build, so a sleeping model starts waking now: the cold start overlaps with
// writing code and confirming the key instead of blocking the first test.

import { getBackend } from "../lib/backend.ts";
import { DEFAULT_MAX_TOKENS, MAX_BODY_BYTES, MAX_TOKENS_CAP, MODEL_CARD, MODEL_ID } from "../lib/chat.ts";
import { listProjects } from "../lib/projects.ts";
import { AVAILABILITY } from "../lib/limits.ts";
import { LIMITS } from "../lib/quota.ts";
import { latestWake, requestWake, STAGE_TEXT, wakeInFlight } from "../lib/wake.ts";
import generic from "../recipes/generic.md";
import nextjs from "../recipes/nextjs.md";
import type { ToolDeps } from "./context.ts";

export const RECIPES = { nextjs, generic } as const;
export type RecipeName = keyof typeof RECIPES;

export function renderRecipe(name: RecipeName, origin: string): string {
  return RECIPES[name].replaceAll("{{BASE_URL}}", `${origin}/v1`);
}

const BACKEND_MEANING = {
  ready: "Genuine N-ATLaS inference is available now.",
  loading: "The model server is starting; retry in about 15 seconds.",
  offline:
    `N-ATLaS is asleep or unreachable. atlas_test (or any app request) wakes it automatically when wake-on-demand is on; a cold start takes ${AVAILABILITY.coldStart}. Do not simulate output.`,
} as const;

export async function discover(deps: ToolDeps, args: { recipe?: RecipeName }) {
  const checkedAt = new Date().toISOString();
  const [backend, projects, latest] = await Promise.all([
    getBackend(deps.db, deps.fetcher, { fresh: true }),
    listProjects(deps.db, deps.owner),
    latestWake(deps.db),
  ]);
  const wake =
    backend.state === "offline" && deps.compute && !wakeInFlight(latest)
      ? await requestWake(deps.db, deps.fetcher, deps.compute, `user:${deps.owner}`).catch(() => latest)
      : latest;
  const waking = backend.state !== "ready" && wakeInFlight(wake) ? wake : null;
  return {
    product: "Atlas One: the MCP server for N-ATLaS.",
    gateway: "ok",
    backend: {
      state: waking ? "waking" : backend.state,
      meaning: waking
        ? `N-ATLaS is waking up: ${STAGE_TEXT[waking.stage]}. It takes ${AVAILABILITY.coldStart}: keep integrating, it will be ready by atlas_test.`
        : BACKEND_MEANING[backend.state],
      wakes_on_demand: Boolean(deps.compute),
      checked_at: checkedAt,
      note: `Observed at checked_at. N-ATLaS sleeps after ${AVAILABILITY.idleMinutes} idle minutes, so a later call can still meet a cold start; tools then say so with retry_after_s.`,
    },
    model: {
      id: MODEL_ID,
      weights: backend.upstream ? `${backend.upstream.model_id}@${backend.upstream.model_revision}` : "NCAIR1/N-ATLaS",
      runtime: backend.upstream?.runtime ?? null,
      modalities: ["text"],
      capabilities: {
        chat: "messages with system, user, assistant; multi-turn",
        streaming: "stream: true (Server-Sent Events)",
        structured_output: "response_format json_object or json_schema; grammar-constrained, always parses",
        function_calling: "tools + tool_choice; returns tool_calls, accepts role 'tool' results",
      },
      ...MODEL_CARD,
      note: "Always set a system message naming the reply language; N-ATLaS follows it.",
    },
    api: {
      base_url: `${deps.origin}/v1`,
      compatibility:
        "Industry-standard Chat Completions (OpenAI-compatible: POST /chat/completions, GET /models), JSON or SSE; " +
        "any HTTP client or AI framework (OpenAI SDKs, Vercel AI SDK, LangChain, LiteLLM)",
      auth: "Authorization: Bearer <project key>; server-side only",
      env: { ATLAS_ONE_BASE_URL: `${deps.origin}/v1`, ATLAS_ONE_API_KEY: "<project key>" },
    },
    limits: {
      requests_per_minute: LIMITS.min,
      requests_per_day: LIMITS.day,
      max_tokens: MAX_TOKENS_CAP,
      default_max_tokens: DEFAULT_MAX_TOKENS,
      max_body_bytes: MAX_BODY_BYTES,
    },
    projects,
    recipes: Object.keys(RECIPES),
    ...(args.recipe && { recipe: renderRecipe(args.recipe, deps.origin) }),
    next_steps: projects.length
      ? ["atlas_discover({ recipe: 'nextjs' | 'generic' })", "atlas_test({ project, action: 'inference' })"]
      : ["Create a project (atlas_bind_project) to get a project key."],
  };
}
