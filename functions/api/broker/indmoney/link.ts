import { requireVerifiedIdentity } from "../../_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "../../_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, readJsonBody, retryAfterHeader } from "../../_lib/http";
import { BrokerError, createIndstocksClient } from "../../_lib/indstocks";
import { assertBrokerTokenKey, BrokerTokenKeyError, encryptBrokerToken } from "../../_lib/brokerToken";
import { consumeDaily, dailyRetryAfterSeconds } from "../../_lib/dailyLimit";
import type { PagesHandler } from "../../_lib/types";

/**
 * POST /api/broker/indmoney/link
 *
 * Validates a pasted 24-hour INDstocks token against `/user/profile`, then
 * returns AES-GCM-sealed material for the browser to store in
 * `users/{uid}/private/brokerConnection`. MPIN and TOTP never reach this app.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_TOKEN_CHARS = 20;
const MAX_TOKEN_CHARS = 4096;
// The longest accepted token is MAX_TOKEN_CHARS, so the body cap has to clear
// that plus the JSON envelope; a smaller cap would report an oversized body
// (413) instead of an over-long token (400).
const MAX_BODY_BYTES = 8 * 1024;

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:broker-link`,
    RATE_LIMITS.broker.limit,
    RATE_LIMITS.broker.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs), "RATE_LIMITED");
  }

  // Configuration is checked before the body and the daily budget: a
  // misconfigured deployment must not spend a user's daily units on 503s.
  if (!env.INDSTOCKS_BASE_URL || !env.INDSTOCKS_API_KEY || !env.BROKER_TOKEN_KEY) {
    return errorResponse(env, request, 503, "Broker sync is not configured", {}, "BROKER_DISABLED");
  }

  // A key that is present but malformed is still a configuration failure: fail
  // closed here, before any broker call or daily-unit spend.
  try {
    assertBrokerTokenKey(env.BROKER_TOKEN_KEY);
  } catch (caught) {
    if (!(caught instanceof BrokerTokenKeyError)) throw caught;
    return errorResponse(env, request, 503, "Broker sync is not configured", {}, "BROKER_DISABLED");
  }

  // Validation precedes the daily budget: a rejected paste never reaches the
  // broker, so it must not consume a unit.
  const body = await readJsonBody<{ token?: unknown }>(env, request, MAX_BODY_BYTES);
  if (!body.ok) return body.response;

  const token = typeof body.data?.token === "string" ? body.data.token.trim() : "";
  if (!token || token.length < MIN_TOKEN_CHARS || token.length > MAX_TOKEN_CHARS) {
    return errorResponse(env, request, 400, "Paste a valid broker API token", {}, "INVALID_TOKEN");
  }

  // The unit is spent only now, when the next step actually calls the broker.
  const daily = await consumeDaily(env, auth.identity.uid, RATE_LIMITS.broker.daily);
  if (!daily.allowed) {
    return errorResponse(
      env, request, 429,
      "Daily broker limit reached",
      { "Retry-After": String(dailyRetryAfterSeconds()) },
      "RATE_LIMITED",
    );
  }

  try {
    const client = createIndstocksClient({
      baseUrl: env.INDSTOCKS_BASE_URL,
      apiKey: env.INDSTOCKS_API_KEY,
      token,
    });
    await client.profile();
  } catch (caught) {
    if (caught instanceof BrokerError && caught.kind === "auth") {
      return errorResponse(
        env, request, 409,
        "That broker token is expired or invalid. Generate a new one and paste it again.",
        {}, "TOKEN_EXPIRED",
      );
    }
    if (caught instanceof BrokerError && caught.kind === "contract") {
      return errorResponse(env, request, 502, "The broker returned an unexpected response. Token not saved.", {}, "BROKER_CONTRACT");
    }
    return errorResponse(env, request, 502, "The broker is temporarily unavailable. Token not saved.", {}, "BROKER_UNAVAILABLE");
  }

  try {
    const sealed = await encryptBrokerToken(token, auth.identity.uid, env.BROKER_TOKEN_KEY);
    return jsonResponse(env, request, {
      ...sealed,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    });
  } catch {
    return errorResponse(env, request, 500, "Server encryption is misconfigured", {}, "BROKER_KEY_INVALID");
  }
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
