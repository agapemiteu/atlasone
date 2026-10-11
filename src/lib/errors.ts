// One error catalog for every surface (D7): /v1 HTTP responses and MCP tool results render the
// same codes, so an agent and an application see identical, machine-readable failures (PRD §9).

export const ERRORS = {
  AUTH_REQUIRED: { status: 401, retryable: false, message: "Authentication required." },
  INVALID_KEY: { status: 401, retryable: false, message: "API key is not valid." },
  KEY_REVOKED: { status: 401, retryable: false, message: "API key has been revoked." },
  FORBIDDEN: { status: 403, retryable: false, message: "Not allowed for this account or project." },
  NOT_FOUND: { status: 404, retryable: false, message: "Not found." },
  CLAIM_EXPIRED: { status: 410, retryable: false, message: "This link has expired or was already used." },
  VALIDATION_FAILED: { status: 400, retryable: false, message: "Request is not valid." },
  REQUEST_TOO_LARGE: { status: 413, retryable: false, message: "Request body is too large." },
  RATE_LIMITED: { status: 429, retryable: true, message: "Project quota reached." },
  BACKEND_BUSY: { status: 429, retryable: true, message: "All N-ATLaS inference slots are busy." },
  MODEL_OFFLINE: { status: 503, retryable: true, message: "The N-ATLaS inference backend is offline." },
  BACKEND_WARMING: { status: 503, retryable: true, message: "The N-ATLaS inference backend is starting up." },
  INFERENCE_TIMEOUT: { status: 504, retryable: true, message: "N-ATLaS inference timed out." },
  INVALID_OUTPUT: { status: 502, retryable: false, message: "The model returned an unusable response." },
  UPSTREAM_ERROR: { status: 502, retryable: true, message: "The inference backend returned an error." },
  INTERNAL: { status: 500, retryable: true, message: "Internal error." },
} as const satisfies Record<string, { status: number; retryable: boolean; message: string }>;

export type ErrorCode = keyof typeof ERRORS;

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retry_after_s?: number;
  request_id?: string;
}

export class AtlasError extends Error {
  readonly code: ErrorCode;
  readonly retryAfterS: number | undefined;

  constructor(code: ErrorCode, message?: string, opts: { retryAfterS?: number } = {}) {
    super(message ?? ERRORS[code].message);
    this.name = "AtlasError";
    this.code = code;
    this.retryAfterS = opts.retryAfterS;
  }
}

/** Anything that is not an AtlasError becomes INTERNAL; its message is never exposed. */
export function toErrorBody(err: unknown, requestId?: string): ErrorBody {
  const e = err instanceof AtlasError ? err : new AtlasError("INTERNAL");
  return {
    code: e.code,
    message: e.message,
    retryable: ERRORS[e.code].retryable,
    ...(e.retryAfterS !== undefined && { retry_after_s: e.retryAfterS }),
    ...(requestId && { request_id: requestId }),
  };
}

/**
 * OpenAI-compatible error envelope ({ error: { message, type, code } }) so standard OpenAI
 * clients surface it, extended with Atlas fields (retryable, retry_after_s, request_id).
 */
export function toHttpResponse(err: unknown, requestId?: string): Response {
  const body = toErrorBody(err, requestId);
  const headers = new Headers({ "content-type": "application/json" });
  if (body.retry_after_s !== undefined) headers.set("retry-after", String(body.retry_after_s));
  if (requestId) headers.set("x-atlas-request-id", requestId);
  return new Response(JSON.stringify({ error: { ...body, type: body.code.toLowerCase() } }), {
    status: ERRORS[body.code].status,
    headers,
  });
}

/** MCP tool result shape: { ok: false, error }. */
export function toToolError(err: unknown, requestId?: string): { ok: false; error: ErrorBody } {
  return { ok: false, error: toErrorBody(err, requestId) };
}
