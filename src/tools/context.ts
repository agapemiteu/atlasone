// Shared context for MCP tools. Every tool runs as one authenticated owner.

import { toToolError } from "../lib/errors.ts";

export interface ToolDeps {
  db: D1Database;
  fetcher: typeof fetch;
  upstreamKey: string;
  waitUntil: (promise: Promise<unknown>) => void;
  /** GitHub user id of the authenticated developer. */
  owner: string;
  /** Public origin of this Atlas One deployment, e.g. https://atlas-one.example.workers.dev */
  origin: string;
}

type Payload = Record<string, unknown>;

/** MCP tool result: JSON text for every client plus structuredContent for clients that use it. */
export function toolResult(payload: Payload, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError,
  };
}

/** Runs a tool body and renders any failure through the shared error catalog. */
export async function runTool(body: () => Promise<Payload>) {
  try {
    return toolResult({ ok: true, ...(await body()) });
  } catch (err) {
    return toolResult(toToolError(err), true);
  }
}
