import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, retryAfterHeader } from "./_lib/http";
import { fetchUsdInr } from "../../src/lib/market-data/fx.ts";
import type { FxRate } from "../../src/lib/market-data/types.ts";
import type { PagesHandler } from "./_lib/types";

/**
 * GET /api/fx?base=USD&quote=INR — one USD→INR rate with honest age.
 *
 * Order: live provider → KV entry as a labelled fallback on provider failure →
 * 502. The cache is never served while the provider answers, and a cached rate
 * is never labelled live: a fallback reply always carries `stale: true` and
 * `provider: "cache"`, so no consumer can mistake it for a fresh observation.
 * A provider observation without a timestamp is returned with `asOf: null` and
 * `stale: true` — freshness is never invented. Only provider observations are
 * written, with the 15-minute TTL. A zero rate is never produced: the provider
 * adapter throws rather than defaulting.
 */

const FX_KV_KEY = "fx:USDINR";
const FX_TTL_SECONDS = 15 * 60;

interface CachedFx {
  rate: number;
  asOf: string | null;
  fetchedAt: string;
}

const isValidCachedFx = (value: unknown): value is CachedFx => {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Partial<CachedFx>;
  return (
    typeof row.rate === "number" &&
    Number.isFinite(row.rate) &&
    row.rate > 0 &&
    (row.asOf === null || (typeof row.asOf === "string" && !Number.isNaN(Date.parse(row.asOf)))) &&
    typeof row.fetchedAt === "string" &&
    !Number.isNaN(Date.parse(row.fetchedAt))
  );
};

/**
 * One key, read via the same batched `get(keys, { type: "json" })` form the EOD
 * price cache uses (`_lib/kvPriceCache.ts`), so every KV read in the Functions
 * goes through one shape.
 */
const readCached = async (env: Parameters<PagesHandler>[0]["env"]): Promise<CachedFx | null> => {
  if (!env.PRICE_CACHE) return null;
  try {
    const entries = await env.PRICE_CACHE.get([FX_KV_KEY], { type: "json", cacheTtl: 60 });
    const value = entries.get(FX_KV_KEY);
    return isValidCachedFx(value) ? value : null;
  } catch {
    return null;
  }
};

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(`${auth.identity.uid}:fx`, RATE_LIMITS.fx.limit, RATE_LIMITS.fx.windowMs);
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const params = new URL(request.url).searchParams;
  const base = (params.get("base") ?? "USD").toUpperCase();
  const quote = (params.get("quote") ?? "INR").toUpperCase();
  if (base !== "USD" || quote !== "INR") {
    return errorResponse(env, request, 400, "Only USD→INR is supported", {}, "invalid_pair");
  }

  try {
    const observation = await fetchUsdInr();
    const fetchedAt = new Date().toISOString();
    const observedAtMs = observation.exchangeTimestampMs;
    // The provider stamp when it sent one, otherwise null: no observation time
    // means no `asOf`, and the reply is labelled stale rather than fresh.
    const asOf = observedAtMs === null ? null : new Date(observedAtMs).toISOString();
    const payload: FxRate = {
      base: "USD",
      quote: "INR",
      rate: observation.rate,
      asOf,
      stale: observedAtMs === null,
      provider: "yahoo",
      fetchedAt,
    };
    if (env.PRICE_CACHE) {
      try {
        const cached: CachedFx = { rate: payload.rate, asOf, fetchedAt: payload.fetchedAt };
        await env.PRICE_CACHE.put(FX_KV_KEY, JSON.stringify(cached), { expirationTtl: FX_TTL_SECONDS });
      } catch {
        // A failed cache write must never fail the request.
      }
    }
    return jsonResponse(env, request, payload);
  } catch {
    const cached = await readCached(env);
    if (!cached) {
      return errorResponse(env, request, 502, "FX rate is temporarily unavailable", {}, "provider_unavailable");
    }
    // A fallback is never presented as fresh: the provider did not answer, so
    // the entry's age cannot be vouched for and `stale` is always true.
    const payload: FxRate = {
      base: "USD",
      quote: "INR",
      rate: cached.rate,
      asOf: cached.asOf,
      stale: true,
      provider: "cache",
      fetchedAt: new Date().toISOString(),
    };
    return jsonResponse(env, request, payload);
  }
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
