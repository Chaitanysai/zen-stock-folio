import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, retryAfterHeader } from "./_lib/http";
import { isCandleRange, RANGE_PRESETS } from "../../src/lib/market-data/freshness.ts";
import { isSupportedIndexSymbol, normalizeSymbol } from "../../src/lib/market-data/symbols.ts";
import type { CandleRange } from "../../src/lib/market-data/types.ts";
import { resolveCandles } from "./_lib/quotes";
import type { PagesHandler } from "./_lib/types";

/**
 * GET /api/candles?symbol=..&range=..&refresh=1 — OHLCV series for one symbol
 * plus the provenance needed to label it (CandlesEnvelope).
 *
 * The browser must never call Yahoo directly (the endpoint sends no CORS
 * header), and an out-of-range preset is rejected rather than silently
 * rewritten: answering a 1-year request with one session of 5-minute bars is
 * an undetectable lie. An empty series is a valid answer (pre-open, holiday)
 * and is returned with a warning; a provider outage is a 502, never a success
 * that looks like "no data".
 */

const DEFAULT_RANGE: CandleRange = "1d";

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:candles`,
    RATE_LIMITS.candles.limit,
    RATE_LIMITS.candles.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const url = new URL(request.url);
  const rawSymbol = url.searchParams.get("symbol") ?? "";
  const rawRange = url.searchParams.get("range");
  const refresh = url.searchParams.get("refresh") === "1";

  // Index charts are legitimate (`^NSEI`), so accept a supported index as-is.
  const upper = rawSymbol.trim().toUpperCase();
  const symbol = isSupportedIndexSymbol(upper) ? upper : normalizeSymbol(rawSymbol);
  if (!symbol) {
    return errorResponse(
      env,
      request,
      400,
      "A valid NSE symbol or supported index is required",
      {},
      "invalid_symbol",
    );
  }

  if (rawRange !== null && rawRange !== "" && !isCandleRange(rawRange)) {
    return errorResponse(
      env,
      request,
      400,
      `range must be one of ${Object.keys(RANGE_PRESETS).join(", ")}`,
      {},
      "invalid_range",
    );
  }
  const range: CandleRange = isCandleRange(rawRange) ? rawRange : DEFAULT_RANGE;

  const outcome = await resolveCandles(symbol, range, { bypassCache: refresh });
  // A 404 from the provider is the common "no such symbol" case.
  if (outcome.status === "notfound") {
    return errorResponse(env, request, 404, outcome.message, {}, "symbol_not_found");
  }
  if (outcome.status === "outage") {
    return errorResponse(env, request, 502, outcome.message, {}, "provider_unavailable");
  }
  return jsonResponse(env, request, outcome.envelope);
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
