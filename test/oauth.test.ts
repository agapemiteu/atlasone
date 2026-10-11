// End-to-end OAuth through the real Worker entry (OAuthProvider + our pages): the flow every
// spec-compliant MCP client (Claude Code, Cursor, Codex, VS Code) runs when you press Connect.

import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createPersonalToken } from "../src/lib/credentials.ts";
import { githubUser, isAllowed } from "../src/lib/github.ts";
import { safeNextPath } from "../src/web/auth.ts";
import { strictFetch } from "./fake-upstream.ts";

const ORIGIN = env.PUBLIC_ORIGIN;
// Real clients always send Host; requests built in the test runtime don't, and the MCP handler's
// DNS-rebinding check (correctly) rejects a missing Host. Add it the way a client would.
const worker = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set("host", new URL(ORIGIN).host);
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }));
};
const REDIRECT = "http://localhost:33418/callback";

async function registerClient(name = "<script>alert(1)</script> Agent") {
  const res = await worker("/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

async function openConsent(clientId: string, scope = "atlas:read atlas:test") {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    state: "client-state-123",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    scope,
    resource: `${ORIGIN}/mcp`,
  });
  const res = await worker(`/authorize?${qs}`);
  const html = await res.text();
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1];
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { res, html, handle: handle!, cookie };
}

describe("discovery (any MCP client starts here)", () => {
  it("publishes protected-resource and authorization-server metadata", async () => {
    const prm = (await (await worker("/.well-known/oauth-protected-resource/mcp")).json()) as Record<string, unknown>;
    expect(prm).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
    // Root fallback URL that some clients use serves the same document.
    expect(await (await worker("/.well-known/oauth-protected-resource")).json()).toEqual(prm);
    const as = (await (await worker("/.well-known/oauth-authorization-server")).json()) as Record<string, any>;
    expect(as).toMatchObject({
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/token`,
      registration_endpoint: `${ORIGIN}/register`,
    });
    expect(as.code_challenge_methods_supported).toContain("S256");
    expect(as.scopes_supported).toEqual(expect.arrayContaining(["atlas:read", "atlas:test", "atlas:projects"]));
  });

  it("challenges unauthenticated MCP requests with a pointer to the metadata", async () => {
    const res = await worker("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("resource_metadata=");
  });
});

describe("personal access tokens through the real entry (D5)", () => {
  it("accepts a valid PAT at /mcp and rejects revoked or unknown ones", async () => {
    const pat = await createPersonalToken(env.DB, "gh-pat-user");
    const init = (token: string) => ({
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } },
      }),
    });
    expect((await worker("/mcp", init(pat.secret))).status).toBe(200);
    expect((await worker("/mcp", init("atl_pat_" + "z".repeat(43)))).status).toBe(401);
    await env.DB.prepare("UPDATE personal_tokens SET revoked_at = 1 WHERE id = ?").bind(pat.id).run();
    expect((await worker("/mcp", init(pat.secret))).status).toBe(401);
  });
});

describe("Connect: consent, then GitHub (D1, D16)", () => {
  it("shows a consent page that names the app safely, warns about localhost, and cannot be framed", async () => {
    const { res, html, handle } = await openConsent(await registerClient());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&#60;script&#62;");
    expect(html).toContain("localhost");
    expect(html).toContain("app on your computer");
    // All scopes pre-ticked even when the client asked only for the minimum; developer can untick.
    expect(html).toMatch(/value="atlas:test" checked/);
    expect(html).toMatch(/value="atlas:projects" checked/);
    expect(handle).toBeTruthy();
  });

  it("Allow sends the browser to GitHub with PKCE and a browser-bound state", async () => {
    const { handle, cookie } = await openConsent(await registerClient("Claude Code"));
    const res = await worker("/authorize", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams([["handle", handle], ["decision", "approve"], ["scope", "atlas:read"], ["scope", "atlas:test"]]),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(to.searchParams.get("client_id")).toBe(env.GITHUB_CLIENT_ID);
    expect(to.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/github/mcp`);
    expect(to.searchParams.get("code_challenge_method")).toBe("S256");
    expect(to.searchParams.get("state")).toBeTruthy();
    expect(res.headers.getSetCookie().join(";")).toContain("__Host-");
  });

  it("refuses a consent post from another browser (no binding cookie)", async () => {
    const { handle } = await openConsent(await registerClient("Cursor"));
    const res = await worker("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ handle, decision: "approve" }),
      redirect: "manual",
    });
    expect(res.status).toBe(400);
  });

  it("Deny returns access_denied to the client with its state", async () => {
    const { handle, cookie } = await openConsent(await registerClient("Codex"));
    const res = await worker("/authorize", {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ handle, decision: "deny" }),
      redirect: "manual",
    });
    const to = new URL(res.headers.get("location")!);
    expect(to.origin + to.pathname).toBe(REDIRECT);
    expect(to.searchParams.get("error")).toBe("access_denied");
    expect(to.searchParams.get("state")).toBe("client-state-123");
  });

  it("a GitHub callback without the matching browser state is refused", async () => {
    const res = await worker("/auth/github/mcp?code=abc&state=forged", { redirect: "manual" });
    expect(res.status).toBe(400);
    const web = await worker("/auth/github/web?code=abc&state=forged", { redirect: "manual" });
    expect(web.status).toBe(400);
  });
});

