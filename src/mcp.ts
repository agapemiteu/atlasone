// Atlas One MCP server: spec-only Streamable HTTP via createMcpHandler (stateless, serves the
// 2026-07-28 protocol and 2025 clients), so any MCP client can connect (D8, "global standard").
// T4 authenticates personal access tokens (D5); OAuth Connect (D1) wraps this in T6.

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { bearer, verifyPersonalToken } from "./lib/credentials.ts";
import { AtlasError, toHttpResponse } from "./lib/errors.ts";
import { runTool, type ToolDeps } from "./tools/context.ts";
import { discover, RECIPES, renderRecipe } from "./tools/discover.ts";
import { atlasTest } from "./tools/test.ts";

export const MCP_PATH = "/mcp";

const INSTRUCTIONS = `Atlas One gives you genuine N-ATLaS (Nigerian multilingual LLM: English, Hausa, Igbo, Yoruba).
Workflow: atlas_discover -> pick a recipe (nextjs or generic) -> integrate server-side -> atlas_test (inference)
-> atlas_test (issue_app_nonce) -> call the app route with x-atlas-verify -> atlas_test (verify_app).
Never invent or simulate N-ATLaS output. If a tool reports MODEL_OFFLINE or any error, tell the developer
and do not claim the integration works. Ask the developer before editing env files or credentials.`;

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: "atlas-one", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "atlas_discover",
    {
      title: "Discover N-ATLaS",
      description:
        "Live N-ATLaS availability (gateway vs model backend), model facts, limits, attribution, your projects, and " +
        "integration recipes. Call this first. Pass recipe='nextjs' or 'generic' to get step-by-step integration code.",
      inputSchema: z.object({
        recipe: z.enum(Object.keys(RECIPES) as [keyof typeof RECIPES, ...(keyof typeof RECIPES)[]]).optional()
          .describe("Return this integration recipe: 'nextjs' (App Router) or 'generic' (Node, Python, curl)."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => runTool(() => discover(deps, args)),
  );

  server.registerTool(
    "atlas_test",
    {
      title: "Test genuine N-ATLaS",
      description:
        "Proves integration with real evidence. action='inference' runs one bounded N-ATLaS request through the same " +
        "path apps use and returns request_id, weights, latency and output. action='issue_app_nonce' returns a nonce; " +
        "send it as header x-atlas-verify when calling the app route; then action='verify_app' with that nonce confirms " +
        "the route itself reached N-ATLaS. Never report success without these results.",
      inputSchema: z.object({
        project: z.string().min(1).describe("Project slug or id (see atlas_discover)."),
        action: z.enum(["inference", "issue_app_nonce", "verify_app"]).default("inference"),
        language: z.enum(["en", "ha", "ig", "yo"]).optional().describe("Language for the inference probe (default ha)."),
        prompt: z.string().max(2000).optional().describe("Optional custom user prompt for the inference probe."),
        nonce: z.string().optional().describe("Nonce from issue_app_nonce (required for verify_app)."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args, ctx) => {
      const token = ctx.mcpReq._meta?.progressToken;
      const progress = async (step: number, message: string) => {
        if (token === undefined) return;
        await ctx.mcpReq
          .notify({ method: "notifications/progress", params: { progressToken: token, progress: step, total: 3, message } })
          .catch(() => undefined);
      };
      return runTool(() => atlasTest(deps, args, progress));
    },
  );

  for (const name of Object.keys(RECIPES) as (keyof typeof RECIPES)[]) {
    server.registerResource(
      `recipe-${name}`,
      `atlas://recipes/${name}`,
      { title: `Atlas One ${name} recipe`, mimeType: "text/markdown" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderRecipe(name, deps.origin) }] }),
    );
  }
  return server;
}

export interface McpDeps extends Omit<ToolDeps, "owner" | "origin"> {}

/** Handles /mcp; returns null for other paths. */
export async function handleMcp(request: Request, deps: McpDeps, env: unknown, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== MCP_PATH) return null;
  let owner: string;
  try {
    ({ ownerGithubId: owner } = await verifyPersonalToken(deps.db, bearer(request.headers.get("authorization"))));
  } catch (err) {
    const res = toHttpResponse(err instanceof AtlasError ? err : new AtlasError("AUTH_REQUIRED"));
    res.headers.set("www-authenticate", 'Bearer realm="atlas-one", error="invalid_token"');
    return res;
  }
  const handler = createMcpHandler(() => buildServer({ ...deps, owner, origin: url.origin }), { route: MCP_PATH });
  return handler(request, env, ctx);
}
