// Shape of GET /api/status: public, read-only backend state (no secrets, no requester identity).
// Shared by the Worker and the web front end.

export interface PublicStatus {
  gateway: "ok";
  backend: "ready" | "loading" | "offline" | "waking";
  stage: string | null;
  stage_text: string | null;
  detail: string | null;
  wake_started_at: string | null;
  updated_at: string | null;
  stages: { id: string; text: string; done: boolean; current: boolean }[];
  /** The most recent wake failed within the last 30 minutes, with its reason. */
  last_failure: string | null;
}
