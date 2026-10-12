// Atlas One MCP server: spec-only Streamable HTTP via createMcpHandler (stateless, serves the
// 2026-07-28 protocol and 2025 clients), so any MCP client can connect (D8, "global standard").
// Authentication happens before this module: OAuthProvider validates the OAuth token (D1) or a
// personal access token (D5) and hands over the principal (owner + granted scopes).

import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { AtlasError } from "./lib/errors.ts";
import { AVAILABILITY } from "./lib/limits.ts";
import { feedbackDue, recordAgentFeedback, recordTool, toolOutcome } from "./lib/activity.ts";
import { bindProject } from "./tools/bind.ts";
import { requireScope, runTool, toolResult, type ToolDeps } from "./tools/context.ts";
import { discover, RECIPES, renderRecipe } from "./tools/discover.ts";
import { inspect } from "./tools/inspect.ts";
import { atlasTest } from "./tools/test.ts";

export const MCP_PATH = "/mcp";

const INSTRUCTIONS = `Atlas One gives you genuine N-ATLaS (Nigerian multilingual LLM: English, Hausa, Igbo, Yoruba).
Workflow: atlas_discover -> atlas_bind_project (developer confirms the key link in the browser) -> pick a recipe
(nextjs or generic) -> integrate server-side -> atlas_test (inference) -> atlas_test (issue_app_nonce) -> call the
app route with x-atlas-verify -> atlas_test (verify_app). Use atlas_inspect to diagnose failures.
Call atlas_discover first: it also starts waking N-ATLaS if it is asleep (${AVAILABILITY.coldStart}), so do it before writing code.
Grounding: put the app's facts in the system message, name the reply language there, and tell the model to say it does
not know when the facts do not cover a question. verified: true proves genuine N-ATLaS use, not answer quality.
Never invent or simulate N-ATLaS output. If a tool reports MODEL_OFFLINE or any error, tell the developer and do
not claim the integration works. Never ask the developer to paste keys into the chat. Ask before editing env files. When a tool returns a link for the
developer (claim_url), open it in their browser for them and print it on its own line.
If a result has feedback_request, finish the current task first, then ask the developer its question once, in your
own words. Send their answer with atlas_feedback only after showing them what you will send. If they decline, drop it.`;

type ToolResult = Awaited<ReturnType<typeof runTool>>;

/** Records the outcome of a tool call for beta evidence, after the response (metadata only). */
async function tracked(
  deps: ToolDeps,
  tool: string,
  args: { action?: string; project?: string; name?: string },
  call: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const started = Date.now();
  const result = call().then((r) => withFeedbackRequest(deps, tool, r));
  // Registered before awaiting, so the record is written even if the client disconnects mid-call
  // (a long atlas_test wait the user cancels still started real work, such as a wake).
  const principal = deps.principal;
  if (principal) {
    deps.waitUntil(
      result
        .then((r) =>
          recordTool(deps.db, principal, {
            tool,
            action: args.action ?? null,
            project: args.project ?? args.name ?? null,
            payload: r.structuredContent,
            ms: Date.now() - started,
          }),
        )
        .catch(() => undefined),
    );
  }
  return result;
}

/**
 * Adds an in-session feedback question to a result when it is due (after the app is verified, or in a long
 * session), the way products ask "how is it going?" at a natural pause. Never fails the tool call.
 */
async function withFeedbackRequest(deps: ToolDeps, tool: string, r: ToolResult): Promise<ToolResult> {
  const p = deps.principal;
  if (!p || r.isError || tool === "atlas_feedback") return r;
  const due = await feedbackDue(deps.db, p, { verified: toolOutcome(r.structuredContent).verified === 1 }).catch(() => null);
  if (!due) return r;
  return toolResult({
    ...r.structuredContent,
    feedback_request: {
      reason: due,
      ask: "How is Atlas One working for you? Rate it 1 to 5, and tell us anything that was hard or should be easier.",
      then: "Call atlas_feedback with their rating and words. Or they can use the form: " + `${deps.origin}/feedback`,
    },
  });
}

/**
 * Output schemas (MCP 2025-06-18+): every result is a JSON object with `ok`; the documented fields are listed so
 * clients can rely on them, and extra fields are allowed. Errors (isError) carry { ok: false, error }.
 */
const ERROR = z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).loose();
const result = (fields: Record<string, z.ZodType>) => z.looseObject({ ok: z.boolean(), error: ERROR.optional(), ...fields });
const OUT = {
  discover: result({
    backend: z.looseObject({ state: z.string(), checked_at: z.string() }).optional(),
    model: z.looseObject({ id: z.string() }).optional(),
    api: z.looseObject({ base_url: z.string() }).optional(),
    projects: z.array(z.looseObject({ slug: z.string() })).optional(),
    recipe: z.string().optional(),
  }),
  bind: result({
    project: z.looseObject({ id: z.string(), slug: z.string() }).optional(),
    action_required: z.boolean().optional(),
    claim_url: z.string().optional(),
  }),
  test: result({
    request_id: z.string().optional(),
    verified: z.union([z.boolean(), z.string()]).optional(),
    nonce: z.string().optional(),
    receipt: z.string().optional(),
  }),
  inspect: result({ requests: z.looseObject({ total: z.number() }).optional() }),
  feedback: result({ recorded: z.boolean().optional() }),
};

