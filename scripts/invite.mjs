// Adds GitHub logins to the Atlas One beta invite list (remote D1).
// Usage: npm run invite -- <login> [login ...]
import { execFileSync } from "node:child_process";

const logins = process.argv.slice(2);
if (!logins.length || logins.some((l) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(l))) {
  console.error("Usage: npm run invite -- <github-login> [more logins]  (letters, digits and hyphens only)");
  process.exit(1);
}
const now = Date.now();
const sql = logins.map((l) => `INSERT OR IGNORE INTO allowlist (github_login, added_at) VALUES ('${l}', ${now});`).join(" ");
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "atlas-one", "--remote", "--command", sql], { stdio: "inherit" });
console.log(`Invited: ${logins.map((l) => "@" + l).join(", ")}. They can sign in now.`);
