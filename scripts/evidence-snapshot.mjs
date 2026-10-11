// Writes the live, signed evidence snapshot into evidence/ for committing (D20), then verifies it.
// Usage: npm run evidence:snapshot   (ATLAS_ONE_URL overrides the deployment)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.ATLAS_ONE_URL ?? "https://atlas-one.collins-coordinator-worker.workers.dev").replace(/\/$/, "");
const dir = resolve(import.meta.dirname, "..", "evidence");

const snap = await (await fetch(`${ORIGIN}/evidence/snapshot.json`)).json();
if (!snap.jwt) throw new Error("The service has no signing key configured (RECEIPT_SIGNING_KEY); refusing to write an unsigned snapshot.");
const jwks = await (await fetch(`${ORIGIN}/.well-known/jwks.json`)).json();
const claims = JSON.parse(Buffer.from(snap.jwt.split(".")[1], "base64url").toString("utf8"));

mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "events.jsonl"), snap.events);
writeFileSync(resolve(dir, "summary.json"), JSON.stringify(claims.summary));
writeFileSync(resolve(dir, "snapshot.jwt"), snap.jwt + "\n");
writeFileSync(resolve(dir, "jwks.json"), JSON.stringify(jwks, null, 2) + "\n");
console.log(`Wrote evidence/ (${claims.event_count} events, sha256 ${claims.events_sha256.slice(0, 16)}...). Verifying:\n`);
execFileSync(process.execPath, [resolve(import.meta.dirname, "verify-evidence.mjs")], { stdio: "inherit" });
