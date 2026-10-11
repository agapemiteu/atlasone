import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createClaim, loadClaim, redeemClaim } from "../src/lib/claims.ts";
import { createProjectKey, verifyProjectKey } from "../src/lib/credentials.ts";
import { AtlasError } from "../src/lib/errors.ts";
import { checkCsrf, csrfToken, readSession, sessionCookie, signValue, verifyValue } from "../src/lib/session.ts";
import { handlePages } from "../src/web/pages.ts";
import { makeProject } from "./helpers.ts";

const SECRET = "test-session-secret-0123456789abcdef";
const ORIGIN = "https://atlas.test";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof AtlasError ? e.code : String(e);
  }
}

async function browser(githubId: string, login = "dev") {
  const set = await sessionCookie(SECRET, { githubId, login });
  const cookie = set.split(";")[0]!;
  return (path: string, init: RequestInit = {}) =>
    handlePages(new Request(`${ORIGIN}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie } }), {
      db: env.DB,
      sessionSecret: SECRET,
      origin: ORIGIN,
    });
}

describe("claim links (D2, D13)", () => {
  it("mints a key exactly once, for the owner only", async () => {
    const projectId = await makeProject("owner-a", `p-${crypto.randomUUID().slice(0, 6)}`);
    const { token } = await createClaim(env.DB, projectId, "owner-a", "new_key");
    expect(await code(loadClaim(env.DB, token, "owner-b"))).toBe("FORBIDDEN");
    const { key } = await redeemClaim(env.DB, token, "owner-a");
    await expect(verifyProjectKey(env.DB, key!.secret)).resolves.toMatchObject({ projectId });
    expect(await code(redeemClaim(env.DB, token, "owner-a"))).toBe("CLAIM_EXPIRED");
  });

  it("expires after its TTL and rejects unknown tokens", async () => {
    const projectId = await makeProject("owner-a", `p-${crypto.randomUUID().slice(0, 6)}`);
    const { token } = await createClaim(env.DB, projectId, "owner-a", "new_key", Date.now() - 11 * 60_000);
    expect(await code(redeemClaim(env.DB, token, "owner-a"))).toBe("CLAIM_EXPIRED");
    expect(await code(loadClaim(env.DB, "cl_" + "x".repeat(43), "owner-a"))).toBe("NOT_FOUND");
  });

  it("rotate revokes the old key and mints a new one; revoke mints nothing", async () => {
    const projectId = await makeProject("owner-a", `p-${crypto.randomUUID().slice(0, 6)}`);
    const old = await createProjectKey(env.DB, projectId);
    const rotate = await createClaim(env.DB, projectId, "owner-a", "rotate_key");
    const { key } = await redeemClaim(env.DB, rotate.token, "owner-a");
    expect(await code(verifyProjectKey(env.DB, old.secret))).toBe("KEY_REVOKED");
    await expect(verifyProjectKey(env.DB, key!.secret)).resolves.toMatchObject({ projectId });
    const revoke = await createClaim(env.DB, projectId, "owner-a", "revoke_key");
    expect((await redeemClaim(env.DB, revoke.token, "owner-a")).key).toBeNull();
    expect(await code(verifyProjectKey(env.DB, key!.secret))).toBe("KEY_REVOKED");
  });

  it("is single-use under concurrent confirms", async () => {
    const projectId = await makeProject("owner-a", `p-${crypto.randomUUID().slice(0, 6)}`);
    const { token } = await createClaim(env.DB, projectId, "owner-a", "new_key");
    const results = await Promise.all([1, 2, 3].map(() => code(redeemClaim(env.DB, token, "owner-a"))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    const keys = await env.DB.prepare("SELECT count(*) AS n FROM api_keys WHERE project_id = ?").bind(projectId).first<number>("n");
    expect(keys).toBe(1);
  });
});

describe("signed sessions and CSRF", () => {
  it("round-trips, and rejects tampering, expiry and wrong secrets", async () => {
    const raw = await signValue(SECRET, { a: 1 }, 60_000);
    expect(await verifyValue(SECRET, raw)).toMatchObject({ a: 1 });
    const [payload, sig] = raw.split(".");
    expect(await verifyValue(SECRET, `${payload}x.${sig}`)).toBeNull();
    expect(await verifyValue("another-secret-0123456789abcdefgh", raw)).toBeNull();
    expect(await verifyValue(SECRET, raw, Date.now() + 120_000)).toBeNull();
    expect(await verifyValue(SECRET, "garbage")).toBeNull();
  });

  it("issues __Host- cookies that read back, and CSRF tokens bound to purpose", async () => {
    const set = await sessionCookie(SECRET, { githubId: "1", login: "dev" });
    expect(set).toMatch(/^__Host-atlas_session=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200$/);
    const session = (await readSession(new Request(ORIGIN, { headers: { cookie: set.split(";")[0]! } }), SECRET))!;
    expect(session).toMatchObject({ githubId: "1", login: "dev" });
    const t = await csrfToken(SECRET, session, "claim:a");
    expect(await checkCsrf(SECRET, session, "claim:a", t)).toBe(true);
    expect(await checkCsrf(SECRET, session, "claim:b", t)).toBe(false);
    expect(await checkCsrf(SECRET, session, "claim:a", undefined)).toBe(false);
  });
});

describe("claim and token pages", () => {
  it("send signed-out visitors to GitHub sign-in, keeping the path", async () => {
    const res = (await handlePages(new Request(`${ORIGIN}/claim/cl_${"a".repeat(43)}`), {
      db: env.DB,
      sessionSecret: SECRET,
      origin: ORIGIN,
    }))!;
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/login?next=${encodeURIComponent(`/claim/cl_${"a".repeat(43)}`)}`);
  });

  it("confirm page escapes names, requires CSRF, shows the key once, then refuses", async () => {
    const projectId = await makeProject("gh-7", `x-${crypto.randomUUID().slice(0, 6)}`);
    await env.DB.prepare("UPDATE projects SET name = ? WHERE id = ?").bind("<img src=x onerror=alert(1)>", projectId).run();
    const { token } = await createClaim(env.DB, projectId, "gh-7", "new_key");
    const as = await browser("gh-7");

    const view = (await as(`/claim/${token}`))!;
    const html = await view.text();
    expect(view.headers.get("x-frame-options")).toBe("DENY");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&#60;img src=x");
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;

    const forged = (await as(`/claim/${token}`, { method: "POST", body: new URLSearchParams({ csrf: "nope" }) }))!;
    expect(forged.status).toBe(403);

    const ok = await (await as(`/claim/${token}`, { method: "POST", body: new URLSearchParams({ csrf }) }))!.text();
    expect(ok).toMatch(/ATLAS_ONE_API_KEY=atl_live_[A-Za-z0-9_-]{43}/);
    expect(ok).toContain(`ATLAS_ONE_BASE_URL=${ORIGIN}/v1`);

    const replay = (await as(`/claim/${token}`, { method: "POST", body: new URLSearchParams({ csrf }) }))!;
    expect(replay.status).toBe(410);
  });

  it("another GitHub account cannot open someone else's link", async () => {
    const projectId = await makeProject("gh-8", `y-${crypto.randomUUID().slice(0, 6)}`);
    const { token } = await createClaim(env.DB, projectId, "gh-8", "new_key");
    const res = (await (await browser("gh-9"))(`/claim/${token}`))!;
    expect(res.status).toBe(403);
  });

  it("personal tokens: create shows once, revoke is owner-scoped and CSRF-protected", async () => {
    const as = await browser("gh-10");
    const page = await (await as("/tokens"))!.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(page)![1]!;
    const created = await (await as("/tokens", { method: "POST", body: new URLSearchParams({ csrf, op: "create" }) }))!.text();
    expect(created).toMatch(/atl_pat_[A-Za-z0-9_-]{43}/);
    const row = await env.DB.prepare("SELECT id FROM personal_tokens WHERE owner_github_id = 'gh-10'").first<{ id: string }>();

    const intruder = await browser("gh-11");
    const theirPage = await (await intruder("/tokens"))!.text();
    const theirCsrf = /name="csrf" value="([^"]+)"/.exec(theirPage)![1]!;
    await intruder("/tokens", { method: "POST", body: new URLSearchParams({ csrf: theirCsrf, op: "revoke", id: row!.id }) });
    const still = await env.DB.prepare("SELECT revoked_at FROM personal_tokens WHERE id = ?").bind(row!.id).first<number | null>("revoked_at");
    expect(still).toBeNull();

    await as("/tokens", { method: "POST", body: new URLSearchParams({ csrf, op: "revoke", id: row!.id }) });
    const revoked = await env.DB.prepare("SELECT revoked_at FROM personal_tokens WHERE id = ?").bind(row!.id).first<number | null>("revoked_at");
    expect(revoked).toBeTypeOf("number");
  });
});
