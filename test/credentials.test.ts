import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  bearer,
  createProjectKey,
  credentialKind,
  mintCredential,
  revokeProjectKeys,
  sha256Hex,
  verifyProjectKey,
} from "../src/lib/credentials.ts";
import { AtlasError } from "../src/lib/errors.ts";
import { makeProject } from "./helpers.ts";

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
    return "resolved";
  } catch (e) {
    return e instanceof AtlasError ? e.code : "non-atlas-error";
  }
}

describe("mintCredential", () => {
  it("mints well-formed, unique project keys and PATs", async () => {
    const a = await mintCredential("live");
    const b = await mintCredential("live");
    const p = await mintCredential("pat");
    expect(a.secret).toMatch(/^atl_live_[A-Za-z0-9_-]{43}$/);
    expect(p.secret).toMatch(/^atl_pat_[A-Za-z0-9_-]{43}$/);
    expect(a.secret).not.toBe(b.secret);
    expect(a.prefix).toBe(a.secret.slice(0, 13));
    expect(a.hash).toBe(await sha256Hex(a.secret));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never puts the secret in the display prefix", async () => {
    const { secret, prefix } = await mintCredential("live");
    expect(secret.length - prefix.length).toBeGreaterThanOrEqual(39);
  });
});

describe("credentialKind / bearer", () => {
  it("classifies only exact formats", async () => {
    expect(credentialKind((await mintCredential("live")).secret)).toBe("live");
    expect(credentialKind((await mintCredential("pat")).secret)).toBe("pat");
    expect(credentialKind("atl_live_short")).toBeNull();
    expect(credentialKind("sk-" + "a".repeat(43))).toBeNull();
    expect(credentialKind("")).toBeNull();
  });

  it("parses Authorization headers", () => {
    expect(bearer("Bearer abc")).toBe("abc");
    expect(bearer("bearer   abc  ")).toBe("abc");
    expect(bearer("Basic abc")).toBeNull();
    expect(bearer("Bearer")).toBeNull();
    expect(bearer(null)).toBeNull();
  });
});

describe("project keys in D1", () => {
  it("stores only the digest and verifies the plaintext", async () => {
    const projectId = await makeProject();
    const { keyId, secret } = await createProjectKey(env.DB, projectId);
    const row = await env.DB.prepare("SELECT * FROM api_keys WHERE id = ?").bind(keyId).first<Record<string, unknown>>();
    expect(Object.values(row!)).not.toContain(secret);
    await expect(verifyProjectKey(env.DB, secret)).resolves.toEqual({ keyId, projectId });
  });

  it("rejects missing, malformed, unknown and PAT credentials", async () => {
    expect(await codeOf(verifyProjectKey(env.DB, null))).toBe("AUTH_REQUIRED");
    expect(await codeOf(verifyProjectKey(env.DB, "atl_live_nope"))).toBe("INVALID_KEY");
    expect(await codeOf(verifyProjectKey(env.DB, (await mintCredential("live")).secret))).toBe("INVALID_KEY");
    expect(await codeOf(verifyProjectKey(env.DB, (await mintCredential("pat")).secret))).toBe("INVALID_KEY");
  });

  it("revocation cuts off one project without affecting another (PRD Test 5)", async () => {
    const a = await makeProject();
    const b = await makeProject();
    const keyA = await createProjectKey(env.DB, a);
    const keyB = await createProjectKey(env.DB, b);
    expect(await revokeProjectKeys(env.DB, a)).toBe(1);
    expect(await codeOf(verifyProjectKey(env.DB, keyA.secret))).toBe("KEY_REVOKED");
    await expect(verifyProjectKey(env.DB, keyB.secret)).resolves.toMatchObject({ projectId: b });
    expect(await revokeProjectKeys(env.DB, a)).toBe(0);
  });
});
