/**
 * Fixed-window rate limiter.
 *
 * Scope note (documented, not hidden): the Map below is per Worker isolate.
 * A single Pages Function instance usually serves many requests, so this
 * softens abuse effectively, but a hard global cap additionally needs an
 * account-level Cloudflare WAF rate-limiting rule (free-tier: 1 rule) —
 * planned for Phase 5 staging, not a Phase 3 resource.
 *
 * Keys are `<uid>:<endpoint>` for authenticated calls (every Phase 3
 * endpoint authenticates), so per-user budgets are exact.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 5000;

/** Testing seam: override the clock. */
export let nowFn: () => number = () => Date.now();
export const setNowFn = (fn: () => number): void => {
  nowFn = fn;
};

export const clearRateLimits = (): void => buckets.clear();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export const checkRateLimit = (key: string, limit: number, windowMs: number): RateLimitResult => {
  const now = nowFn();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (now - b.windowStart >= windowMs) buckets.delete(k);
      }
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetInMs: bucket.windowStart + windowMs - now };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetInMs: bucket.windowStart + windowMs - now };
};

/** Rate-limit budgets per endpoint (per authenticated user, per minute). */
export const RATE_LIMITS = {
  /** /api/prices — the dashboard polls every 1 s while the market is open. */
  prices: { limit: 120, windowMs: 60_000 },
  /** /api/fno-prices — 60 s poll while open, 5 min otherwise. */
  fnoPrices: { limit: 20, windowMs: 60_000 },
  /** /api/ai — user-initiated analysis/chat. */
  ai: { limit: 10, windowMs: 60_000 },
  /** /api/news — 5 min auto-refresh plus manual refreshes. */
  news: { limit: 10, windowMs: 60_000 },
  /** /api/quotes — market-data poller: client batches ≤40 symbols on a ≥15 s cadence. */
  quotes: { limit: 60, windowMs: 60_000 },
  /** /api/candles — chart loads and manual range switches. */
  candles: { limit: 30, windowMs: 60_000 },
  /** /api/market — index strip refresh. */
  market: { limit: 30, windowMs: 60_000 },
  /** /api/search — keystroke search (client aborts per keystroke). */
  search: { limit: 30, windowMs: 60_000 },
  /** /api/health — diagnostics; ?deep=1 probes providers, so keep it tight. */
  health: { limit: 10, windowMs: 60_000 },
} as const;
