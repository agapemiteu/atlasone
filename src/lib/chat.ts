// Validation for OpenAI-compatible chat requests. Only an explicit allowlist of fields is
// forwarded upstream, so callers cannot reach runtime-specific knobs through the gateway.

import { AtlasError } from "./errors.ts";

export const MODEL_ID = "n-atlas-8b";

/** Facts about the served model, shared by /v1/models and atlas_discover. */
export const MODEL_CARD = {
  languages: ["en", "ha", "ig", "yo"],
  context_window_per_request: 4096,
  attribution: "Powered by Awarri",
  credit_line:
    "N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.",
  licence:
    "N-ATLaS Terms of Use: limited to projects with at most 1,000 active end users per rolling 30 days; commercial or " +
    "large-scale use requires a separate licence from Awarri Technologies. Prohibited: surveillance, discriminatory " +
    "profiling, disinformation or impersonation, military use, and unauthorised personal-data scraping. " +
    "https://huggingface.co/NCAIR1/N-ATLaS",
} as const;

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_TOKENS_CAP = 1024;
export const DEFAULT_MAX_TOKENS = 512;
const MAX_MESSAGES = 64;
const MAX_TOOLS = 32;
const NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** OpenAI chat message shapes, including the tool-calling round trip (assistant tool_calls -> tool result). */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export interface ToolDef {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export type ToolChoice = "none" | "auto" | "required" | { type: "function"; function: { name: string } };

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
  /** Structured output (OpenAI spec); llama.cpp enforces it with a grammar, so the reply parses. */
  response_format?: ResponseFormat;
  /** Function calling (OpenAI spec): the model may answer with tool_calls for the caller to run. */
  tools?: ToolDef[];
  tool_choice?: ToolChoice;
}

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };

function invalid(message: string): never {
  throw new AtlasError("VALIDATION_FAILED", message);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function message(m: unknown, i: number): ChatMessage {
  const bad = (): never =>
    invalid(
      `messages[${i}] must be { role: "system" | "user", content: string }, { role: "assistant", content, tool_calls? } ` +
        `or { role: "tool", tool_call_id, content: string }.`,
    );
  if (!isObject(m)) return bad();
  if ((m.role === "system" || m.role === "user") && typeof m.content === "string") return { role: m.role, content: m.content };
  if (m.role === "tool" && typeof m.content === "string" && typeof m.tool_call_id === "string") {
    return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
  }
  if (m.role !== "assistant") return bad();
  const content = m.content ?? null;
  if (content !== null && typeof content !== "string") return bad();
  if (m.tool_calls === undefined || m.tool_calls === null) {
    if (content === null) return bad();
    return { role: "assistant", content };
  }
  if (!Array.isArray(m.tool_calls) || m.tool_calls.length === 0 || m.tool_calls.length > MAX_TOOLS) return bad();
  const calls = m.tool_calls.map((t): ToolCall => {
    const fn = isObject(t) && isObject(t.function) ? t.function : null;
    if (!fn || typeof t.id !== "string" || typeof fn.name !== "string" || typeof fn.arguments !== "string") return bad();
    return { id: t.id, type: "function", function: { name: fn.name, arguments: fn.arguments } };
  });
  return { role: "assistant", content, tool_calls: calls };
}

function tools(v: unknown): ToolDef[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_TOOLS) invalid(`'tools' must be an array of 1 to ${MAX_TOOLS} functions.`);
  return v.map((t, i): ToolDef => {
    const fn = isObject(t) && t.type === "function" && isObject(t.function) ? t.function : null;
    if (
      !fn ||
      typeof fn.name !== "string" ||
      !NAME.test(fn.name) ||
      (fn.description !== undefined && typeof fn.description !== "string") ||
      (fn.parameters !== undefined && !isObject(fn.parameters))
    ) {
      invalid(`tools[${i}] must be { type: "function", function: { name, description?, parameters?: JSON Schema } }.`);
    }
    return {
      type: "function",
      function: {
        name: fn.name,
        ...(fn.description !== undefined && { description: fn.description as string }),
        ...(fn.parameters !== undefined && { parameters: fn.parameters as Record<string, unknown> }),
      },
    };
  });
}

function toolChoice(v: unknown, defined: ToolDef[] | undefined): ToolChoice | undefined {
  if (v === undefined || v === null) return undefined;
  if (v === "none" || v === "auto" || v === "required") return v;
  const name = isObject(v) && v.type === "function" && isObject(v.function) ? v.function.name : undefined;
  if (typeof name !== "string" || !defined?.some((t) => t.function.name === name)) {
    invalid("'tool_choice' must be 'none', 'auto', 'required' or { type: 'function', function: { name } } naming one of 'tools'.");
  }
  return { type: "function", function: { name } };
}

function responseFormat(v: unknown): ResponseFormat | undefined {
  if (v === undefined || v === null) return undefined;
  if (!isObject(v)) invalid("'response_format' must be an object.");
  const f = v;
  if (f.type === "text" || f.type === "json_object") return { type: f.type };
  if (f.type !== "json_schema") invalid("'response_format.type' must be 'text', 'json_object' or 'json_schema'.");
  const js = f.json_schema as Record<string, unknown> | null | undefined;
  if (
    !js ||
    typeof js !== "object" ||
    typeof js.name !== "string" ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(js.name) ||
    typeof js.schema !== "object" ||
    js.schema === null ||
    Array.isArray(js.schema)
  ) {
    invalid("'response_format.json_schema' must be { name: string (a-z, 0-9, _ or -), schema: JSON Schema object, strict?: boolean }.");
  }
  return {
    type: "json_schema",
    json_schema: { name: js.name, schema: js.schema as Record<string, unknown>, ...(js.strict === true && { strict: true }) },
  };
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
  const clean = messages.map((m, i) => message(m, i));

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
  const fns = tools(b.tools);
  const optional = {
    temperature: num(b.temperature, "temperature", 0, 2),
    top_p: num(b.top_p, "top_p", 0, 1),
    seed: num(b.seed, "seed", 0, 2 ** 31 - 1, true),
    presence_penalty: num(b.presence_penalty, "presence_penalty", -2, 2),
    frequency_penalty: num(b.frequency_penalty, "frequency_penalty", -2, 2),
    stop: stop ?? undefined,
    response_format: responseFormat(b.response_format),
    tools: fns,
    tool_choice: toolChoice(b.tool_choice, fns),
  };
  for (const [k, v] of Object.entries(optional)) if (v !== undefined) Object.assign(out, { [k]: v });
  return out;
}
