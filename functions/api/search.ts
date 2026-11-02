import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, retryAfterHeader } from "./_lib/http";
import { searchSymbols } from "../../src/lib/market-data/search.ts";
import { isMarket } from "../../src/lib/market-data/symbols.ts";
import type { PagesHandler } from "./_lib/types";

/**
 * GET /api/search?q=..&market=..&limit=.. — market-scoped symbol lookup for the
 * header search box.
 *
 * The browser never queries a provider directly (Yahoo search sends no CORS
 * header), so all lookups happen here. On this runtime the two local sources
 * of the reference (the 40 MB Upstox instrument master and the ~1 MB Twelve
 * Data directory) are not loaded — Workers memory/CPU limits rule them out —
 * so search runs on live Yahoo. The adapter filters to the requested market:
 * NSE (`exchange === "NSI"`) or U.S. listings only.
 *
 * `market` defaults to NSE and an unrecognized value is rejected, never
 * silently treated as NSE: a listing must not be guessed.
 *
 * "q matched nothing" is a 200 with `hits: []` and a note. "The only search
 * source is down" is a provider failure and must fail closed as 502, never a
 * 200 that looks like "no such symbol".
 */

const MIN_QUERY_LENGTH = 1;
const MAX_QUERY_LENGTH = 40;
/** Marker note from src/lib/market-data/search.ts when the live source failed. */
const YAHOO_UNAVAILABLE_PREFIX = "Yahoo search unavailable";

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:search`,
    RATE_LIMITS.search.limit,
    RATE_LIMITS.search.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const url = new URL(request.url);
  const marketParam = url.searchParams.get("market") ?? "NSE";
  if (!isMarket(marketParam)) {
    return errorResponse(env, request, 400, "Unsupported market", {}, "invalid_market");
  }
  const raw = (url.searchParams.get("q") ?? "").trim();
  if (raw.length < MIN_QUERY_LENGTH) {
    return errorResponse(env, request, 400, "Query parameter `q` is required", {}, "missing_query");
  }

  const result = await searchSymbols(raw.slice(0, MAX_QUERY_LENGTH), {
    instruments: null,
    twelveDataHits: null,
    allowYahoo: true,
    market: marketParam,
  });

  const noSourceAnswered =
    result.hits.length === 0 &&
    result.notes.some((note) => note.startsWith(YAHOO_UNAVAILABLE_PREFIX));
  if (noSourceAnswered) {
    return errorResponse(env, request, 502, "Symbol search is temporarily unavailable", {}, "provider_unavailable");
  }
  return jsonResponse(env, request, result);
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
