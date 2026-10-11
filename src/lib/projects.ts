// Project lookups, always scoped to the authenticated owner: there is no cross-owner read path.

import { AtlasError } from "./errors.ts";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  active_keys: number;
}

export async function listProjects(db: D1Database, ownerGithubId: string): Promise<ProjectSummary[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.slug,
              (SELECT count(*) FROM api_keys k WHERE k.project_id = p.id AND k.revoked_at IS NULL) AS active_keys
         FROM projects p WHERE p.owner_github_id = ? ORDER BY p.created_at`,
    )
    .bind(ownerGithubId)
    .all<ProjectSummary>();
  return results;
}

/** Resolves a project by slug or id for this owner, or throws NOT_FOUND. */
export async function resolveProject(db: D1Database, ownerGithubId: string, ref: string): Promise<ProjectSummary> {
  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.slug,
              (SELECT count(*) FROM api_keys k WHERE k.project_id = p.id AND k.revoked_at IS NULL) AS active_keys
         FROM projects p WHERE p.owner_github_id = ?1 AND (p.slug = ?2 OR p.id = ?2)`,
    )
    .bind(ownerGithubId, ref)
    .first<ProjectSummary>();
  if (!row) throw new AtlasError("NOT_FOUND", `No project '${ref}' for this account. Call atlas_discover to list projects.`);
  return row;
}
