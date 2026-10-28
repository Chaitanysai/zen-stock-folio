import type { Env } from "../../_lib/types.ts";
import { requireVerifiedIdentity } from "../../_lib/auth.ts";
import { retryAfterHeader } from "../../_lib/http.ts";
import { checkRateLimit, RATE_LIMITS } from "../../_lib/ratelimit.ts";
import { asBrokerError, brokerErrorResponse, BrokerError, logBrokerFailure } from "./errors.ts";
import { brokerSetupState } from "./store.ts";

/**
 * Shared admission control for broker routes: verified identity, per-user rate
 * limit and (for data routes) a configured server-side store. The providers
 * listing deliberately skips the store check so it can explain what is
 * missing instead of failing with a bare `setup_required`.
 */

export type BrokerRateKey = keyof typeof RATE_LIMITS;

export type BrokerAccessResult =
  | { ok: true; uid: string }
  | { ok: false; response: Response };

export const requireBrokerIdentity = async (
  env: Env,
  request: Request,
  rate: BrokerRateKey,
): Promise<BrokerAccessResult> => {
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth;

  const rl = checkRateLimit(
    `${auth.identity.uid}:${rate}`,
    RATE_LIMITS[rate].limit,
    RATE_LIMITS[rate].windowMs,
  );
  if (!rl.allowed) {
    return {
      ok: false,
      response: brokerErrorResponse(env, request, new BrokerError("rate_limited"), retryAfterHeader(rl.resetInMs)),
    };
  }
  return { ok: true, uid: auth.identity.uid };
};

export const requireBrokerUser = async (
  env: Env,
  request: Request,
  rate: BrokerRateKey,
): Promise<BrokerAccessResult> => {
  const access = await requireBrokerIdentity(env, request, rate);
  if (!access.ok) return access;

  const setup = await brokerSetupState(env);
  if (!setup.ready) {
    throw new BrokerError("setup_required", `Missing configuration: ${setup.issues.join(", ")}`);
  }
  return access;
};

/** Wraps a route so every failure becomes the uniform safe error envelope. */
export const handleBrokerRoute = async (
  env: Env,
  request: Request,
  operation: string,
  work: () => Promise<Response>,
): Promise<Response> => {
  try {
    return await work();
  } catch (error) {
    const failure = asBrokerError(error);
    logBrokerFailure(operation, { code: failure.code });
    return brokerErrorResponse(env, request, failure);
  }
};

export const paramValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
