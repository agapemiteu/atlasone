// Credentials: project keys (atl_live_) for applications and personal access tokens (atl_pat_)
// for MCP clients without OAuth (D5). Only a SHA-256 digest is stored; lookups are by digest, so
// the database never holds a usable secret and comparison time does not depend on the secret.
//
// This module uses only WebCrypto so the Worker and Node scripts (scripts/seed.ts) share it.

import { AtlasError } from "./errors.ts";

export const KEY_PREFIX = "atl_live_";
export const PAT_PREFIX = "atl_pat_";
const SECRET_BYTES = 32;
const DISPLAY_CHARS = 4;
// 32 random bytes in base64url = 43 characters.
const FORMAT = /^atl_(live|pat)_[A-Za-z0-9_-]{43}$/;

export type CredentialKind = "live" | "pat";

export interface MintedCredential {
  /** Shown to the owner exactly once; never stored. */
  secret: string;
  hash: string;
  /** Safe to display and log, e.g. "atl_live_Ab3x". */
  prefix: string;
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function mintCredential(kind: CredentialKind): Promise<MintedCredential> {
  const lead = kind === "live" ? KEY_PREFIX : PAT_PREFIX;
  const secret = lead + base64url(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
  return { secret, hash: await sha256Hex(secret), prefix: secret.slice(0, lead.length + DISPLAY_CHARS) };
}

/** Returns the credential kind for a well-formed secret, or null. Never touches the database. */
export function credentialKind(secret: string): CredentialKind | null {
  const m = FORMAT.exec(secret);
  return m ? (m[1] as CredentialKind) : null;
}

/** Extracts the bearer token from an Authorization header value. */
export function bearer(header: string | null): string | null {
  const m = header && /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1]! : null;
}

export interface ProjectKey {
  keyId: string;
  projectId: string;
}

export async function createProjectKey(db: D1Database, projectId: string, now = Date.now()) {
  const cred = await mintCredential("live");
  const keyId = crypto.randomUUID();
  await db
    .prepare("INSERT INTO api_keys (id, project_id, prefix, hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(keyId, projectId, cred.prefix, cred.hash, now)
    .run();
  return { keyId, secret: cred.secret, prefix: cred.prefix };
}

/** Resolves a project key or throws INVALID_KEY / KEY_REVOKED. */
export async function verifyProjectKey(db: D1Database, secret: string | null): Promise<ProjectKey> {
  if (!secret) throw new AtlasError("AUTH_REQUIRED", "Missing 'Authorization: Bearer atl_live_...' header.");
  if (credentialKind(secret) !== "live") throw new AtlasError("INVALID_KEY");
  const row = await db
    .prepare("SELECT id, project_id, revoked_at FROM api_keys WHERE hash = ?")
    .bind(await sha256Hex(secret))
    .first<{ id: string; project_id: string; revoked_at: number | null }>();
  if (!row) throw new AtlasError("INVALID_KEY");
  if (row.revoked_at !== null) throw new AtlasError("KEY_REVOKED");
  return { keyId: row.id, projectId: row.project_id };
}

/** Revokes every active key of a project. Other projects are untouched (PRD Test 5). */
export async function revokeProjectKeys(db: D1Database, projectId: string, now = Date.now()): Promise<number> {
  const res = await db
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE project_id = ? AND revoked_at IS NULL")
    .bind(now, projectId)
    .run();
  return res.meta.changes;
}
