// Atlas One MCP server: spec-only Streamable HTTP via createMcpHandler (stateless, serves the
// 2026-07-28 protocol and 2025 clients), so any MCP client can connect (D8, "global standard").
// Authentication happens before this module: OAuthProvider validates the OAuth token (D1) or a
// personal access token (D5) and hands over the principal (owner + granted scopes).

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { bindProject } from "./tools/bind.ts";
import { requireScope, runTool, type ToolDeps } from "./tools/context.ts";
import { discover, RECIPES, renderRecipe } from "./tools/discover.ts";
import { atlasTest } from "./tools/test.ts";

export const MCP_PATH = "/mcp";

const INSTRUCTIONS = `Atlas One gives you genuine N-ATLaS (Nigerian multilingual LLM: English, Hausa, Igbo, Yoruba).
Workflow: atlas_discover -> atlas_bind_project (developer confirms the key link in the browser) -> pick a recipe
(nextjs or generic) -> integrate server-side -> atlas_test (inference) -> atlas_test (issue_app_nonce) -> call the
app route with x-atlas-verify -> atlas_test (verify_app).
Never invent or simulate N-ATLaS output. If a tool reports MODEL_OFFLINE or any error, tell the developer and do
not claim the integration works. Never ask the developer to paste keys into the chat. Ask before editing env files.`;

const recipeNames = Object.keys(RECIPES) as [keyof typeof RECIPES, ...(keyof typeof RECIPES)[]];

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
        recipe: z.enum(recipeNames).optional()
          .describe("Return this integration recipe: 'nextjs' (App Router) or 'generic' (Node, Python, curl)."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(() => {
        requireScope(deps, "atlas:read");
        return discover(deps, args);
      }),
  );

  server.registerTool(
    "atlas_bind_project",
    {
      title: "Bind a project to N-ATLaS",
      description:
        "Create or find a project (idempotent by name) and get a one-time link for its API key. The developer opens the " +
        "link, signs in with GitHub and confirms; the key is shown only there, never to you. action='rotate_key' or " +
        "'revoke_key' also returns a link the developer must confirm.",
      inputSchema: z.object({
        name: z.string().min(1).max(64).describe("Project name, e.g. the app's name. Same name = same project."),
        action: z.enum(["bind", "rotate_key", "revoke_key"]).default("bind"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) =>
      runTool(() => {
        requireScope(deps, "atlas:projects");
        return bindProject(deps, args);
      }),
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
      return runTool(() => {
        requireScope(deps, "atlas:test");
        return atlasTest(deps, args, progress);
      });
    },
  );

  for (const name of recipeNames) {
    server.registerResource(
      `recipe-${name}`,
      `atlas://recipes/${name}`,
      { title: `Atlas One ${name} recipe`, mimeType: "text/markdown" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderRecipe(name, deps.origin) }] }),
    );
  }
  return server;
}

/** Serves one MCP request for an already-authenticated principal. */
export function serveMcp(request: Request, deps: ToolDeps, env: unknown, ctx: ExecutionContext): Promise<Response> {
  return createMcpHandler(() => buildServer(deps), { route: MCP_PATH })(request, env, ctx);
}
