// Beta evidence: records who connected with which agent and the outcome of every tool call (metadata only),
// and derives per-tester milestones for the public evidence page (PRD Test 3 and Test 6).
//
//   consent + GitHub sign-in ─► recordConnected   (github id, login, client name)
//   every MCP tool call ──────► recordTool         (tool, action, ok/error code, request id, verified, ms)
//   /feedback form ───────────► feedback table
//   /evidence ◄─────────────── buildEvidence: first connect ─► first real inference ─► first verified app

export interface Principal {
  githubId: string;
  login: string | null;
  client: string | null;
}

export async function recordConnected(db: D1Database, p: Principal, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO activity (at, github_id, login, kind, client) VALUES (?, ?, ?, 'connected', ?)")
    .bind(now, p.githubId, p.login, p.client)
    .run();
}

/** Extracts the outcome from a tool's structured result; never stores inputs or model output. */
export function toolOutcome(payload: Record<string, unknown>) {
  const error = (payload.error ?? null) as { code?: string; request_id?: string } | null;
  const evidence = (payload.evidence ?? null) as { request_id?: string } | null;
  const requestId = (payload.request_id ?? evidence?.request_id ?? error?.request_id ?? null) as string | null;
  const verified = payload.action === "verify_app" && typeof payload.verified === "boolean" ? (payload.verified ? 1 : 0) : null;
  return { ok: payload.ok === true ? 1 : 0, errorCode: error?.code ?? null, requestId, verified };
}

export async function recordTool(
  db: D1Database,
  p: Principal,
  call: { tool: string; action: string | null; project: string | null; payload: Record<string, unknown>; ms: number },
  now = Date.now(),
): Promise<void> {
  const o = toolOutcome(call.payload);
  await db
    .prepare(
      `INSERT INTO activity (at, github_id, login, kind, client, tool, action, project, ok, error_code, request_id, verified, ms)
       VALUES (?, ?, ?, 'tool', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(now, p.githubId, p.login, p.client, call.tool, call.action, call.project, o.ok, o.errorCode, o.requestId, o.verified, call.ms)
    .run();
}

interface Milestone {
  at: string;
  minutes_after_connect: number | null;
  request_id: string;
}

export interface TesterEvidence {
  tester: string; // "@login" or "Anonymous tester N"
  profile: string | null;
  team: boolean;
  agents: string[];
  connected_at: string | null;
  first_inference: Milestone | null;
  app_verified: Milestone | null;
  tool_calls: number;
  tool_errors: Record<string, number>;
  feedback: { agent: string; stack: string; minutes: number | null; manual_steps: string; issues: string; rating: number } | null;
}

export interface Evidence {
  generated_at: string;
  summary: {
    external_testers: number;
    external_with_real_inference: number;
    external_with_verified_app: number;
    median_minutes_to_first_inference: number | null;
    median_minutes_to_verified_app: number | null;
    feedback_responses: number;
    average_rating: number | null;
  };
  testers: TesterEvidence[];
}

interface Row {
  at: number;
  github_id: string;
  login: string | null;
  kind: "connected" | "tool";
  client: string | null;
  tool: string | null;
  action: string | null;
  ok: number | null;
  error_code: string | null;
  request_id: string | null;
  verified: number | null;
}

interface FeedbackRow {
  github_id: string;
  login: string;
  agent: string;
  stack: string;
  minutes: number | null;
  manual_steps: string;
  issues: string;
  rating: number;
  anonymous: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : round1((s[m - 1]! + s[m]!) / 2);
}

function milestone(event: Row | undefined, connected: number | null): Milestone | null {
  if (!event?.request_id) return null;
  return {
    at: iso(event.at),
    minutes_after_connect: connected === null ? null : round1((event.at - connected) / 60_000),
    request_id: event.request_id,
  };
}

/** Per-tester milestones from the activity log. `team` lists the Atlas One team's GitHub logins. */
export async function buildEvidence(db: D1Database, team: string[], now = Date.now()): Promise<Evidence> {
  const [{ results: rows }, { results: fb }] = await Promise.all([
    db
      .prepare("SELECT at, github_id, login, kind, client, tool, action, ok, error_code, request_id, verified FROM activity ORDER BY at, id")
      .all<Row>(),
    db.prepare("SELECT github_id, login, agent, stack, minutes, manual_steps, issues, rating, anonymous FROM feedback").all<FeedbackRow>(),
  ]);
  const teamSet = new Set(team.map((t) => t.toLowerCase()));
  const feedback = new Map(fb.map((f) => [f.github_id, f]));
  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.github_id, [...(byUser.get(r.github_id) ?? []), r]);
  for (const f of fb) if (!byUser.has(f.github_id)) byUser.set(f.github_id, []);

  let anon = 0;
  const testers: TesterEvidence[] = [];
  for (const [githubId, events] of byUser) {
    const f = feedback.get(githubId) ?? null;
    const login = f?.login ?? events.findLast((e) => e.login)?.login ?? null;
    const connected = events.find((e) => e.kind === "connected")?.at ?? null;
    const errors: Record<string, number> = {};
    for (const e of events) if (e.error_code) errors[e.error_code] = (errors[e.error_code] ?? 0) + 1;
    const hidden = f?.anonymous === 1 || !login;
    testers.push({
      tester: hidden ? `Anonymous tester ${++anon}` : `@${login}`,
      profile: hidden ? null : `https://github.com/${login}`,
      team: !!login && teamSet.has(login.toLowerCase()),
      agents: [...new Set(events.map((e) => e.client).filter((c): c is string => !!c))],
      connected_at: connected === null ? null : iso(connected),
      first_inference: milestone(events.find((e) => e.tool === "atlas_test" && e.action === "inference" && e.ok === 1), connected),
      app_verified: milestone(events.find((e) => e.verified === 1), connected),
      tool_calls: events.filter((e) => e.kind === "tool").length,
      tool_errors: errors,
      feedback: f && { agent: f.agent, stack: f.stack, minutes: f.minutes, manual_steps: f.manual_steps, issues: f.issues, rating: f.rating },
    });
  }
  testers.sort((a, b) => Number(a.team) - Number(b.team) || (a.connected_at ?? "").localeCompare(b.connected_at ?? ""));

  const external = testers.filter((t) => !t.team);
  const ratings = external.flatMap((t) => (t.feedback ? [t.feedback.rating] : []));
  const minutes = (pick: (t: TesterEvidence) => Milestone | null) =>
    external.flatMap((t) => {
      const m = pick(t)?.minutes_after_connect;
      return m == null ? [] : [m];
    });
  return {
    generated_at: iso(now),
    summary: {
      external_testers: external.length,
      external_with_real_inference: external.filter((t) => t.first_inference).length,
      external_with_verified_app: external.filter((t) => t.app_verified).length,
      median_minutes_to_first_inference: median(minutes((t) => t.first_inference)),
      median_minutes_to_verified_app: median(minutes((t) => t.app_verified)),
      feedback_responses: ratings.length,
      average_rating: ratings.length ? round1(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
    },
    testers,
  };
}
