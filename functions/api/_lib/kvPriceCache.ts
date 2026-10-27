import { EOD_CACHE_TTL_SECONDS, shouldWriteEodCache } from "./marketPhase";
import type { Env } from "./types";

/**
 * End-of-day price cache (Workers KV, binding `PRICE_CACHE`).
 *
 * Design (see docs/migration/cloudflare-api.md for the full rationale):
 *  - ONE key per ticker: `eod:{TICKER}` — value is the last settled quote.
 *  - The 30 h TTL applies to EOD entries ONLY. Intraday quotes are never
 *    served from KV as fresh: during the session the cache is a fallback
 *    and every entry carries `asOf` so clients can see its age.
 *  - Writes happen only while the market is CLOSED and are amortised: an
 *    entry is rewritten only when the new quote is at least 30 min newer
 *    than the stored one. This keeps write volume far below the free-tier
 *    daily quota (~tickers × 2/day) and makes stale-cache reuse impossible
 *    to mistake for live data.
 *  - Provider errors are never cached — only structurally valid prices
 *    reach this module.
 *  - Without the KV binding (local dev, tests, pre-approval) every call is
 *    a no-op and the endpoints degrade to live-only behaviour.
 */

export interface CachedQuote {
  price: number;
  weekHigh52: number;
  weekLow52: number;
  changePercent: number;
  change: number;
  /** When this quote was actually fetched upstream. */
  asOf: string;
  source: string;
}

export const cacheKey = (ticker: string): string => `eod:${ticker}`;

export const isValidCachedQuote = (value: unknown): value is CachedQuote => {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Partial<CachedQuote>;
  return (
    typeof q.price === "number" &&
    Number.isFinite(q.price) &&
    q.price > 0 &&
    typeof q.asOf === "string" &&
    !Number.isNaN(Date.parse(q.asOf))
  );
};

export const readEodCache = async (
  env: Env,
  tickers: string[],
): Promise<Record<string, CachedQuote>> => {
  const binding = env.PRICE_CACHE;
  if (!binding || tickers.length === 0) return {};

  try {
    const keys = tickers.map((ticker) => cacheKey(ticker));
    const results = await binding.get(keys, { type: "json", cacheTtl: 60 });
    const out: Record<string, CachedQuote> = {};
    keys.forEach((key, index) => {
      const value = results.get(key);
      if (isValidCachedQuote(value)) out[key.slice(4)] = value;
    });
    return out;
  } catch {
    return {};
  }
};

/** Rewrites an entry only when the new quote is this much newer. */
export const EOD_WRITE_AMORTISATION_MS = 30 * 60 * 1000;

export const writeEodCache = async (
  env: Env,
  quotes: Record<string, CachedQuote>,
  now = new Date(),
): Promise<number> => {
  const binding = env.PRICE_CACHE;
  if (!binding || !shouldWriteEodCache(now)) return 0;

  const tickers = Object.keys(quotes);
  let written = 0;

  try {
    const existing = await readEodCache(env, tickers);
    for (const [ticker, quote] of Object.entries(quotes)) {
      const current = existing[ticker];
      if (
        current &&
        Date.parse(quote.asOf) - Date.parse(current.asOf) < EOD_WRITE_AMORTISATION_MS
      ) {
        continue;
      }
      try {
        await binding.put(cacheKey(ticker), JSON.stringify(quote), {
          expirationTtl: EOD_CACHE_TTL_SECONDS,
        });
        written += 1;
      } catch {
        // A failed cache write must never fail the request.
      }
    }
  } catch {
    return written;
  }
  return written;
};
