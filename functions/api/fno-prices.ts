import { z } from "zod";
import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "./_lib/http";
import { fetchJson } from "./_lib/upstream";
import type { PagesHandler } from "./_lib/types";

/**
 * POST /api/fno-prices — live F&O premium fetcher (Upstox NFO, Yahoo spot
 * fallback for futures only). Contract preserved from api/fno-prices.ts:
 *   request  { trades: [{ id, symbol, instrumentType: "CE"|"PE"|"FUT", strike?, expiry, lotSize, lots }] }
 *   response { ltpMap: { [tradeId]: { ltp, change, iv?, delta?, oi? } }, source, fetchedAt, note }
 *
 * Now requires a Firebase ID token; requests are schema-validated and
 * size-capped. No caching: option premiums are position-specific and were
 * never cached in production. Provider failures degrade exactly as before
 * (503 with a non-secretive hint); nothing is fabricated.
 */

const TICKER_REGEX = /^[A-Za-z0-9&.-]{1,15}$/;
const UPSTOX_TIMEOUT_MS = 9000;

const tradeSchema = z.object({
  id: z.string().min(1).max(64),
  symbol: z.string().regex(TICKER_REGEX),
  instrumentType: z.enum(["CE", "PE", "FUT"]),
  strike: z.number().nonnegative().optional(),
  expiry: z.string().min(6).max(12),
  lotSize: z.number().int().positive().max(100_000),
  lots: z.number().int().min(0).max(10_000),
});

const bodySchema = z.object({ trades: z.array(tradeSchema).min(1).max(50) });

type Trade = z.infer<typeof bodySchema>["trades"][number];

/** "DD-MM-YYYY" or "DD-Mon-YYYY" → "YYYY-MM-DD" for Upstox keys. */
const toISODate = (expiry: string): string => {
  const parts = expiry.split("-");
  if (parts.length !== 3) return expiry;
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mid = parts[1].toLowerCase();
  if (monthNames[mid]) return `${parts[2]}-${monthNames[mid]}-${parts[0].padStart(2, "0")}`;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
};

const buildInstrumentKey = (trade: Trade): string => {
  const isoDate = toISODate(trade.expiry);
  if (trade.instrumentType === "FUT") return `NFO_FUT|${trade.symbol}|${isoDate}`;
  const strikeInt = Math.round(trade.strike ?? 0);
  return `NFO_OPT|${trade.symbol}|${isoDate}|${strikeInt}|${trade.instrumentType}`;
};

interface FnOPrice {
  ltp: number;
  change?: number;
  iv?: number;
  delta?: number;
  oi?: number;
}

const fetchUpstoxFnO = async (
  accessToken: string | undefined,
  trades: Trade[],
): Promise<Record<string, FnOPrice> | null> => {
  if (!accessToken) return null;

  const keyToId: Record<string, string> = {};
  const keys: string[] = [];
  for (const trade of trades) {
    const key = buildInstrumentKey(trade);
    keyToId[key] = trade.id;
    keys.push(key);
  }

  const result = await fetchJson<{
    status?: string;
    data?: Record<string, {
      last_price?: number;
      ohlc?: { close?: number };
      prev_close?: number;
      oi?: number;
      option_greeks?: { iv?: number; delta?: number };
    }>;
  }>(
    `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${keys.map(encodeURIComponent).join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    UPSTOX_TIMEOUT_MS,
  );
  if (!result.ok || result.data.status !== "success") return null;

  const out: Record<string, FnOPrice> = {};
  for (const [rawKey, tradeId] of Object.entries(keyToId)) {
    const q = result.data.data?.[rawKey.replace(/\|/g, ":")];
    if (!q || typeof q.last_price !== "number") continue;
    const prevClose = q.ohlc?.close ?? q.prev_close ?? q.last_price;
    out[tradeId] = {
      ltp: q.last_price,
      change: q.last_price - prevClose,
      oi: q.oi ?? undefined,
      iv: q.option_greeks?.iv ?? undefined,
      delta: q.option_greeks?.delta ?? undefined,
    };
  }
  return Object.keys(out).length ? out : null;
};

/** Yahoo spot fallback — futures only (options have no Yahoo premium). */
const fetchYahooFutFallback = async (
  trades: Trade[],
): Promise<Record<string, FnOPrice> | null> => {
  const futTrades = trades.filter((t) => t.instrumentType === "FUT");
  if (futTrades.length === 0) return null;

  const symbols = [...new Set(futTrades.map((t) => `${t.symbol}.NS`))].join(",");
  const result = await fetchJson<{
    quoteResponse?: { result?: Array<{ symbol?: string; regularMarketPrice?: number; regularMarketPreviousClose?: number }> };
  }>(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketPreviousClose`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "application/json",
      },
    },
    UPSTOX_TIMEOUT_MS,
  );
  if (!result.ok) return null;

  const results = result.data.quoteResponse?.result ?? [];
  const spotMap: Record<string, { price: number; prevClose?: number }> = {};
  for (const q of results) {
    const sym = (q.symbol ?? "").replace(/\.NS$/, "");
    if (typeof q.regularMarketPrice === "number") {
      spotMap[sym] = { price: q.regularMarketPrice, prevClose: q.regularMarketPreviousClose };
    }
  }

  const out: Record<string, FnOPrice> = {};
  for (const trade of futTrades) {
    const spot = spotMap[trade.symbol];
    if (spot && spot.price > 0) {
      out[trade.id] = {
        ltp: spot.price,
        change: spot.price - (spot.prevClose ?? spot.price),
      };
    }
  }
  return Object.keys(out).length ? out : null;
};

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:fno-prices`,
    RATE_LIMITS.fnoPrices.limit,
    RATE_LIMITS.fnoPrices.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const body = await readJsonBody(env, request, 16 * 1024);
  if (!body.ok) return body.response;

  const parsed = bodySchema.safeParse(body.data);
  if (!parsed.success) {
    return errorResponse(env, request, 400, "trades must be a valid array of 1-50 F&O trades");
  }

  let ltpMap = await fetchUpstoxFnO(env.UPSTOX_ACCESS_TOKEN, parsed.data.trades);
  let source = ltpMap ? "upstox-nfo" : "";

  const missingTrades = parsed.data.trades.filter((t) => !ltpMap?.[t.id]);
  if (missingTrades.length > 0) {
    const fallback = await fetchYahooFutFallback(missingTrades);
    if (fallback) {
      ltpMap = { ...(ltpMap ?? {}), ...fallback };
      source = source ? `${source}+yahoo-spot` : "yahoo-spot-futures-only";
    }
  }

  if (!ltpMap || Object.keys(ltpMap).length === 0) {
    return errorResponse(env, request, 503, "Could not fetch F&O prices from any provider");
  }

  return jsonResponse(env, request, {
    ltpMap,
    source,
    fetchedAt: new Date().toISOString(),
    note: "CE/PE LTP = option premium. FUT LTP = futures price (≈ spot).",
  });
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
