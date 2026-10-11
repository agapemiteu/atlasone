import { env } from "cloudflare:test";

export async function makeProject(owner = "owner-1", name = `p-${crypto.randomUUID().slice(0, 8)}`) {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO projects (id, owner_github_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, owner, name, name, Date.now())
    .run();
  return id;
}
