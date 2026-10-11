// Verifies Atlas One beta evidence with standard cryptography only (D20). No install needed (Node >= 22.18).
//
//   node scripts/verify-evidence.mjs                 the signed snapshot committed in evidence/
//   node scripts/verify-evidence.mjs <receipt>       a verification receipt: file path, raw JWT, or https URL
//
// Checks: EdDSA signatures (RFC 8037) against the JWK Set in evidence/jwks.json, which must also be the key
// the live service publishes; the SHA-256 of evidence/events.jsonl against the signed digest; and, online,
// that the committed events and the receipt's request id are present in the live append-only log.
// Set ATLAS_ONE_URL to check a different deployment; pass --offline to skip the live cross-checks.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256Hex, verifyJwt } from "../src/lib/receipts.ts";

const ORIGIN = (process.env.ATLAS_ONE_URL ?? "https://atlas-one.collins-coordinator-worker.workers.dev").replace(/\/$/, "");
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const target = args.find((a) => !a.startsWith("--"));
const dir = resolve(import.meta.dirname, "..", "evidence");

let failures = 0;
const pass = (msg) => console.log(`  PASS  ${msg}`);
const fail = (msg) => {
  failures++;
  console.log(`  FAIL  ${msg}`);
};
const check = (ok, msg, why = "") => (ok ? pass(msg) : fail(why ? `${msg}: ${why}` : msg));

async function live(path) {
  const res = await fetch(`${ORIGIN}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res;
}

async function liveEvents() {
  const text = await (await live("/evidence/events.jsonl")).text();
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const repoJwks = JSON.parse(readFileSync(resolve(dir, "jwks.json"), "utf8"));

async function checkKeyIsPublished() {
  if (offline) return;
  const published = await (await live("/.well-known/jwks.json")).json();
  for (const k of repoJwks.keys) {
    const same = published.keys.some((p) => p.kid === k.kid && p.x === k.x);
    check(same, `key ${k.kid} in evidence/jwks.json is the key ${ORIGIN} publishes`);
  }
}

async function verifySnapshot() {
  console.log(`Atlas One evidence snapshot (evidence/), checked against ${offline ? "the committed key only" : ORIGIN}\n`);
  await checkKeyIsPublished();
  const jwt = readFileSync(resolve(dir, "snapshot.jwt"), "utf8").trim();
  const events = readFileSync(resolve(dir, "events.jsonl"), "utf8");
  const summary = JSON.parse(readFileSync(resolve(dir, "summary.json"), "utf8"));

  let claims;
  try {
    ({ claims } = await verifyJwt(jwt, repoJwks));
    pass(`snapshot.jwt signature (EdDSA, kid ${JSON.parse(atob(jwt.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).kid})`);
  } catch (e) {
    fail(`snapshot.jwt signature: ${e.message}`);
    return;
  }
  const digest = await sha256Hex(events);
  check(digest === claims.events_sha256, "events.jsonl SHA-256 matches the signed digest", `${digest} != ${claims.events_sha256}`);
  const lines = events.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  check(lines.length === claims.event_count, `events.jsonl has the signed event count (${claims.event_count})`);
  check(JSON.stringify(summary) === JSON.stringify(claims.summary), "summary.json matches the signed summary");

  if (!offline) {
    const now = await liveEvents();
    const key = (e) => [e.ts, e.seq, e.tester, e.event, e.session, e.tool, e.action, e.request_id, e.verified].join("|");
    const liveKeys = new Set(now.map(key));
    const missing = lines.filter((e) => !liveKeys.has(key(e)));
    check(missing.length === 0, `all ${lines.length} committed events are still in the live append-only log`, `${missing.length} missing`);
  }

  console.log(`\nSigned ${new Date(claims.iat * 1000).toISOString()} by ${claims.iss}`);
  console.log(JSON.stringify(claims.summary, null, 2));
  const verified = lines.filter((e) => e.event === "tool_call" && e.verified === true && !e.team);
  for (const e of verified) console.log(`  verified app: ${e.login ? "@" + e.login : e.tester}  ${e.request_id}  ${e.ts}  via ${e.client}`);
}

async function verifyReceipt(input) {
  const token = /^https:\/\//.test(input)
    ? (await (await fetch(input)).text()).trim()
    : /^[\w-]+\.[\w-]+\.[\w-]+$/.test(input.trim())
      ? input.trim()
      : readFileSync(input, "utf8").trim();
  console.log(`Atlas One verification receipt\n`);
  await checkKeyIsPublished();
  let header, claims;
  try {
    ({ header, claims } = await verifyJwt(token, repoJwks));
    check(header.typ === "atlas-receipt+jwt", `signature valid (EdDSA, kid ${header.kid}), type ${header.typ}`);
  } catch (e) {
    fail(`signature: ${e.message}`);
    return;
  }
  check(claims.verified === true && claims.source === "app", "receipt states the app route reached N-ATLaS");
  if (!offline) {
    const events = await liveEvents();
    const hit = events.find((e) => e.request_id === claims.request_id && e.action === "verify_app" && e.verified === true);
    check(!!hit, `request ${claims.request_id} is in the live log as a verified app`);
    if (hit) check(hit.session === claims.session, "same session as the receipt", `${hit.session} != ${claims.session}`);
  }
  console.log(`\n  developer  ${claims.login ? "@" + claims.login : "(not recorded)"} (${claims.sub})`);
  const unrecorded = "not recorded (connection made before session tracking began)";
  console.log(`  agent      ${claims.client ?? unrecorded}`);
  console.log(`  session    ${claims.session ?? unrecorded}`);
  console.log(`  project    ${claims.project?.name} (${claims.project?.slug})`);
  console.log(`  request    ${claims.request_id}`);
  console.log(`  model      ${claims.model}`);
  console.log(`  issued     ${new Date(claims.iat * 1000).toISOString()} by ${claims.iss}`);
}

try {
  await (target ? verifyReceipt(target) : verifySnapshot());
} catch (e) {
  fail(e.message);
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
process.exitCode = failures ? 1 : 0;
