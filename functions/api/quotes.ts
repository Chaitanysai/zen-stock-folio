import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "./_lib/http";
import { normalizeSymbolList } from "../../src/lib/market-data/symbols.ts";
import { MAX_QUOTES_PER_REQUEST, resolveQuotes } from "./_lib/quotes";
import type { PagesHandler } from "./_lib/types";

/**
 * POST /api/quotes — NSE quotes with explicit freshness provenance.
 *
 * Contract (src/lib/market-data/client.ts + types.ts):
 *   body     { tickers?: string[], symbols?: string[], refresh?: boolean }
 *            — the client sends `tickers`; `symbols` is accepted as an alias.
 *   response QuotesResponse { quotes, fetchedAt, providerCounts, missing, notes }
 *            — every envelope carries provider, dataMode, exchangeTimestamp,
 *              cached, stale and unavailable.
 *
 * Admission control (ported from the reference): symbols are normalized,
 * junk entries are ignored with a note, and the list is capped at
 * MAX_QUOTES_PER_REQUEST. Unlike the reference, every caller MUST carry a
 * verified Firebase identity (this is the paid, rate-limited surface), and an
 * upstream OUTAGE fails closed as 502 instead of an empty 200. Provider errors
 * are never served as quotes; cache-derived entries are never written back.
 */

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:quotes`,
    RATE_LIMITS.quotes.limit,
    RATE_LIMITS.quotes.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const body = await readJsonBody(env, request, 4096);
  if (!body.ok) return body.response;
  if (typeof body.data !== "object" || body.data === null) {
    return errorResponse(env, request, 400, "Expected a JSON object body", {}, "invalid_tickers");
  }

  const rawBody = body.data as { tickers?: unknown; symbols?: unknown; refresh?: unknown };
  const refresh = rawBody.refresh === true;
  const rawList = Array.isArray(rawBody.tickers) ? rawBody.tickers : rawBody.symbols;

  if (!Array.isArray(rawList) || rawList.length === 0 || rawList.length > MAX_QUOTES_PER_REQUEST) {
    return errorResponse(
      env,
      request,
      400,
      `tickers must be an array of 1-${MAX_QUOTES_PER_REQUEST} NSE symbols`,
      {},
      "invalid_tickers",
    );
  }

  const { symbols, rejected, truncated } = normalizeSymbolList(rawList, MAX_QUOTES_PER_REQUEST);
  if (symbols.length === 0) {
    return errorResponse(
      env,
      request,
      400,
      rejected.length > 0
        ? "No valid NSE symbols in request"
        : `tickers must contain 1-${MAX_QUOTES_PER_REQUEST} valid NSE symbols`,
      {},
      "invalid_tickers",
    );
  }

  const outcome = await resolveQuotes(env, symbols, { bypassCache: refresh });
  if (outcome.status === "outage") {
    return errorResponse(env, request, 502, outcome.message, {}, "provider_unavailable");
  }

  if (truncated) {
    outcome.result.notes.push(`Symbol list truncated to the first ${MAX_QUOTES_PER_REQUEST}.`);
  }
  if (rejected.length > 0) {
    outcome.result.notes.push(`Ignored invalid symbol(s): ${rejected.join(", ")}.`);
  }
  return jsonResponse(env, request, outcome.result);
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
