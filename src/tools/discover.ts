// atlas_discover: everything an agent needs before integrating, with LIVE backend state
// (the gateway being up is reported separately from the model being reachable, PRD §6).

import { getBackend } from "../lib/backend.ts";
import { DEFAULT_MAX_TOKENS, MAX_BODY_BYTES, MAX_TOKENS_CAP, MODEL_CARD, MODEL_ID } from "../lib/chat.ts";
import { listProjects } from "../lib/projects.ts";
import { LIMITS } from "../lib/quota.ts";
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
    "No N-ATLaS backend is reachable right now. Free GPU capacity runs in scheduled windows. Do not simulate output; tell the developer and retry later.",
} as const;

export async function discover(deps: ToolDeps, args: { recipe?: RecipeName }) {
  const [backend, projects] = await Promise.all([
    getBackend(deps.db, deps.fetcher, { fresh: true }),
    listProjects(deps.db, deps.owner),
  ]);
  return {
    product: "Atlas One: N-ATLaS, one instruction away.",
    gateway: "ok",
    backend: { state: backend.state, meaning: BACKEND_MEANING[backend.state] },
    model: {
      id: MODEL_ID,
      weights: backend.upstream ? `${backend.upstream.model_id}@${backend.upstream.model_revision}` : "NCAIR1/N-ATLaS",
      runtime: backend.upstream?.runtime ?? null,
      modalities: ["text"],
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
