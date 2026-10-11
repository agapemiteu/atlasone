// Admin seed: creates a project and one project key so the gateway can be tested before
// OAuth binding exists (D10). Prints the key once; only its SHA-256 digest is stored.
//
//   node scripts/seed.ts --name "Demo app"            # local D1 (wrangler dev)
//   node scripts/seed.ts --name "Demo app" --remote   # deployed D1

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { mintCredential } from "../src/lib/credentials.ts";

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "Seed project" },
    owner: { type: "string", default: "seed" },
    remote: { type: "boolean", default: false },
  },
});

const name = values.name.trim();
const owner = values.owner.trim();
if (!/^[\w .-]{1,64}$/.test(name) || !/^[\w-]{1,64}$/.test(owner)) {
  console.error("--name: 1-64 of letters, digits, space . _ -   --owner: 1-64 of letters, digits, _ -");
  process.exit(2);
}

const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const projectId = crypto.randomUUID();
const keyId = crypto.randomUUID();
const key = await mintCredential("live");
const now = Date.now();

// All interpolated values are validated above or generated here (UUIDs, hex digests).
const sql = [
  `INSERT INTO projects (id, owner_github_id, name, slug, created_at) VALUES ('${projectId}', '${owner}', '${name}', '${slug}', ${now});`,
  `INSERT INTO api_keys (id, project_id, prefix, hash, created_at) VALUES ('${keyId}', '${projectId}', '${key.prefix}', '${key.hash}', ${now});`,
].join(" ");

// SQL goes through a temp file: passing it as an argument breaks under Windows shell quoting.
const dir = mkdtempSync(join(tmpdir(), "atlas-seed-"));
const file = join(dir, "seed.sql");
writeFileSync(file, sql);
const target = values.remote ? "--remote" : "--local";
try {
  // Run wrangler's JS entry with this Node binary: no shell, no argument re-parsing on any OS.
  const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  execFileSync(process.execPath, [wrangler, "d1", "execute", "atlas-one", target, "--file", file, "--yes"], {
    stdio: ["ignore", "ignore", "inherit"],
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`project_id=${projectId}  slug=${slug}  owner=${owner}  db=${target.slice(2)}`);
console.log(`ATLAS_ONE_API_KEY=${key.secret}`);
console.log("Shown once. Put it in the app's server-side env (e.g. .env.local); never commit it.");
