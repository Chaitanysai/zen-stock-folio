import { buildProvenance, cacheTtlMs, RANGE_PRESETS } from "../../../src/lib/market-data/freshness.ts";
import { fetchUpstoxQuotes } from "../../../src/lib/market-data/upstox.ts";
import {
  fetchYahooCandles,
  fetchYahooQuote,
  ProviderHttpError,
} from "../../../src/lib/market-data/yahoo.ts";
import { SUPPORTED_INDICES } from "../../../src/lib/market-data/symbols.ts";
import type {
  CandleRange,
  CandlesEnvelope,
  CandleResolution,
  DataMode,
  IndexQuote,
  MarketOverviewResponse,
  ProviderId,
  Quote,
  QuoteEnvelope,
  QuotesResponse,
} from "../../../src/lib/market-data/types.ts";
import type { Env } from "./types";
import { cacheGet, cacheSet, cached, type CachedResult } from "./marketCache";

/**
 * Quote resolution service: provider order, caching, and honest provenance.
 *
 * Port of the reference implementation (Stock-Tracker api-integration
 * `api/_lib/quotes.ts`); the provider ORDER and provenance semantics are
 * preserved exactly:
 *  1. Upstox — a verified realtime feed, but only when `UPSTOX_ACCESS_TOKEN`
 *     is set. On this runtime there is no instrument master (the 40 MB
 *     NSE.json.gz download is not compatible with Workers memory/CPU limits),
 *     so keys are composed the way `/api/prices` already composes them
 *     (`NSE_EQ|<SYMBOL>`, one batched call). If Upstox rejects or lacks a
 *     symbol, that symbol degrades to Yahoo — the same graceful fallback the
 *     reference had when its instrument master was unavailable.
 *  2. Yahoo `v8/finance/chart` — always available, delayed during a session,
 *     server-side only.
 *  3. Cache — served only within the mode's TTL and re-labelled with its real
 *     age; cache-derived entries are never written back.
 *
 * A symbol no provider answers for is reported in `missing`; it is never
 * filled with a stale number from a different symbol and never with a zero.
 * An upstream OUTAGE is a typed failure (`status: "outage"`) — the handler
 * maps it to 502 — never an empty success that looks like "no data".
 */

/** Hard ceiling — a request must not be able to ask for 10k symbols
 * (matches the client's `MAX_PER_REQUEST = 40` batching). */
export const MAX_QUOTES_PER_REQUEST = 40;

export interface QuoteServiceOptions {
  now?: number;
  /** Skip cache reads (manual refresh). */
  bypassCache?: boolean;
  timeoutMs?: number;
}

/** Everything a provenance envelope needs, kept provider-shape-agnostic. */
export interface ProviderObservation {
  quote: Quote;
  provider: ProviderId;
  exchangeTimestampMs: number | null;
  unavailable: string[];
  realtimeProvider: boolean;
  warnings: string[];
}

/**
 * Failure classes — the distinction the fail-closed rule needs:
 *  - `notfound`: the provider answered and said "no such symbol" (HTTP 404 or
 *    an explicit Not Found chart error). Honest per-symbol absence.
 *  - `outage`: the provider did not answer properly (network, 5xx, 429).
 */
export type ObservationFailure =
  | { kind: "notfound"; message: string }
  | { kind: "outage"; message: string };

export type ObservationResult =
  | { ok: true; observation: ProviderObservation }
  | { ok: false; failure: ObservationFailure };

const isNotFoundSignal = (message: string): boolean =>
  /\b404\b|Not Found/i.test(message);

const failureFrom = (error: unknown): ObservationFailure => {
  const message = error instanceof Error ? error.message : "unknown error";
  const status = error instanceof ProviderHttpError ? error.status : undefined;
  if (status === 404 || isNotFoundSignal(message)) {
    return { kind: "notfound", message };
  }
  return { kind: "outage", message };
};

/** Try Yahoo for one target. Targets may be bare NSE symbols or `^NSEI`. */
export async function yahooObservation(
  target: string,
  timeoutMs = 5000,
): Promise<ObservationResult> {
  try {
    const result = await fetchYahooQuote(target, timeoutMs);
    return {
      ok: true,
      observation: {
        quote: result.quote,
        provider: "yahoo",
        exchangeTimestampMs: result.exchangeTimestampMs,
        unavailable: result.unavailable,
        realtimeProvider: false,
        warnings: [],
      },
    };
  } catch (error) {
    return { ok: false, failure: failureFrom(error) };
  }
}

