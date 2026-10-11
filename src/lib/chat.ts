// Validation for OpenAI-compatible chat requests. Only an explicit allowlist of fields is
// forwarded upstream, so callers cannot reach runtime-specific knobs through the gateway.

import { AtlasError } from "./errors.ts";

export const MODEL_ID = "n-atlas-8b";

/** Facts about the served model, shared by /v1/models and atlas_discover. */
export const MODEL_CARD = {
  languages: ["en", "ha", "ig", "yo"],
  context_window_per_request: 4096,
  attribution: "Powered by Awarri",
  licence: "N-ATLaS licence: separate agreement with Awarri required above 1,000 active end users per 30 days.",
} as const;

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_TOKENS_CAP = 1024;
export const DEFAULT_MAX_TOKENS = 512;
const MAX_MESSAGES = 64;
const ROLES = new Set(["system", "user", "assistant"]);

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: typeof MODEL_ID;
  messages: ChatMessage[];
  max_tokens: number;
  stream: boolean;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  seed?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

function invalid(message: string): never {
  throw new AtlasError("VALIDATION_FAILED", message);
}

function num(v: unknown, name: string, min: number, max: number, integer = false): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    invalid(`'${name}' must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`);
  }
  return v;
}

/** Reads and validates a request body. Throws REQUEST_TOO_LARGE or VALIDATION_FAILED. */
export async function parseChatRequest(request: Request): Promise<ChatRequest> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AtlasError("REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new AtlasError("REQUEST_TOO_LARGE");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    invalid("Body must be JSON.");
  }
  return validateChat(body);
}

export function validateChat(body: unknown): ChatRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) invalid("Body must be a JSON object.");
  const b = body as Record<string, unknown>;

  if (b.model !== undefined && b.model !== MODEL_ID) {
    invalid(`'model' must be '${MODEL_ID}'. Atlas One serves N-ATLaS only.`);
  }

  const messages = b.messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    invalid(`'messages' must be a non-empty array of at most ${MAX_MESSAGES} items.`);
  }
  const clean = messages.map((m, i): ChatMessage => {
    const msg = m as Record<string, unknown> | null;
    if (!msg || typeof msg.role !== "string" || !ROLES.has(msg.role) || typeof msg.content !== "string") {
      invalid(`messages[${i}] must be { role: "system" | "user" | "assistant", content: string }.`);
    }
    return { role: msg.role as ChatMessage["role"], content: msg.content };
  });

  const maxTokens =
    num(b.max_completion_tokens ?? b.max_tokens, "max_tokens", 1, MAX_TOKENS_CAP, true) ?? DEFAULT_MAX_TOKENS;
  if (b.stream !== undefined && typeof b.stream !== "boolean") invalid("'stream' must be a boolean.");

  const stop = b.stop;
  if (
    stop !== undefined &&
    stop !== null &&
    typeof stop !== "string" &&
    !(Array.isArray(stop) && stop.length <= 4 && stop.every((s) => typeof s === "string"))
  ) {
    invalid("'stop' must be a string or an array of up to 4 strings.");
  }

  const out: ChatRequest = { model: MODEL_ID, messages: clean, max_tokens: maxTokens, stream: b.stream === true };
  const optional = {
    temperature: num(b.temperature, "temperature", 0, 2),
    top_p: num(b.top_p, "top_p", 0, 1),
    seed: num(b.seed, "seed", 0, 2 ** 31 - 1, true),
    presence_penalty: num(b.presence_penalty, "presence_penalty", -2, 2),
    frequency_penalty: num(b.frequency_penalty, "frequency_penalty", -2, 2),
    stop: stop ?? undefined,
  };
  for (const [k, v] of Object.entries(optional)) if (v !== undefined) Object.assign(out, { [k]: v });
  return out;
}
