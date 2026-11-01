import { z } from "zod";
import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import {
  errorResponse,
  handleOptions,
  jsonResponse,
  readJsonBody,
  retryAfterHeader,
} from "./_lib/http";
import { fetchJson, fetchJsonAll } from "./_lib/upstream";
import { readEodCache, writeEodCache, type CachedQuote } from "./_lib/kvPriceCache";
import {
  instrumentKey,
  normalizeInstrumentList,
  toYahooSymbol,
} from "../../src/lib/market-data/symbols.ts";
import type { Instrument } from "../../src/lib/market-data/types.ts";
import type { PagesHandler } from "./_lib/types";

/**
 * POST /api/prices — multi-source quote fetcher with an EOD KV cache.
 *
 * Contract:
 *   request  { instruments: Array<{ market?: "NSE" | "US"; ticker: string }> }
 *            or the legacy { tickers: string[] } (NSE)
 *   response { prices: { ["market:ticker"]: { price, weekHigh52: number | null,
 *              weekLow52: number | null, changePercent, change, asOf } },
 *              fetchedAt, source, stale, ignored }
 *
 * Source order per listing: Upstox (NSE) → Yahoo chart for anything Upstox did
 * not resolve → EOD cache back-fill. Every entry
 * carries `asOf`, the response adds `stale`, missing instruments are
 * back-filled from the EOD cache (their `asOf` keeps the original fetch time —
 * never presented as live), and the endpoint now requires a Firebase ID token
 * (the dashboard is the only caller; the 1 s poll is bounded per user).
 * Provider errors are never served as prices and never cached; cache-served
 * data is labelled source="kv-cache". Keys and cache entries are scoped by
 * market, so the same ticker on two listings never shares a price.
 */

const PROVIDER_TIMEOUT_MS = 5000;

type StockPrice = CachedQuote;

const isValidPrice = (p: StockPrice): boolean => Number.isFinite(p.price) && p.price > 0;

// A provider field the payload omitted is unknown, not zero: `0` would render
// as a real 52-week low/high on the dashboard.
const optionalNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

// Shape only; `normalizeInstrumentList` applies the per-market symbol rules,
// rejects junk (`rejected`) and caps the list. Legacy `tickers` are NSE.
const bodySchema = z
  .object({
    instruments: z
      .array(z.object({ market: z.enum(["NSE", "US"]).optional(), ticker: z.string() }))
      .min(1)
      .max(40)
      .optional(),
    tickers: z.array(z.string()).min(1).max(40).optional(),
  })
  .refine((body) => body.instruments || body.tickers, {
    message: "instruments or tickers is required",
  });

const fetchUpstox = async (
  accessToken: string | undefined,
  instruments: Instrument[],
): Promise<Record<string, StockPrice> | null> => {
  const nse = instruments.filter((instrument) => instrument.market === "NSE");
  if (!accessToken || nse.length === 0) return null;
  const keys = nse.map((instrument) => `NSE_EQ|${instrument.ticker}`).join(",");
  const result = await fetchJson<{
    data?: Record<
      string,
      {
        last_price?: number;
        prev_close?: number;
        week_52_high?: number;
        week_52_low?: number;
      }
    >;
  }>(
    `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(keys)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    PROVIDER_TIMEOUT_MS,
  );
  if (!result.ok) return null;

  const now = new Date().toISOString();
  const out: Record<string, StockPrice> = {};
  for (const instrument of nse) {
    const q = result.data.data?.[`NSE_EQ:${instrument.ticker}`];
    if (!q || typeof q.last_price !== "number" || typeof q.prev_close !== "number") continue;
    const change = q.last_price - q.prev_close;
    const price: StockPrice = {
      price: q.last_price,
      weekHigh52: optionalNumber(q.week_52_high),
      weekLow52: optionalNumber(q.week_52_low),
      changePercent: q.prev_close !== 0 ? (change / q.prev_close) * 100 : 0,
      change,
      asOf: now,
      source: "upstox-live",
    };
    if (isValidPrice(price)) out[instrumentKey(instrument)] = price;
  }
  return Object.keys(out).length ? out : null;
};

const fetchYahooBatch = async (
  instruments: Instrument[],
): Promise<Record<string, StockPrice> | null> => {
  const now = new Date().toISOString();
  const results = await fetchJsonAll<{ chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number } }> } }>(
    instruments.map((instrument) => ({
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(instrument.ticker, instrument.market))}?range=1d&interval=1d`,
    })),
    PROVIDER_TIMEOUT_MS,
  );

  const out: Record<string, StockPrice> = {};
  results.forEach((result, index) => {
    if (!result.ok) return;
    const meta = result.data.chart?.result?.[0]?.meta;
    const ltp = meta?.regularMarketPrice;
    const pc = meta?.previousClose;
    if (typeof ltp !== "number" || typeof pc !== "number" || pc === 0) return;
    const price: StockPrice = {
      price: ltp,
      weekHigh52: optionalNumber(meta?.fiftyTwoWeekHigh),
      weekLow52: optionalNumber(meta?.fiftyTwoWeekLow),
      changePercent: ((ltp - pc) / pc) * 100,
      change: ltp - pc,
      asOf: now,
      source: "yahoo-chart",
    };
    if (isValidPrice(price)) out[instrumentKey(instruments[index])] = price;
  });
  return Object.keys(out).length ? out : null;
};

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:prices`,
    RATE_LIMITS.prices.limit,
    RATE_LIMITS.prices.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const body = await readJsonBody(env, request, 4096);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return errorResponse(env, request, 400, "instruments must be an array of 1-40 valid instruments");
  }
  const requested =
    parsed.data.instruments ?? parsed.data.tickers!.map((ticker) => ({ market: "NSE" as const, ticker }));
  const { instruments, rejected } = normalizeInstrumentList(requested, 40);
  if (instruments.length === 0) {
    return errorResponse(env, request, 400, "No valid instruments in request");
  }

  // 1. Upstox (real-time, NSE only) — 2. Yahoo chart for whatever Upstox did
  // not resolve. A provider that serves one market must never shadow another
  // market's instrument: each requested listing is resolved by its own
  // provider chain (and Yahoo is never asked for a symbol Upstox already
  // served).
  let live: Record<string, StockPrice> = (await fetchUpstox(env.UPSTOX_ACCESS_TOKEN, instruments)) ?? {};
  const unresolved = instruments.filter((instrument) => !live[instrumentKey(instrument)]);
  if (unresolved.length > 0) {
    live = { ...live, ...((await fetchYahooBatch(unresolved)) ?? {}) };
  }

  // 3. EOD cache back-fill, keyed by market so two listings never mix.
  const missingInstruments = instruments.filter((instrument) => !live[instrumentKey(instrument)]);
  const cached = missingInstruments.length > 0 ? await readEodCache(env, missingInstruments) : {};

  const prices: Record<string, StockPrice> = { ...live };
  for (const [key, quote] of Object.entries(cached)) {
    if (!prices[key]) prices[key] = quote;
  }
  if (Object.keys(prices).length === 0) {
    return errorResponse(env, request, 503, "No price data available");
  }

  // Write-behind: persist settled quotes only while the market is closed
  // (the cache module amortises and no-ops otherwise) and never writes
  // cache-derived entries back.
  await writeEodCache(env, instruments, live);

  return jsonResponse(env, request, {
    prices,
    fetchedAt: new Date().toISOString(),
    source: Object.keys(live).length > 0 ? (Object.values(live)[0].source ?? "live") : "kv-cache",
    stale: Object.keys(live).length === 0,
    ignored: rejected,
  });
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