/**
 * Try Upstox for a batch of symbols with ONE call (batched rather than looped
 * so N equities cost one rate-limited request). Returns observations only for
 * rows the API actually returned; any batch failure degrades to an empty map
 * so Yahoo carries the request — the failure is a health-centre concern.
 */
export async function upstoxObservations(
  env: Env,
  symbols: string[],
  timeoutMs = 5000,
): Promise<Map<string, ProviderObservation>> {
  const out = new Map<string, ProviderObservation>();
  const token = env.UPSTOX_ACCESS_TOKEN;
  if (!token || symbols.length === 0) return out;

  try {
    const keys = symbols.map((symbol) => `NSE_EQ|${symbol}`);
    const result = await fetchUpstoxQuotes(
      keys,
      { accessToken: token },
      { labelFor: (key) => key.slice("NSE_EQ|".length), timeoutMs },
    );
    for (const [key, row] of result.rows) {
      const symbol = key.slice("NSE_EQ|".length);
      out.set(symbol, {
        quote: row.quote,
        provider: "upstox",
        exchangeTimestampMs: row.exchangeTimestampMs,
        unavailable: row.unavailable,
        realtimeProvider: true,
        warnings: [],
      });
    }
  } catch {
    // Degrade to Yahoo exactly like the reference's tryUpstox catch.
  }
  return out;
}

/** Wrap an observation in provenance derived from the provider's own timestamp. */
export function envelopeFor(
  observation: ProviderObservation,
  params: { now: number; cached: boolean; cacheAgeMs: number },
): QuoteEnvelope {
  const provenance = buildProvenance({
    provider: observation.provider,
    exchangeTimestampMs: observation.exchangeTimestampMs,
    now: params.now,
    cached: params.cached,
    cacheAgeMs: params.cacheAgeMs,
    unavailable: observation.unavailable,
    warnings: observation.warnings,
    realtimeProvider: observation.realtimeProvider,
  });
  return { ...provenance, quote: observation.quote };
}

export type QuotesOutcome =
  | { status: "ok"; result: QuotesResponse }
  | { status: "outage"; message: string };

/**
 * Resolve quotes for an already-normalized, already-capped symbol list.
 *
 * `symbols` must be valid NSE symbols; this function does no admission control
 * of its own (same contract as the reference).
 */
export async function resolveQuotes(
  env: Env,
  symbols: string[],
  options: QuoteServiceOptions = {},
): Promise<QuotesOutcome> {
  const now = options.now ?? Date.now();
  const timeoutMs = options.timeoutMs ?? 5000;
  const quotes: Record<string, QuoteEnvelope> = {};
  const providerCounts: Record<string, number> = {};
  const missing: string[] = [];
  const outages: string[] = [];
  const notes: string[] = [];

  const bump = (provider: string) => {
    providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;
  };

  // Phase 1: cache — bounded by each mode's TTL. A cached observation that can
  // no longer support a freshness label is dropped rather than shown:
  // retrying is better than mislabelling.
  const pending: string[] = [];
  for (const symbol of symbols) {
    if (!options.bypassCache) {
      const hit = cacheGet<ProviderObservation>(`quote:${symbol}`);
      if (hit) {
        const envelope = envelopeFor(hit.value, { now, cached: true, cacheAgeMs: hit.ageMs });
        if (envelope.dataMode !== "unknown") {
          quotes[symbol] = envelope;
          bump("cache");
          continue;
        }
      }
    }
    pending.push(symbol);
  }

  // Phase 2: Upstox — one batched call when a token is set.
  if (pending.length > 0) {
    const upstox = await upstoxObservations(env, pending, timeoutMs);
    for (const symbol of pending) {
      const observation = upstox.get(symbol);
      if (!observation) continue;
      const envelope = envelopeFor(observation, { now, cached: false, cacheAgeMs: 0 });
      quotes[symbol] = envelope;
      bump(observation.provider);
      // Never cache an observation whose freshness is unknown: the next
      // request must attempt to establish it.
      cacheSet(`quote:${symbol}`, observation, cacheTtlMs(envelope.dataMode), now);
    }
  }

  // Phase 3: Yahoo for what remains — bounded concurrency. Four keeps a
  // 40-symbol request inside its 5 s budget (reference value).
  const remaining = symbols.filter((symbol) => !quotes[symbol]);
  const CONCURRENCY = 4;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, async () => {
      for (;;) {
        const position = cursor++;
        if (position >= remaining.length) return;
        const symbol = remaining[position];
        const result = await yahooObservation(symbol, timeoutMs);
        if (result.ok) {
          const envelope = envelopeFor(result.observation, { now, cached: false, cacheAgeMs: 0 });
          quotes[symbol] = envelope;
          bump(result.observation.provider);
          cacheSet(`quote:${symbol}`, result.observation, cacheTtlMs(envelope.dataMode), now);
        } else {
          missing.push(symbol);
          if (result.failure.kind === "outage") outages.push(symbol);
        }
      }
    }),
  );

  if (missing.length > 0) {
    notes.push(`No provider returned data for: ${missing.join(", ")}.`);
  }
  if (outages.length > 0) {
    notes.push(`Provider unreachable for: ${outages.join(", ")}.`);
  }
  if (outages.length > 0 && Object.keys(quotes).length === 0) {
    // Fail closed: an outage must never look like a successful empty answer.
    return { status: "outage", message: "Market data provider is temporarily unavailable" };
  }

  const modes = new Set(Object.values(quotes).map((q) => q.dataMode));
  if (modes.size > 1) notes.push(`Mixed freshness: ${[...modes].sort().join(", ")}.`);

  return {
    status: "ok",
    result: {
      quotes,
      fetchedAt: new Date(now).toISOString(),
      providerCounts,
      missing,
      notes,
    },
  };
}

