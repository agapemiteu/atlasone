// Admin seed, until OAuth Connect and binding land (D10). Secrets are printed once; only their
// SHA-256 digests are stored.
//
//   node scripts/seed.ts --name "Demo app"                     # project + project key, local D1
//   node scripts/seed.ts --name "Demo app" --remote            # same, deployed D1
//   node scripts/seed.ts --pat --owner <github-id> --remote    # personal access token for MCP clients
//
// --owner is the developer's numeric GitHub user id (gh api user --jq .id), the same id OAuth sign-in uses.

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
    pat: { type: "boolean", default: false },
  },
});

const name = values.name.trim();
const owner = values.owner.trim();
if (!/^[\w .-]{1,64}$/.test(name) || !/^[\w-]{1,64}$/.test(owner)) {
  console.error("--name: 1-64 of letters, digits, space . _ -   --owner: 1-64 of letters, digits, _ -");
  process.exit(2);
}
const target = values.remote ? "--remote" : "--local";
const now = Date.now();

function execute(sql: string) {
  // SQL goes through a temp file: passing it as an argument breaks under Windows shell quoting.
  const dir = mkdtempSync(join(tmpdir(), "atlas-seed-"));
  const file = join(dir, "seed.sql");
  writeFileSync(file, sql);
  try {
    // Run wrangler's JS entry with this Node binary: no shell, no argument re-parsing on any OS.
    const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
    execFileSync(process.execPath, [wrangler, "d1", "execute", "atlas-one", target, "--file", file, "--yes"], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// All interpolated values are validated above or generated here (UUIDs, hex digests).
if (values.pat) {
  const pat = await mintCredential("pat");
  execute(
    `INSERT INTO personal_tokens (id, owner_github_id, prefix, hash, created_at) VALUES ('${crypto.randomUUID()}', '${owner}', '${pat.prefix}', '${pat.hash}', ${now});`,
  );
  console.log(`owner=${owner}  db=${target.slice(2)}`);
  console.log(`ATLAS_ONE_PAT=${pat.secret}`);
  console.log("Shown once. Use it as 'Authorization: Bearer <token>' in your MCP client config; never commit it.");
} else {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const projectId = crypto.randomUUID();
  const key = await mintCredential("live");
  execute(
    [
      `INSERT INTO projects (id, owner_github_id, name, slug, created_at) VALUES ('${projectId}', '${owner}', '${name}', '${slug}', ${now});`,
      `INSERT INTO api_keys (id, project_id, prefix, hash, created_at) VALUES ('${crypto.randomUUID()}', '${projectId}', '${key.prefix}', '${key.hash}', ${now});`,
    ].join(" "),
  );
  console.log(`project_id=${projectId}  slug=${slug}  owner=${owner}  db=${target.slice(2)}`);
  console.log(`ATLAS_ONE_API_KEY=${key.secret}`);
  console.log("Shown once. Put it in the app's server-side env (e.g. .env.local); never commit it.");
}
