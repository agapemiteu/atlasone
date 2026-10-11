// Shared context for MCP tools. Every tool runs as one authenticated owner.

import { AtlasError, toToolError } from "../lib/errors.ts";
import type { Principal } from "../lib/activity.ts";
import type { KaggleConfig } from "../lib/wake.ts";

/** OAuth scopes (D16). Shown on the consent screen; personal tokens carry all of them. */
export const SCOPES = {
  "atlas:read": "See N-ATLaS availability, model facts, your projects and usage",
  "atlas:test": "Run bounded test requests against genuine N-ATLaS (uses your project quota)",
  "atlas:projects": "Create projects and request key links (keys are only shown to you in the browser)",
} as const;
export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

export interface ToolDeps {
  db: D1Database;
  fetcher: typeof fetch;
  upstreamKey: string;
  waitUntil: (promise: Promise<unknown>) => void;
  /** GitHub user id of the authenticated developer. */
  owner: string;
  /** Public origin of this Atlas One deployment, e.g. https://atlas-one.example.workers.dev */
  origin: string;
  /** Scopes the developer granted to this client. */
  scopes: readonly string[];
  /** Wake-on-demand config; null or absent disables waking. */
  kaggle?: KaggleConfig | null;
  /** Who is calling, for the beta-evidence activity log; absent in unit tests that do not need it. */
  principal?: Principal;
}

export function requireScope(deps: ToolDeps, scope: Scope): void {
  if (!deps.scopes.includes(scope)) {
    throw new AtlasError(
      "FORBIDDEN",
      `This connection was not granted '${scope}' (${SCOPES[scope]}). Reconnect Atlas One and approve it.`,
    );
  }
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
