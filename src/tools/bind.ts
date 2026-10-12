// atlas_bind_project (P0-04): idempotent project binding. Keys never pass through the agent (D2):
// every key operation returns a claim link the developer confirms in the browser as the owner (D13),
// which is also the human approval step for sensitive actions on every client (D16).

import { ACTION_TEXT, type ClaimAction, createClaim } from "../lib/claims.ts";
import { AtlasError } from "../lib/errors.ts";
import { listProjects, resolveProject } from "../lib/projects.ts";
import type { ToolDeps } from "./context.ts";

export type BindAction = "bind" | "rotate_key" | "revoke_key";

const MAX_PROJECTS = 20;

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export async function bindProject(deps: ToolDeps, args: { name: string; action?: BindAction }) {
  const name = args.name.trim();
  const slug = slugify(name);
  if (!slug) throw new AtlasError("VALIDATION_FAILED", "'name' must contain letters or digits.");
  const action = args.action ?? "bind";

  let created = false;
  if (action === "bind") {
    const existing = await listProjects(deps.db, deps.owner);
    if (!existing.some((p) => p.slug === slug) && existing.length >= MAX_PROJECTS) {
      throw new AtlasError("FORBIDDEN", `Project limit (${MAX_PROJECTS}) reached for this account.`);
    }
    // INSERT OR IGNORE on the (owner, slug) unique key makes repeated binds return the same project.
    const res = await deps.db
      .prepare("INSERT OR IGNORE INTO projects (id, owner_github_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), deps.owner, name, slug, Date.now())
      .run();
    created = res.meta.changes === 1;
  }
  const project = await resolveProject(deps.db, deps.owner, slug);

  let claimAction: ClaimAction | null;
  if (action === "bind") claimAction = project.active_keys === 0 ? "new_key" : null;
  else if (project.active_keys === 0 && action === "revoke_key") claimAction = null;
  else claimAction = action;

  const base = {
    project: { id: project.id, name: project.name, slug: project.slug, created, active_keys: project.active_keys },
    env_var: "ATLAS_ONE_API_KEY",
  };
  if (!claimAction) {
    return {
      ...base,
      action_required: false,
      message:
        action === "bind"
          ? "Project already has an active key. If the developer no longer has it, call again with action 'rotate_key'."
          : "Nothing to revoke: the project has no active keys.",
    };
  }

  const claim = await createClaim(deps.db, project.id, deps.owner, claimAction);
  return {
    ...base,
    action_required: true,
    claim_url: `${deps.origin}/claim/${claim.token}`,
    expires_at: new Date(claim.expiresAt).toISOString(),
    pending_action: ACTION_TEXT[claimAction],
    instructions_for_agent:
      "Ask the developer to open claim_url and confirm (they are already signed in from connecting). " +
      (claimAction === "revoke_key"
        ? "Nothing else is needed after confirming."
        : "The page shows two lines (ATLAS_ONE_BASE_URL, ATLAS_ONE_API_KEY) once. Before sending the link, make sure the " +
          "app's env file exists and is gitignored (usually .env.local in the app's root, with the leading dot), and tell " +
          "the developer its full path so they paste the lines there. After they say done, restart the app so it loads " +
          "the key. Never ask for the key in this chat, never commit it, never expose it to client-side code."),
  };
}
