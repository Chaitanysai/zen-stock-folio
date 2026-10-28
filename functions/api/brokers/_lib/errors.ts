import type { BrokerErrorCode } from "../../../../src/lib/brokers/contracts.ts";
import { BROKER_ERROR_MESSAGES } from "../../../../src/lib/brokers/messages.ts";
import { errorResponse } from "../../_lib/http.ts";
import type { Env } from "../../_lib/types.ts";

/**
 * Safe broker errors.
 *
 * The `message` on a `BrokerError` is for internal diagnosis only; responses
 * always use the fixed public message for the code. Upstream response bodies,
 * tokens and secrets never reach the client or the logs.
 */
export class BrokerError extends Error {
  readonly code: BrokerErrorCode;

  constructor(code: BrokerErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BrokerError";
    this.code = code;
  }
}

const STATUS: Record<BrokerErrorCode, number> = {
  invalid_request: 400,
  unsupported_provider: 400,
  unsupported_method: 400,
  provider_disabled: 503,
  setup_required: 503,
  not_found: 404,
  state_invalid: 400,
  state_expired: 400,
  state_reused: 409,
  provider_error: 502,
  invalid_credentials: 401,
  authentication_expired: 401,
  permission_missing: 403,
  rate_limited: 429,
  provider_unavailable: 502,
  timeout: 504,
  unsupported_endpoint: 422,
  sync_in_progress: 409,
  connection_not_connected: 409,
  conflict: 409,
  internal_error: 500,
};

export const asBrokerError = (caught: unknown): BrokerError => {
  if (caught instanceof BrokerError) return caught;
  return new BrokerError("internal_error");
};

export const brokerErrorResponse = (
  env: Env,
  request: Request,
  caught: unknown,
  extraHeaders: Record<string, string> = {},
): Response => {
  const err = asBrokerError(caught);
  const status = STATUS[err.code] ?? 500;
  return errorResponse(
    env,
    request,
    status,
    BROKER_ERROR_MESSAGES[err.code],
    {
      "X-Correlation-Id": crypto.randomUUID(),
      ...extraHeaders,
    },
    err.code,
  );
};

/** Logs only non-sensitive identifiers, never request bodies or upstream text. */
export const logBrokerFailure = (
  operation: string,
  context: { code: BrokerErrorCode; provider?: string; connectionId?: string; uid?: string },
): void => {
  console.error(`[brokers] ${operation} failed`, context);
};
