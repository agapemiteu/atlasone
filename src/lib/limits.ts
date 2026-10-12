// Per-project request quotas. Shared by the quota enforcement and the public docs.
export const LIMITS = { min: 30, day: 500 } as const;

/**
 * Availability facts shown to developers and agents, measured on the live compute (Modal, 12 Oct 2026: cold start
 * 24 s, warm Hausa answer 1.0-1.6 s). Change them only with a new measurement.
 */
export const AVAILABILITY = { coldStart: "about 30 seconds", idleMinutes: 15 } as const;
