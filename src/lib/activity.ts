// Beta evidence (D19, D20): an append-only log of who connected with which agent and the outcome of every
// tool call (metadata only), exported as JSON Lines (schema atlas-one.evidence/v1) and summarised per tester
// for the judges (PRD Test 3 and Test 6).
//
//   consent + GitHub sign-in ─► recordConnected (session_id "conn_…", login, client name)
//   every MCP tool call ──────► recordTool       (session_id, tool, action, outcome, request id, verified, ms)
//   /feedback form ───────────► feedback table, source "web" (emitted as a "feedback" event)
//   atlas_feedback (in chat) ─► feedback table, source "agent": asked when an app is verified or after long use,
//                               at most once a day per developer (feedbackDue), never mid-task
//   exportEvents ─► /evidence/events.jsonl, signed snapshot   buildEvidence ─► /evidence, /evidence.json

import { slugify } from "../tools/bind.ts";

export const EVIDENCE_SCHEMA = "atlas-one.evidence/v1";

export interface Principal {
  githubId: string;
  login: string | null;
  client: string | null;
  /** One per OAuth connection or personal token; null for grants made before sessions were recorded. */
  sessionId: string | null;
}

export async function recordConnected(db: D1Database, p: Principal, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO activity (at, github_id, login, kind, client, session_id) VALUES (?, ?, ?, 'connected', ?, ?)")
    .bind(now, p.githubId, p.login, p.client, p.sessionId)
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
      `INSERT INTO activity (at, github_id, login, kind, client, session_id, tool, action, project, ok, error_code, request_id, verified, ms)
       VALUES (?, ?, ?, 'tool', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(now, p.githubId, p.login, p.client, p.sessionId, call.tool, call.action, call.project, o.ok, o.errorCode, o.requestId, o.verified, call.ms)
    .run();
}

/** Tool calls since the developer's last feedback at which a long stretch of use earns a prompt. */
const LONG_USE_CALLS = [12, 40];
/** Feedback given this recently is not asked for again. */
const FEEDBACK_QUIET_MS = 24 * 60 * 60_000;

/**
 * Whether this tool result should ask for feedback, like an in-product "how is it going?": each time an app is
 * verified, or after a long stretch of use. Counted per developer, not per connection (one OAuth connection can
 * span days and several builds), and never within a day of their last feedback.
 */
export async function feedbackDue(
  db: D1Database,
  p: Principal,
  outcome: { verified: boolean },
  now = Date.now(),
): Promise<"app_verified" | "long_session" | null> {
  const last = await db.prepare("SELECT submitted_at FROM feedback WHERE github_id = ?").bind(p.githubId).first<number | null>("submitted_at");
  if (last && now - last < FEEDBACK_QUIET_MS) return null;
  if (outcome.verified) return "app_verified";
  const calls = await db
    .prepare("SELECT count(*) AS n FROM activity WHERE github_id = ? AND kind = 'tool' AND at > ?")
    .bind(p.githubId, last ?? 0)
    .first<number>("n");
  // This call is recorded after the response, so it is call number calls + 1.
  return LONG_USE_CALLS.includes((calls ?? 0) + 1) ? "long_session" : null;
}

/** Tool calls by a developer at which the agent offers to save the Atlas One skill: early, then once more later. */
const SKILL_OFFER_CALLS = [3, 25];

export async function skillOfferDue(db: D1Database, p: Principal): Promise<boolean> {
  const calls = await db.prepare("SELECT count(*) AS n FROM activity WHERE github_id = ? AND kind = 'tool'").bind(p.githubId).first<number>("n");
  // This call is recorded after the response, so it is call number calls + 1.
  return SKILL_OFFER_CALLS.includes((calls ?? 0) + 1);
}

export interface AgentFeedback {
  rating: number;
  issues: string;
  manual_steps?: string;
  stack?: string;
}

/**
 * Saves feedback given in chat. Same row as the web form (one per tester, latest wins); keeps the tester's
 * anonymity choice and repo link from the form. minutes is measured from the session's first event.
 */
export async function recordAgentFeedback(db: D1Database, p: Principal, f: AgentFeedback, now = Date.now()): Promise<{ minutes: number | null }> {
  const start = p.sessionId
    ? await db.prepare("SELECT min(at) AS at FROM activity WHERE session_id = ?").bind(p.sessionId).first<number | null>("at")
    : null;
  const minutes = start ? Math.min(1440, Math.round((now - start) / 60_000)) : null;
  await db
    .prepare(
      `INSERT INTO feedback (github_id, login, submitted_at, agent, stack, minutes, manual_steps, issues, rating, anonymous, repo_url, source, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'agent', ?)
       ON CONFLICT (github_id) DO UPDATE SET login = excluded.login, submitted_at = excluded.submitted_at, agent = excluded.agent,
         stack = excluded.stack, minutes = excluded.minutes, manual_steps = excluded.manual_steps, issues = excluded.issues,
         rating = excluded.rating, source = 'agent', session_id = excluded.session_id`,
    )
    .bind(p.githubId, p.login ?? p.githubId, now, p.client ?? "unknown", f.stack || "not stated", minutes, f.manual_steps || "not stated", f.issues, f.rating, p.sessionId)
    .run();
  return { minutes };
}

// ---------------------------------------------------------------------------------------------------------
// Reading the log

interface Row {
  id: number;
  at: number;
  github_id: string;
  login: string | null;
  kind: "connected" | "tool";
  client: string | null;
  session_id: string | null;
  tool: string | null;
  action: string | null;
  project: string | null;
  ok: number | null;
  error_code: string | null;
  request_id: string | null;
  verified: number | null;
  ms: number | null;
}

interface FeedbackRow {
  github_id: string;
  login: string;
  submitted_at: number;
  agent: string;
  stack: string;
  minutes: number | null;
  manual_steps: string;
  issues: string;
  rating: number;
  anonymous: number;
  repo_url: string | null;
  source: "web" | "agent";
}

interface Identity {
  /** Stable pseudonymous id: HMAC of the GitHub id, so anonymous testers stay linkable but not identifiable. */
  testerId: string;
  login: string | null; // null when anonymous
  team: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

async function testerId(secret: string, githubId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`tester:${githubId}`)));
  return "t_" + [...mac.slice(0, 6)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function load(db: D1Database, team: string[], secret: string) {
  const [{ results: rows }, { results: fb }] = await Promise.all([
    db
      .prepare(
        "SELECT id, at, github_id, login, kind, client, session_id, tool, action, project, ok, error_code, request_id, verified, ms FROM activity ORDER BY at, id",
      )
      .all<Row>(),
    db
      .prepare("SELECT github_id, login, submitted_at, agent, stack, minutes, manual_steps, issues, rating, anonymous, repo_url, source FROM feedback")
      .all<FeedbackRow>(),
  ]);
  const teamSet = new Set(team.map((t) => t.toLowerCase()));
  const feedback = new Map(fb.map((f) => [f.github_id, f]));
  const ids = new Set([...rows.map((r) => r.github_id), ...fb.map((f) => f.github_id)]);
  const who = new Map<string, Identity>();
  for (const githubId of ids) {
    const login = feedback.get(githubId)?.login ?? rows.findLast((r) => r.github_id === githubId && r.login)?.login ?? null;
    who.set(githubId, {
      testerId: await testerId(secret, githubId),
      login: feedback.get(githubId)?.anonymous === 1 ? null : login,
      team: !!login && teamSet.has(login.toLowerCase()),
    });
  }
  return { rows, fb, feedback, who };
}

/** One JSON object per event, ordered by time (schema atlas-one.evidence/v1, documented in docs/EVIDENCE.md). */
export async function exportEvents(db: D1Database, team: string[], secret: string): Promise<string> {
  const { rows, fb, who } = await load(db, team, secret);
  const events = [
    ...rows.map((r) => {
      const w = who.get(r.github_id)!;
      const base = { schema: EVIDENCE_SCHEMA, ts: iso(r.at), seq: r.id, tester: w.testerId, login: w.login, team: w.team, session: r.session_id, client: r.client };
      return r.kind === "connected"
        ? { ...base, event: "connected" }
        : {
            ...base,
            event: "tool_call",
            tool: r.tool,
            action: r.action,
            project: r.project,
            outcome: r.ok === 1 ? "ok" : "error",
            error_code: r.error_code,
            request_id: r.request_id,
            verified: r.verified === null ? null : r.verified === 1,
            duration_ms: r.ms,
          };
    }),
    ...fb.map((f) => {
      const w = who.get(f.github_id)!;
      return {
        schema: EVIDENCE_SCHEMA,
        ts: iso(f.submitted_at),
        seq: null,
        tester: w.testerId,
        login: w.login,
        team: w.team,
        event: "feedback",
        agent: f.agent,
        stack: f.stack,
        minutes: f.minutes,
        manual_steps: f.manual_steps,
        issues: f.issues,
        rating: f.rating,
        repo_url: f.anonymous === 1 ? null : f.repo_url,
        source: f.source,
      };
    }),
  ].sort((a, b) => a.ts.localeCompare(b.ts) || (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER));
  return events.map((e) => JSON.stringify(e)).join("\n") + (events.length ? "\n" : "");
}

interface Milestone {
  at: string;
  minutes_after_connect: number | null;
  request_id: string;
  session: string | null;
}

export interface TesterEvidence {
  tester_id: string;
  tester: string; // "@login" or "Anonymous tester (t_…)"
  profile: string | null;
  team: boolean;
  agents: string[];
  sessions: number;
  connected_at: string | null;
  first_inference: Milestone | null;
  app_verified: Milestone | null;
  /** Every distinct verified app request: a tester can build several features. */
  apps_verified: number;
  tool_calls: number;
  tool_errors: Record<string, number>;
  last_active: string | null;
  /** One per project the tester worked on (a build), in order: what ran and what was verified. */
  builds: Build[];
  /** Every recorded event, oldest first (metadata only), for the per-tester timeline. */
  activity: ActivityEvent[];
  feedback: {
    agent: string;
    stack: string;
    minutes: number | null;
    manual_steps: string;
    issues: string;
    rating: number;
    /** Public repo with the committed receipt; hidden for anonymous testers. */
    repo_url: string | null;
  } | null;
}

export interface Build {
  project: string | null;
  sessions: string[];
  started: string;
  ended: string;
  calls: number;
  real_inferences: number;
  verified_requests: string[];
  errors: number;
}

export interface ActivityEvent {
  at: string;
  event: "connected" | "tool_call";
  session: string | null;
  client: string | null;
  tool: string | null;
  action: string | null;
  project: string | null;
  outcome: "ok" | "error" | null;
  error_code: string | null;
  request_id: string | null;
  verified: boolean | null;
  duration_ms: number | null;
}

/** Groups a tester's tool calls by project (agents pass a name or its slug: both count as one build). */
function builds(events: Row[]): Build[] {
  const out = new Map<string, Row[]>();
  for (const e of events) {
    if (e.kind !== "tool" || !e.project) continue;
    const key = slugify(e.project) || e.project;
    out.set(key, [...(out.get(key) ?? []), e]);
  }
  return [...out].map(([project, es]) => ({
    project,
    sessions: [...new Set(es.map((e) => e.session_id).filter((s): s is string => !!s))],
    started: iso(es[0]!.at),
    ended: iso(es.at(-1)!.at),
    calls: es.length,
    real_inferences: es.filter((e) => e.tool === "atlas_test" && e.action === "inference" && e.ok === 1).length,
    verified_requests: [...new Set(es.filter((e) => e.verified === 1 && e.request_id).map((e) => e.request_id!))],
    errors: es.filter((e) => e.ok === 0).length,
  }));
}

function activityEvent(e: Row): ActivityEvent {
  return {
    at: iso(e.at),
    event: e.kind === "connected" ? "connected" : "tool_call",
    session: e.session_id,
    client: e.client,
    tool: e.tool,
    action: e.action,
    project: e.project,
    outcome: e.kind === "connected" ? null : e.ok === 1 ? "ok" : "error",
    error_code: e.error_code,
    request_id: e.request_id,
    verified: e.verified === null ? null : e.verified === 1,
    duration_ms: e.ms,
  };
}

export interface Evidence {
  schema: typeof EVIDENCE_SCHEMA;
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
    session: event.session_id,
  };
}

/** Per-tester milestones from the log. `team` lists the Atlas One team's GitHub logins. */
export async function buildEvidence(db: D1Database, team: string[], secret: string, now = Date.now()): Promise<Evidence> {
  const { rows, feedback, who } = await load(db, team, secret);
  const byUser = new Map<string, Row[]>([...who.keys()].map((id) => [id, []]));
  for (const r of rows) byUser.get(r.github_id)!.push(r);

  const testers: TesterEvidence[] = [];
  for (const [githubId, events] of byUser) {
    const w = who.get(githubId)!;
    const f = feedback.get(githubId) ?? null;
    const connected = events.find((e) => e.kind === "connected")?.at ?? null;
    const errors: Record<string, number> = {};
    for (const e of events) if (e.error_code) errors[e.error_code] = (errors[e.error_code] ?? 0) + 1;
    testers.push({
      tester_id: w.testerId,
      tester: w.login ? `@${w.login}` : `Anonymous tester (${w.testerId})`,
      profile: w.login ? `https://github.com/${w.login}` : null,
      team: w.team,
      agents: [...new Set(events.map((e) => e.client).filter((c): c is string => !!c))],
      sessions: new Set(events.map((e) => e.session_id).filter(Boolean)).size,
      connected_at: connected === null ? null : iso(connected),
      first_inference: milestone(events.find((e) => e.tool === "atlas_test" && e.action === "inference" && e.ok === 1), connected),
      app_verified: milestone(events.find((e) => e.verified === 1), connected),
      apps_verified: new Set(events.filter((e) => e.verified === 1).map((e) => e.request_id)).size,
      tool_calls: events.filter((e) => e.kind === "tool").length,
      tool_errors: errors,
      last_active: events.length ? iso(events.at(-1)!.at) : null,
      builds: builds(events),
      activity: events.map(activityEvent),
      feedback: f && {
        agent: f.agent,
        stack: f.stack,
        minutes: f.minutes,
        manual_steps: f.manual_steps,
        issues: f.issues,
        rating: f.rating,
        repo_url: f.anonymous === 1 ? null : f.repo_url,
      },
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
    schema: EVIDENCE_SCHEMA,
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
