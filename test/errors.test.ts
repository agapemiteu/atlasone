import { describe, expect, it } from "vitest";
import { AtlasError, ERRORS, toHttpResponse, toToolError } from "../src/lib/errors.ts";

describe("error catalog", () => {
  it("renders an OpenAI-compatible envelope with Atlas fields", async () => {
    const res = toHttpResponse(new AtlasError("RATE_LIMITED", undefined, { retryAfterS: 12 }), "req_1");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("12");
    expect(res.headers.get("x-atlas-request-id")).toBe("req_1");
    expect(await res.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        type: "rate_limited",
        message: ERRORS.RATE_LIMITED.message,
        retryable: true,
        retry_after_s: 12,
        request_id: "req_1",
      },
    });
  });

  it("omits optional fields when absent", async () => {
    const res = toHttpResponse(new AtlasError("INVALID_KEY"));
    expect(res.status).toBe(401);
    expect(res.headers.has("retry-after")).toBe(false);
    const { error } = (await res.json()) as { error: Record<string, unknown> };
    expect(error).not.toHaveProperty("retry_after_s");
    expect(error).not.toHaveProperty("request_id");
  });

  it("never leaks unexpected error messages", async () => {
    const res = toHttpResponse(new Error("db password is hunter2"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
    expect(toToolError(new TypeError("stack detail")).error).toMatchObject({ code: "INTERNAL", retryable: true });
  });

  it("uses the same body for tool results", () => {
    expect(toToolError(new AtlasError("MODEL_OFFLINE"), "req_2")).toEqual({
      ok: false,
      error: { code: "MODEL_OFFLINE", message: ERRORS.MODEL_OFFLINE.message, retryable: true, request_id: "req_2" },
    });
  });

  it("maps every code to a sensible HTTP status", () => {
    for (const [code, def] of Object.entries(ERRORS)) {
      expect(def.status, code).toBeGreaterThanOrEqual(400);
      expect(def.status, code).toBeLessThan(600);
    }
  });
});
