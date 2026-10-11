// GitHub as the identity step (D1): Authorization Code + PKCE against a GitHub OAuth App.
// We only need who the developer is, so we request no GitHub scopes and discard GitHub's token.

export interface GithubConfig {
  clientId: string;
  clientSecret: string;
}

export interface GithubUser {
  id: string;
  login: string;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function s256(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier))));
}

export async function githubAuthorizeUrl(cfg: GithubConfig, redirectUri: string, state: string, verifier: string) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: await s256(verifier),
    code_challenge_method: "S256",
    allow_signup: "true",
  }).toString();
  return url.toString();
}

/** Exchanges GitHub's code and returns the signed-in user. Throws on any failure. */
export async function githubUser(
  cfg: GithubConfig,
  code: string,
  verifier: string,
  redirectUri: string,
  fetcher: typeof fetch,
): Promise<GithubUser> {
  const tokenRes = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "atlas-one" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    }),
  });
  const token = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!token.access_token) throw new Error(`GitHub token exchange failed: ${token.error ?? tokenRes.status}`);

  const userRes = await fetcher("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "atlas-one" },
  });
  if (!userRes.ok) throw new Error(`GitHub user lookup failed: ${userRes.status}`);
  const user = (await userRes.json()) as { id?: number; login?: string };
  if (typeof user.id !== "number" || typeof user.login !== "string") throw new Error("GitHub user response malformed");
  return { id: String(user.id), login: user.login };
}

/** Invite-only access during NAIC (D15): env list (bootstrap) or the allowlist table. */
export async function isAllowed(db: D1Database, envList: string | undefined, login: string): Promise<boolean> {
  const listed = (envList ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (listed.includes(login.toLowerCase())) return true;
  const row = await db.prepare("SELECT 1 AS ok FROM allowlist WHERE github_login = ?").bind(login).first();
  return row !== null;
}