export type CandlesOutcome =
  | { status: "ok"; envelope: CandlesEnvelope }
  | { status: "notfound"; message: string }
  | { status: "outage"; message: string };

/**
 * Resolve one symbol's candles. Yahoo is the source (reference order): it is
 * the only zero-credential endpoint with real NSE OHLCV; Upstox's historical
 * endpoint is not used (undocumented when unauthenticated).
 */
export async function resolveCandles(
  symbol: string,
  range: CandleRange,
  options: QuoteServiceOptions = {},
): Promise<CandlesOutcome> {
  const now = options.now ?? Date.now();
  const timeoutMs = options.timeoutMs ?? 6000;
  const preset = RANGE_PRESETS[range];

  const loadCandles = () => fetchYahooCandles(symbol, range, timeoutMs);

  let loaded: { value: Awaited<ReturnType<typeof loadCandles>>; cached: boolean; ageMs: number };
  try {
    loaded = options.bypassCache
      ? { value: await loadCandles(), cached: false, ageMs: 0 }
      : await cached(
          `candles:${symbol}:${range}`,
          loadCandles,
          () => {
            // A daily series cannot change for a closed market; intraday can.
            const mode: DataMode = preset.resolution === "1d" ? "eod" : "delayed";
            return cacheTtlMs(mode);
          },
        );
  } catch (error) {
    const failure = failureFrom(error);
    if (failure.kind === "notfound") {
      return { status: "notfound", message: `No chart data for ${symbol}` };
    }
    return { status: "outage", message: "Candle provider is temporarily unavailable" };
  }

  const result = loaded.value;
  const provenance = buildProvenance({
    provider: "yahoo",
    exchangeTimestampMs: result.exchangeTimestampMs,
    now,
    cached: loaded.cached,
    cacheAgeMs: loaded.ageMs,
    unavailable: result.unavailable,
    warnings: result.warnings,
    realtimeProvider: false,
  });

  // Force `eod` for a daily series: the last daily bar is a settled close, and
  // calling it "delayed" during a session would misdescribe the resolution.
  if (preset.resolution === "1d" && provenance.dataMode !== "unknown") {
    provenance.dataMode = "eod";
    provenance.stale = false;
  }

  // An empty series is a valid answer (pre-open, holiday, thin history) but it
  // must say so rather than look like a successful chart with no data.
  if (result.candles.length === 0) {
    provenance.warnings.push(
      `Provider returned no candles for ${symbol} over ${range} (${preset.resolution as CandleResolution} bars).`,
    );
  }

  return {
    status: "ok",
    envelope: {
      ...provenance,
      symbol,
      resolution: result.resolution,
      range,
      candles: result.candles,
    },
  };
}

