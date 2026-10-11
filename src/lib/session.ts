// Signed cookies for Atlas One's own pages (claim links, token management), not database rows:
// JSON payload + HMAC-SHA256, __Host- prefix, HttpOnly, Secure, SameSite=Lax.
//   __Host-atlas_session  { githubId, login, exp }       12h browser session
//   __Host-atlas_login    { state, verifier, next, exp } 10min GitHub sign-in in progress
// CSRF tokens are HMACs over (session, purpose), so a form posted from another site cannot forge one.

export const SESSION_COOKIE = "__Host-atlas_session";
export const LOGIN_COOKIE = "__Host-atlas_login";
const SESSION_TTL_MS = 12 * 60 * 60_000;
export const LOGIN_TTL_MS = 10 * 60_000;

export interface Session {
  githubId: string;
  login: string;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const MIN_SECRET_CHARS = 32;

async function hmac(secret: string, data: string): Promise<string> {
  // Fail closed: an unset secret would otherwise sign with the string "undefined".
  if (typeof secret !== "string" || secret.length < MIN_SECRET_CHARS) throw new Error("SESSION_SECRET is missing or too short");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

/** Serialises and signs a value with an expiry. */
export async function signValue(secret: string, value: object, ttlMs: number, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ ...value, exp: now + ttlMs })));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Verifies signature and expiry; returns null when either fails. */
export async function verifyValue<T extends { exp: number }>(secret: string, raw: string | undefined, now = Date.now()) {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, await hmac(secret, payload))) return null;
  try {
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as T;
    return typeof value.exp === "number" && value.exp > now ? value : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function cookie(name: string, value: string, maxAgeS: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeS}`;
}

export async function sessionCookie(secret: string, s: Omit<Session, "exp">, now = Date.now()): Promise<string> {
  return cookie(SESSION_COOKIE, await signValue(secret, s, SESSION_TTL_MS, now), SESSION_TTL_MS / 1000);
}

export function clearCookie(name: string): string {
  return cookie(name, "", 0);
}

export async function readSession(request: Request, secret: string, now = Date.now()): Promise<Session | null> {
  const s = await verifyValue<Session>(secret, readCookie(request, SESSION_COOKIE), now);
  return s && typeof s.githubId === "string" && typeof s.login === "string" ? s : null;
}

export async function csrfToken(secret: string, session: Session, purpose: string): Promise<string> {
  return hmac(secret, `csrf:${session.githubId}:${session.exp}:${purpose}`);
}

export async function checkCsrf(secret: string, session: Session, purpose: string, token: unknown): Promise<boolean> {
  return typeof token === "string" && safeEqual(token, await csrfToken(secret, session, purpose));
}
