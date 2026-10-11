// Owner-bound, single-use claim links (D2, D13, D16). The agent receives only a link; the developer
// signs in as the project owner, reads what will happen, and confirms in the browser. That human
// confirmation is the approval step for every sensitive action, on every MCP client.
//
//   create ─► link (10 min) ─► owner signs in ─► confirm ─► atomic redeem ─► key minted / revoked

import { createProjectKey, revokeProjectKeys, sha256Hex } from "./credentials.ts";
import { AtlasError } from "./errors.ts";

export type ClaimAction = "new_key" | "rotate_key" | "revoke_key";
export const CLAIM_TTL_MS = 10 * 60_000;

export const ACTION_TEXT: Record<ClaimAction, string> = {
  new_key: "Create a project key",
  rotate_key: "Revoke this project's current keys and create a new one",
  revoke_key: "Revoke all of this project's keys (apps using them stop working)",
};

export interface Claim {
  project_id: string;
  project_name: string;
  owner_github_id: string;
  action: ClaimAction;
  expires_at: number;
  redeemed_at: number | null;
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createClaim(db: D1Database, projectId: string, owner: string, action: ClaimAction, now = Date.now()) {
  const token = "cl_" + b64url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + CLAIM_TTL_MS;
  await db
    .prepare("INSERT INTO claims (token_hash, project_id, owner_github_id, action, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), projectId, owner, action, expiresAt)
    .run();
  return { token, expiresAt };
}

/** Loads a claim for display, enforcing owner, expiry and single use. */
export async function loadClaim(db: D1Database, token: string, owner: string, now = Date.now()): Promise<Claim> {
  const claim = await db
    .prepare(
      `SELECT c.project_id, p.name AS project_name, c.owner_github_id, c.action, c.expires_at, c.redeemed_at
         FROM claims c JOIN projects p ON p.id = c.project_id WHERE c.token_hash = ?`,
    )
    .bind(await sha256Hex(token))
    .first<Claim>();
  if (!claim) throw new AtlasError("NOT_FOUND", "This link is not valid.");
  if (claim.owner_github_id !== owner) throw new AtlasError("FORBIDDEN", "This link belongs to a different GitHub account.");
  if (claim.redeemed_at !== null || claim.expires_at < now) throw new AtlasError("CLAIM_EXPIRED");
  return claim;
}

/** Executes a confirmed claim exactly once. Returns the new key's plaintext when one is minted. */
export async function redeemClaim(db: D1Database, token: string, owner: string, now = Date.now()) {
  const claim = await loadClaim(db, token, owner, now);
  const hash = await sha256Hex(token);
  const taken = await db
    .prepare("UPDATE claims SET redeemed_at = ? WHERE token_hash = ? AND redeemed_at IS NULL AND expires_at >= ?")
    .bind(now, hash, now)
    .run();
  if (taken.meta.changes !== 1) throw new AtlasError("CLAIM_EXPIRED"); // lost a race with another tab

  if (claim.action !== "new_key") await revokeProjectKeys(db, claim.project_id, now);
  if (claim.action === "revoke_key") return { claim, key: null };
  const key = await createProjectKey(db, claim.project_id, now);
  await db.prepare("UPDATE claims SET key_id = ? WHERE token_hash = ?").bind(key.keyId, hash).run();
  return { claim, key };
}