export type MarketOutcome =
  | { status: "ok"; result: MarketOverviewResponse }
  | { status: "outage"; message: string };

const INDEX_CACHE_TTL_MS = 30_000;

/** Order modes from most trustworthy to least. */
const MODE_RANK: Record<DataMode, number> = { realtime: 0, delayed: 1, eod: 2, unknown: 3 };

export function weakestMode(modes: DataMode[]): DataMode {
  if (modes.length === 0) return "unknown";
  return modes.reduce((worst, mode) => (MODE_RANK[mode] > MODE_RANK[worst] ? mode : worst));
}

const indexQuoteFor = (
  definition: { label: string; providerSymbol: string },
  envelope: QuoteEnvelope,
): IndexQuote => ({
  label: definition.label,
  providerSymbol: definition.providerSymbol,
  price: envelope.quote?.price ?? null,
  change: envelope.quote?.change ?? null,
  changePercent: envelope.quote?.changePercent ?? null,
  previousClose: envelope.quote?.previousClose ?? null,
  exchangeTimestamp: envelope.exchangeTimestamp,
});

/**
 * Market overview: the three supported indices plus the WEAKEST freshness
 * label among them, so one delayed index cannot make the strip look live.
 * An index no provider answered is returned with `price: null` (never
 * dropped) so the UI can render "unavailable" honestly — but when NO index
 * could be served at all, that is an outage and must fail closed.
 */
export async function resolveMarketOverview(
  options: QuoteServiceOptions = {},
): Promise<MarketOutcome> {
  const now = options.now ?? Date.now();
  const timeoutMs = options.timeoutMs ?? 5000;
  const indices: IndexQuote[] = [];
  const warnings: string[] = [];
  const modes: DataMode[] = [];
  let cachedAny = false;
  let served = 0;

  type IndexAttempt =
    | { definition: { label: string; providerSymbol: string }; hit: CachedResult<ProviderObservation> }
    | { definition: { label: string; providerSymbol: string }; outcome: ObservationResult };

  const attempts = await Promise.all(
    SUPPORTED_INDICES.map(async (definition): Promise<IndexAttempt> => {
      const cacheKey = `index:${definition.providerSymbol}`;
      if (!options.bypassCache) {
        const hit = cacheGet<ProviderObservation>(cacheKey);
        if (hit) return { definition, hit };
      }
      const outcome = await yahooObservation(definition.providerSymbol, timeoutMs);
      return { definition, outcome };
    }),
  );

  for (const attempt of attempts) {
    if ("hit" in attempt) {
      cachedAny = true;
      const envelope = envelopeFor(attempt.hit.value, {
        now,
        cached: true,
        cacheAgeMs: attempt.hit.ageMs,
      });
      modes.push(envelope.dataMode);
      indices.push(indexQuoteFor(attempt.definition, envelope));
      continue;
    }
    const outcome = attempt.outcome;
    if (outcome.ok) {
      served += 1;
      cacheSet(`index:${attempt.definition.providerSymbol}`, outcome.observation, INDEX_CACHE_TTL_MS, now);
      const envelope = envelopeFor(outcome.observation, { now, cached: false, cacheAgeMs: 0 });
      modes.push(envelope.dataMode);
      indices.push(indexQuoteFor(attempt.definition, envelope));
    } else {
      warnings.push(`${attempt.definition.label} unavailable: ${outcome.failure.message}`);
      indices.push({
        label: attempt.definition.label,
        providerSymbol: attempt.definition.providerSymbol,
        price: null,
        change: null,
        changePercent: null,
        previousClose: null,
        exchangeTimestamp: null,
      });
    }
  }

  if (served === 0 && !cachedAny) {
    return { status: "outage", message: "Market overview is temporarily unavailable" };
  }

  const weakest = weakestMode(modes);
  return {
    status: "ok",
    result: {
      indices,
      provider: "yahoo",
      dataMode: weakest,
      fetchedAt: new Date(now).toISOString(),
      cached: cachedAny,
      // Only an absence of any believable timestamp makes the strip "stale";
      // a settled EOD index is old but correct, not stale.
      stale: weakest === "unknown",
      warnings,
    },
  };
}
