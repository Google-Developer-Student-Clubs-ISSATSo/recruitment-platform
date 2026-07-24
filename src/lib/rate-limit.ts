// A tiny in-memory sliding-window rate limiter. No Redis/KV: this app runs as a
// single long-lived Node server (see auth.ts `trustHost` — a plain server, not a
// serverless fan-out), so a process-local Map is the whole picture. If this ever
// moves behind multiple instances, swap this module for a shared store
// (@upstash/ratelimit or a DB-backed counter) — every caller goes through
// `rateLimit()` so only this file changes.

type Window = { count: number; resetAt: number };

// Keyed by an opaque identifier the caller builds (e.g. "magic-link:email:ip").
const windows = new Map<string, Window>();

export type RateLimitResult = {
  /** Whether this request is allowed through. */
  ok: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** When the current window resets (epoch ms). */
  resetAt: number;
  /** Seconds until reset — handy for a Retry-After style message. */
  retryAfterSeconds: number;
};

/**
 * Count one hit against `key` and report whether it's within `limit` per
 * `windowMs`. Fixed-window: the first hit starts the clock, and the window
 * resets wholesale once it elapses. Good enough to blunt inbox-hammering and
 * enumeration probing without pretending to be a distributed limiter.
 *
 * Sweeps expired windows opportunistically on each call, so the Map can't grow
 * without bound from one-off keys.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup — cheap while the keyspace is small (per-email/IP).
  if (windows.size > 5000) {
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k);
    }
  }

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    windows.set(key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: limit - 1,
      resetAt,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  return {
    ok: existing.count <= limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(0, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Test-only: drop all counters. Not used in the app itself. */
export function __resetRateLimits() {
  windows.clear();
}
