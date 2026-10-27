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
import type { PagesHandler } from "./_lib/types";

/**
 * POST /api/prices — multi-source NSE quote fetcher with an EOD KV cache.
 *
 * Contract (preserved from api/prices.ts):
 *   request  { tickers: string[] }
 *   response { prices: { [ticker]: { price, weekHigh52, weekLow52, changePercent, change, asOf } },
 *              fetchedAt, source, stale }
 *
 * Source order (unchanged): Upstox → Yahoo chart → EOD cache. Differences
 * from the Vercel version, all additive: every entry carries `asOf`, the
 * response adds `stale`, missing tickers are back-filled from the EOD cache
 * (their `asOf` keeps the original fetch time — never presented as live),
 * and the endpoint now requires a Firebase ID token (the dashboard is the
 * only caller; the 1 s poll is bounded per user). Provider errors are never
 * served as prices and never cached; cache-served data is labelled
 * source="kv-cache".
 */

const TICKER_REGEX = /^[A-Za-z0-9&.-]{1,15}$/;
const PROVIDER_TIMEOUT_MS = 5000;

type StockPrice = CachedQuote;

const isValidPrice = (p: StockPrice): boolean => Number.isFinite(p.price) && p.price > 0;

const bodySchema = z.object({
  tickers: z.array(z.string().regex(TICKER_REGEX)).min(1).max(40),
});

const fetchUpstox = async (
  accessToken: string | undefined,
  tickers: string[],
): Promise<Record<string, StockPrice> | null> => {
  if (!accessToken) return null;
  const keys = tickers.map((t) => `NSE_EQ|${t}`).join(",");
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
  for (const ticker of tickers) {
    const q = result.data.data?.[`NSE_EQ:${ticker}`];
    if (!q || typeof q.last_price !== "number" || typeof q.prev_close !== "number") continue;
    const change = q.last_price - q.prev_close;
    const price: StockPrice = {
      price: q.last_price,
      weekHigh52: q.week_52_high ?? 0,
      weekLow52: q.week_52_low ?? 0,
      changePercent: q.prev_close !== 0 ? (change / q.prev_close) * 100 : 0,
      change,
      asOf: now,
      source: "upstox-live",
    };
    if (isValidPrice(price)) out[ticker] = price;
  }
  return Object.keys(out).length ? out : null;
};

const fetchYahooBatch = async (
  tickers: string[],
): Promise<Record<string, StockPrice> | null> => {
  const now = new Date().toISOString();
  const results = await fetchJsonAll<{
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
          fiftyTwoWeekHigh?: number;
          fiftyTwoWeekLow?: number;
        };
      }>;
    };
  }>(
    tickers.map((t) => ({
      url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}.NS`,
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
      weekHigh52: meta?.fiftyTwoWeekHigh ?? 0,
      weekLow52: meta?.fiftyTwoWeekLow ?? 0,
      changePercent: ((ltp - pc) / pc) * 100,
      change: ltp - pc,
      asOf: now,
      source: "yahoo-chart",
    };
    if (isValidPrice(price)) out[tickers[index]] = price;
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
    return errorResponse(env, request, 400, "tickers must be an array of 1-40 valid ticker symbols");
  }
  const unique = [...new Set(parsed.data.tickers.map((t) => t.trim().toUpperCase()))];

  // 1. Upstox (real-time) — 2. Yahoo chart. Same order and semantics as the
  // production endpoint: the first source that returns anything wins.
  let live: Record<string, StockPrice> = await fetchUpstox(env.UPSTOX_ACCESS_TOKEN, unique) ?? {};
  if (Object.keys(live).length === 0) {
    live = (await fetchYahooBatch(unique)) ?? {};
  }

  // 3. EOD cache back-fill for tickers no live source could provide.
  const missing = unique.filter((t) => !live[t]);
  const cached = missing.length > 0 ? await readEodCache(env, missing) : {};

  const prices: Record<string, StockPrice> = { ...live };
  for (const [ticker, quote] of Object.entries(cached)) {
    if (!prices[ticker]) prices[ticker] = quote;
  }
  if (Object.keys(prices).length === 0) {
    return errorResponse(env, request, 503, "No price data available");
  }

  // Write-behind: persist settled quotes only while the market is closed
  // (the cache module amortises and no-ops otherwise) and never writes
  // cache-derived entries back.
  await writeEodCache(env, live);

  return jsonResponse(env, request, {
    prices,
    fetchedAt: new Date().toISOString(),
    source: Object.keys(live).length > 0 ? (live[unique.find((t) => live[t])!].source ?? "live") : "kv-cache",
    stale: Object.keys(live).length === 0,
  });
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
