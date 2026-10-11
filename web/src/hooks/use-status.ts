import { useEffect, useState } from "react";
import type { PublicStatus } from "@atlas/public-status.ts";

/** Live backend state from GET /api/status: every 4 s while waking, every 30 s otherwise. */
export function useStatus(): PublicStatus | null {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const tick = async () => {
      let next = 30_000;
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const s = (await res.json()) as PublicStatus;
        if (!alive) return;
        setStatus(s);
        if (s.backend === "waking" || s.backend === "loading") next = 4_000;
      } catch {
        next = 10_000;
      }
      if (alive) timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  return status;
}

export const STATE_TEXT: Record<PublicStatus["backend"], string> = {
  ready: "Online",
  waking: "Waking up",
  loading: "Starting",
  offline: "Asleep",
};
