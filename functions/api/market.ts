import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, retryAfterHeader } from "./_lib/http";
import { resolveMarketOverview } from "./_lib/quotes";
import type { PagesHandler } from "./_lib/types";

/**
 * GET /api/market?refresh=1 — index overview for the dashboard header strip
 * (MarketOverviewResponse).
 *
 * Replies with the three supported indices and the WEAKEST freshness label
 * among them, so one delayed index cannot make the whole strip look live.
 * An index that no provider answered is returned with `price: null` rather
 * than dropped, so the UI can render "unavailable" honestly — but a total
 * provider outage fails closed as 502 instead of a strip of nulls that looks
 * like "no data".
 */

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:market`,
    RATE_LIMITS.market.limit,
    RATE_LIMITS.market.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const outcome = await resolveMarketOverview({ bypassCache: refresh });
  if (outcome.status === "outage") {
    return errorResponse(env, request, 502, outcome.message, {}, "provider_unavailable");
  }
  return jsonResponse(env, request, outcome.result);
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