describe("GitHub identity and invite list", () => {
  it("exchanges the code with PKCE and returns id + login", async () => {
    const seen: { url: string; body?: string }[] = [];
    const fetcher = strictFetch(async (input, init) => {
      seen.push({ url: input.toString(), body: typeof init?.body === "string" ? init.body : undefined });
      return input.toString().includes("access_token")
        ? Response.json({ access_token: "gho_x" })
        : Response.json({ id: 114285882, login: "agapemiteu" });
    });
    const user = await githubUser({ clientId: "cid", clientSecret: "sec" }, "code1", "ver1", `${ORIGIN}/auth/github/mcp`, fetcher);
    expect(user).toEqual({ id: "114285882", login: "agapemiteu" });
    expect(JSON.parse(seen[0]!.body!)).toMatchObject({ code: "code1", code_verifier: "ver1", client_id: "cid" });
  });

  it("fails closed when GitHub rejects the code", async () => {
    const fetcher = strictFetch(async () => Response.json({ error: "bad_verification_code" }));
    await expect(githubUser({ clientId: "c", clientSecret: "s" }, "x", "v", "r", fetcher)).rejects.toThrow(/bad_verification_code/);
  });

  it("allows env-listed and table-listed logins only (D15)", async () => {
    expect(await isAllowed(env.DB, "agapemiteu, someone", "AgapeMiteu")).toBe(true);
    expect(await isAllowed(env.DB, "agapemiteu", "stranger")).toBe(false);
    await env.DB.prepare("INSERT INTO allowlist (github_login, added_at) VALUES ('beta-tester', 0)").run();
    expect(await isAllowed(env.DB, "", "Beta-Tester")).toBe(true);
  });
});

describe("post-login redirect (open-redirect guard)", () => {
  it("keeps same-origin paths and rejects everything that can leave the origin", () => {
    expect(safeNextPath("/claim/cl_abc")).toBe("/claim/cl_abc");
    expect(safeNextPath("/tokens?x=1")).toBe("/tokens?x=1");
    const backslash = String.fromCharCode(92);
    for (const bad of [
      "//evil.com",
      `/${backslash}evil.com`,
      `/${backslash}/evil.com`,
      "https://evil.com",
      "evil.com",
      `/ok${backslash}..`,
      "/a b",
      "/tab\there",
      "",
      null,
    ]) {
      expect(safeNextPath(bad), String(bad)).toBe("/tokens");
    }
  });
});
