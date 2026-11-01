import { EOD_CACHE_TTL_SECONDS, shouldWriteEodCache } from "./marketPhase";
import { instrumentKey } from "../../../src/lib/market-data/symbols.ts";
import type { Instrument } from "../../../src/lib/market-data/types.ts";
import type { Env } from "./types";

/**
 * End-of-day price cache (Workers KV, binding `PRICE_CACHE`).
 *
 * Design (see docs/migration/cloudflare-api.md for the full rationale):
 *  - ONE key per listing: `eod:{market}:{ticker}` — value is the last settled
 *    quote. The market is part of the key so the same ticker on two listings
 *    can never read or overwrite the other's entry.
 *  - The 30 h TTL applies to EOD entries ONLY. Intraday quotes are never
 *    served from KV as fresh: during the session the cache is a fallback
 *    and every entry carries `asOf` so clients can see its age.
 *  - Writes happen only while the instrument's own market is CLOSED and are
 *    amortised: an entry is rewritten only when the new quote is at least
 *    30 min newer than the stored one. This keeps write volume far below the
 *    free-tier daily quota (~tickers × 2/day) and makes stale-cache reuse
 *    impossible to mistake for live data.
 *  - Provider errors are never cached — only structurally valid prices
 *    reach this module.
 *  - Without the KV binding (local dev, tests, pre-approval) every call is
 *    a no-op and the endpoints degrade to live-only behaviour.
 */

export interface CachedQuote {
  price: number;
  /** `null` when the provider did not send it — never stored as `0`. */
  weekHigh52: number | null;
  weekLow52: number | null;
  changePercent: number;
  change: number;
  /** When this quote was actually fetched upstream. */
  asOf: string;
  source: string;
}

export const cacheKey = (instrument: Instrument): string => `eod:${instrumentKey(instrument)}`;

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
  instruments: Instrument[],
): Promise<Record<string, CachedQuote>> => {
  const binding = env.PRICE_CACHE;
  if (!binding || instruments.length === 0) return {};

  try {
    const keys = instruments.map(cacheKey);
    const results = await binding.get(keys, { type: "json", cacheTtl: 60 });
    const out: Record<string, CachedQuote> = {};
    keys.forEach((key, index) => {
      const value = results.get(key);
      if (isValidCachedQuote(value)) out[instrumentKey(instruments[index])] = value;
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
  instruments: Instrument[],
  quotes: Record<string, CachedQuote>,
  now = new Date(),
): Promise<number> => {
  const binding = env.PRICE_CACHE;
  if (!binding) return 0;

  // Gate each listing on its own market's session: a quote fetched while its
  // market is still open (or whose calendar is unknown) must never be stored
  // with the EOD TTL, and one market's phase must not gate another's.
  const settled = instruments.filter((instrument) => shouldWriteEodCache(now, instrument.market));
  if (settled.length === 0) return 0;

  let written = 0;
  try {
    const existing = await readEodCache(env, settled);
    for (const instrument of settled) {
      const key = instrumentKey(instrument);
      const quote = quotes[key];
      if (!quote) continue;
      const current = existing[key];
      if (
        current &&
        Date.parse(quote.asOf) - Date.parse(current.asOf) < EOD_WRITE_AMORTISATION_MS
      ) {
        continue;
      }
      try {
        await binding.put(cacheKey(instrument), JSON.stringify(quote), {
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
