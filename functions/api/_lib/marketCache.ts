/**
 * Per-isolate TTL cache with single-flight de-duplication for market data.
 *
 * This is a direct port of the reference implementation's `api/_lib/cache.ts`
 * (Vercel) to the Cloudflare runtime. Scope is one Worker isolate — the same
 * honest ceiling as `functions/api/_lib/ratelimit.ts` and the same scope the
 * reference documented.
 *
 * Why not KV here: the `PRICE_CACHE` KV binding's free-tier daily-write budget
 * is deliberately reserved for the amortised EOD price cache (`kvPriceCache.ts`).
 * Index/quote/candle entries live 30 s–6 h; naïvely writing each refresh to KV
 * would exhaust the quota within minutes. Cache-derived entries are therefore
 * NEVER written back anywhere: only fresh provider observations reach
 * `cacheSet`, a TTL ≤ 0 ("unknown freshness") is never cached, and failures are
 * never cached.
 *
 * Rules (preserved from the reference):
 *  - Only successful results are cached; an error must not be replayed for a TTL.
 *  - The Map acts as a crude LRU: reads refresh insertion order, so the oldest
 *    entry is what gets dropped at the cap.
 *  - Concurrent callers for the same key share one upstream request.
 */

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

export interface CachedResult<T> {
  value: T;
  cached: boolean;
  ageMs: number;
}

/** Bound the map so a hostile key space cannot grow memory without limit. */
const MAX_ENTRIES = 500;

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Read a fresh entry, evicting an expired one. */
export function cacheGet<T>(key: string): CachedResult<T> | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const now = Date.now();
  if (now >= entry.expiresAt) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, entry);
  return { value: entry.value, cached: true, ageMs: now - entry.storedAt };
}

export function cacheSet<T>(key: string, value: T, ttlMs: number, now = Date.now()): void {
  if (ttlMs <= 0) return;
  store.delete(key);
  store.set(key, { value, storedAt: now, expiresAt: now + ttlMs });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

/**
 * Get-or-load with single-flight.
 *
 * `ttlFor` receives the loaded value so a caller can choose a TTL from the
 * result's own provenance (e.g. `cacheTtlMs(dataMode)`).
 */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlFor: (value: T) => number,
): Promise<CachedResult<T>> {
  const hit = cacheGet<T>(key);
  if (hit) return hit;

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    // A caller that joined an in-flight request did not itself produce the
    // value: it is neither credited as a provider call nor written back.
    const value = await existing;
    return { value, cached: false, ageMs: 0 };
  }

  const promise = loader();
  inflight.set(key, promise as Promise<unknown>);
  try {
    const value = await promise;
    cacheSet(key, value, ttlFor(value));
    return { value, cached: false, ageMs: 0 };
  } finally {
    inflight.delete(key);
  }
}

/** Entries currently held (for the health centre and debugging). */
export function cacheStats(): { entries: number; inflight: number; maxEntries: number } {
  return { entries: store.size, inflight: inflight.size, maxEntries: MAX_ENTRIES };
}

/**
 * Drop all process-local cache state.
 *
 * Module-level caches are correct in a server and wrong in a test file: one
 * test's cached observation must never satisfy the next test's request.
 * `cached()` joins in-flight promises, which can outlive the test that stubbed
 * `fetch`, so the inflight map is cleared too.
 */
export function resetMarketCache(): void {
  store.clear();
  inflight.clear();
}
