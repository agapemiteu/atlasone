// Test-only stand-in for the llama.cpp server. Never shipped; product code has no mock paths.

export type Scenario =
  | "ok"
  | "empty"
  | "loading" // /health 503 Loading model
  | "loading-on-call" // /health ok, completion 503 Loading model
  | "busy"
  | "bad-request"
  | "server-error"
  | "tunnel-down"
  | "network-error"
  | "timeout";

export interface Call {
  path: string;
  auth: string | null;
  body: Record<string, unknown> | null;
}

export const UPSTREAM_URL = "https://fake-upstream.trycloudflare.com";

/**
 * Wraps a fake fetch so it fails like workerd's real fetch when invoked as a method of another
 * object (deps.fetcher(...) => "Illegal invocation"). Caught a production-only bug once.
 */
export function strictFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): typeof fetch {
  return function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    if (this !== undefined && this !== globalThis) {
      return Promise.reject(new TypeError("Illegal invocation: function called with incorrect `this` reference."));
    }
    return impl(input, init);
  } as typeof fetch;
}

const COMPLETION = {
  id: "chatcmpl-test",
  object: "chat.completion",
  model: "n-atlas-8b",
  choices: [{ index: 0, message: { role: "assistant", content: "Babban birnin Najeriya Abuja ne." }, finish_reason: "stop" }],
  usage: { prompt_tokens: 31, completion_tokens: 13, total_tokens: 44 },
};

const SSE =
  'data: {"choices":[{"delta":{"content":"Abuja"}}]}\n\n' +
  'data: {"choices":[],"usage":{"prompt_tokens":31,"completion_tokens":2}}\n\n' +
  "data: [DONE]\n\n";

export function fakeUpstream(scenario: Scenario) {
  const calls: Call[] = [];
  const fetcher = strictFetch(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ path: url.pathname, auth: headers.get("authorization"), body });

    if (scenario === "network-error") throw new TypeError("fetch failed");
    if (url.pathname === "/health") {
      return scenario === "loading"
        ? Response.json({ error: { code: 503, message: "Loading model" } }, { status: 503 })
        : Response.json({ status: "ok" });
    }
    switch (scenario) {
      case "timeout":
        throw new DOMException("The operation timed out.", "TimeoutError");
      case "loading-on-call":
        return Response.json({ error: { message: "Loading model" } }, { status: 503 });
      case "busy":
        return Response.json({ error: { message: "no slot available" } }, { status: 503 });
      case "bad-request":
        return Response.json({ error: { message: "the request exceeds the available context size" } }, { status: 400 });
      case "server-error":
        return new Response("boom", { status: 500 });
      case "tunnel-down":
        return new Response("origin unreachable", { status: 530 });
      case "empty":
        return Response.json({ ...COMPLETION, choices: [{ message: { content: "  " }, finish_reason: "stop" }] });
      default:
        return body?.stream
          ? new Response(SSE, { headers: { "content-type": "text/event-stream" } })
          : Response.json(COMPLETION);
    }
  });
  return { fetcher, calls };
}
