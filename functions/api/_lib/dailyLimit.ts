import type { Env } from "./types";

/**
 * Broker calls are capped per user per UTC day (20) in addition to the
 * per-minute limiter. Cloudflare KV has no atomic increment, so two concurrent
 * requests can both read the same value; this is a cost guard, not an
 * authorization boundary, and it fails open when KV is absent or unhealthy.
 */

export function dailyKey(uid: string, nowMs: number = Date.now()): string {
  return `broker:daily:${uid}:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

export function dailyRetryAfterSeconds(nowMs: number = Date.now()): number {
  const now = new Date(nowMs);
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((nextDay - nowMs) / 1000));
}

export async function consumeDaily(
  env: Env,
  uid: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<{ allowed: boolean; used: number }> {
  if (!env.PRICE_CACHE) return { allowed: true, used: 0 };
  const key = dailyKey(uid, nowMs);
  try {
    const raw = await env.PRICE_CACHE.get(key);
    const used = raw ? Number.parseInt(raw, 10) || 0 : 0;
    if (used >= limit) return { allowed: false, used };
    const next = used + 1;
    // Two UTC days, so yesterday's counter is still readable if the key is hit
    // either side of midnight; KV expires it on its own.
    await env.PRICE_CACHE.put(key, String(next), { expirationTtl: 2 * 24 * 60 * 60 });
    return { allowed: true, used: next };
  } catch {
    return { allowed: true, used: 0 };
  }
}