const recipeNames = Object.keys(RECIPES) as [keyof typeof RECIPES, ...(keyof typeof RECIPES)[]];

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: "atlas-one", title: "Atlas One", version: "1.0.0", websiteUrl: deps.origin },
    { instructions: INSTRUCTIONS },
  );

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
      outputSchema: OUT.discover,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      tracked(deps, "atlas_discover", {}, () =>
        runTool(() => {
          requireScope(deps, "atlas:read");
          return discover(deps, args);
        }),
      ),
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
      outputSchema: OUT.bind,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) =>
      tracked(deps, "atlas_bind_project", args, () =>
        runTool(() => {
          requireScope(deps, "atlas:projects");
          return bindProject(deps, args);
        }),
      ),
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
      outputSchema: OUT.test,
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
      return tracked(deps, "atlas_test", args, () =>
        runTool(() => {
          requireScope(deps, "atlas:test");
          return atlasTest(deps, args, progress);
        }),
      );
    },
  );

  server.registerTool(
    "atlas_inspect",
    {
      title: "Inspect project usage and errors",
      description:
        "Diagnose an integration: request counts by outcome, success latency p50/p95, the last 10 errors with request " +
        "ids and whether they are retryable, current quota usage, key state and backend state. Metadata only.",
      inputSchema: z.object({
        project: z.string().min(1).describe("Project slug or id (see atlas_discover)."),
        window_minutes: z.number().int().min(1).max(10080).default(60).describe("Look-back window (default 60, max 7 days)."),
      }),
      outputSchema: OUT.inspect,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) =>
      tracked(deps, "atlas_inspect", args, () =>
        runTool(() => {
          requireScope(deps, "atlas:read");
          return inspect(deps, args);
        }),
      ),
  );

  server.registerTool(
    "atlas_feedback",
    {
      title: "Send the developer's feedback",
      description:
        "Records the developer's own rating and comments about Atlas One for the public beta evidence. Only send " +
        "what the developer said or approved; never invent or embellish it. Asked for via feedback_request.",
      inputSchema: z.object({
        rating: z.number().int().min(1).max(5).describe("The developer's rating, 1 (poor) to 5 (excellent)."),
        issues: z.string().min(1).max(2000).describe("What was hard, broken or should be easier, in their words ('none' if nothing)."),
        manual_steps: z.string().max(1000).optional().describe("What the developer had to do by hand, if they said."),
        stack: z.string().max(200).optional().describe("The app's stack, e.g. 'Node, no framework'."),
      }),
      outputSchema: OUT.feedback,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) =>
      tracked(deps, "atlas_feedback", {}, () =>
        runTool(async () => {
          requireScope(deps, "atlas:read");
          if (!deps.principal) throw new AtlasError("FORBIDDEN", "Feedback needs a signed-in developer.");
          const { minutes } = await recordAgentFeedback(deps.db, deps.principal, args);
          return {
            recorded: true,
            minutes_in_session: minutes,
            message: `Thank the developer. Their feedback is on ${deps.origin}/evidence; they can change it any time.`,
          };
        }),
      ),
  );

  // Prompts: clients list these as ready-made commands (e.g. a slash command), the quickest way in.
  server.registerPrompt(
    "build_with_n_atlas",
    {
      title: "Build a feature with N-ATLaS",
      description: "Adds an N-ATLaS feature to this app end to end: project, key, code, real test, verified route.",
      argsSchema: z.object({
        feature: z.string().describe("What to build, e.g. 'a medicine-label reader that explains dosing in Hausa'."),
        language: z.string().optional().describe("Reply language: English, Hausa, Igbo or Yoruba."),
      }),
    },
    ({ feature, language }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Using Atlas One, add this to my app with N-ATLaS: ${feature}${language ? `, replying in ${language}` : ""}.\n` +
              "Follow the Atlas One workflow: atlas_discover (pick the recipe for this stack), atlas_bind_project (I confirm the " +
              "key in my browser; never ask me to paste it here), write the server-side code, atlas_test inference, then " +
              "issue_app_nonce, call my route with x-atlas-verify, and verify_app. Report success only with verified: true.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "diagnose_n_atlas",
    {
      title: "Diagnose my N-ATLaS integration",
      description: "Finds why an N-ATLaS integration is failing, from real request logs, and fixes it.",
      argsSchema: z.object({ project: z.string().describe("Project slug or id.") }),
    },
    ({ project }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `My N-ATLaS integration for project "${project}" is not working. Call atlas_discover for the live backend state ` +
              "and atlas_inspect for its recent errors, explain the cause in plain words, fix my code if the fault is there, " +
              "then prove the fix with atlas_test (inference, then verify_app).",
          },
        },
      ],
    }),
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
