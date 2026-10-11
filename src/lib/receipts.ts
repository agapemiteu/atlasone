// Signed evidence (D20): JWTs (RFC 7519) signed with EdDSA over Ed25519 (RFC 8037), public key published
// as a JWK Set (RFC 7517) at /.well-known/jwks.json and committed to the repo. Anyone can verify a
// verification receipt or an evidence snapshot offline with any standard JWT library.
//
//   RECEIPT_SIGNING_KEY (Worker secret) = private Ed25519 JWK {kty:"OKP", crv:"Ed25519", d, x, kid}
//   verify_app success ─► receipt JWT  (typ "atlas-receipt+jwt") ─► saved in the tester's own repo
//   /evidence/snapshot.json ─► snapshot JWT (typ "atlas-evidence+jwt") over the SHA-256 of the event log

export interface PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  alg: "EdDSA";
  use: "sig";
}

export interface Signer {
  kid: string;
  publicJwk: PublicJwk;
  sign(typ: string, claims: Record<string, unknown>): Promise<string>;
}

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array | string): string {
  const data = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  let s = "";
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const signers = new Map<string, Promise<Signer>>();

/** Loads (once per isolate) the signing key from its JWK JSON. Null when unset: evidence then has no signatures. */
export function loadSigner(jwkJson: string | undefined): Promise<Signer | null> {
  if (!jwkJson) return Promise.resolve(null);
  let signer = signers.get(jwkJson);
  if (!signer) {
    signer = importSigner(jwkJson);
    signers.set(jwkJson, signer);
    signer.catch(() => signers.delete(jwkJson));
  }
  return signer;
}

async function importSigner(jwkJson: string): Promise<Signer> {
  const jwk = JSON.parse(jwkJson) as { kty: string; crv: string; d: string; x: string; kid: string };
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || !jwk.d || !jwk.x || !jwk.kid) throw new Error("RECEIPT_SIGNING_KEY must be a private Ed25519 JWK with a kid");
  const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", d: jwk.d, x: jwk.x }, { name: "Ed25519" }, false, ["sign"]);
  const publicJwk: PublicJwk = { kty: "OKP", crv: "Ed25519", x: jwk.x, kid: jwk.kid, alg: "EdDSA", use: "sig" };
  return {
    kid: jwk.kid,
    publicJwk,
    async sign(typ, claims) {
      const input = `${b64url(JSON.stringify({ alg: "EdDSA", typ, kid: jwk.kid }))}.${b64url(JSON.stringify(claims))}`;
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, enc.encode(input)));
      return `${input}.${b64url(sig)}`;
    },
  };
}

/** Verifies a compact EdDSA JWS against a JWK Set; returns header and claims, or throws. */
export async function verifyJwt(token: string, jwks: { keys: PublicJwk[] }): Promise<{ header: Record<string, unknown>; claims: Record<string, unknown> }> {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("not a compact JWS");
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]!))) as { alg?: string; kid?: string };
  if (header.alg !== "EdDSA") throw new Error("unexpected alg");
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`unknown kid ${header.kid}`);
  const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64urlDecode(parts[2]!), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error("signature does not verify");
  return { header, claims: JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]!))) as Record<string, unknown> };
}
