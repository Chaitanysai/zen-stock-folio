import type {
  BrokerCategoryId,
  BrokerConnectionStatus,
  BrokerErrorCode,
} from "./contracts";

/** User-facing labels. Safe to import from both the browser and Functions. */

export const BROKER_STATUS_LABELS: Record<BrokerConnectionStatus, string> = {
  pending_credentials: "Credentials saved",
  pending_authorization: "Authorization pending",
  connected: "Connected",
  syncing: "Syncing",
  reauthorization_required: "Reauthorization required",
  permission_required: "Permission required",
  temporarily_unavailable: "Provider unavailable",
  error: "Connection error",
  disconnected: "Disconnected",
};

export const BROKER_ERROR_MESSAGES: Record<BrokerErrorCode, string> = {
  invalid_request: "The request was not valid.",
  unsupported_provider: "That broker is not supported.",
  unsupported_method: "That connection method is not available for this broker.",
  provider_disabled: "Broker connections are not enabled in this environment.",
  setup_required: "Broker connection storage is not configured on the server.",
  not_found: "Connection not found.",
  state_invalid: "The authorization request was not recognised.",
  state_expired: "The authorization request expired. Start again.",
  state_reused: "That authorization was already completed. Start again.",
  provider_error: "The broker reported an error.",
  invalid_credentials: "The broker did not accept those credentials.",
  authentication_expired: "The broker session expired. Reauthorize to continue.",
  permission_missing: "The credentials do not allow the requested read-only access.",
  rate_limited: "The broker rate limit was reached. Try again shortly.",
  provider_unavailable: "The broker is temporarily unavailable.",
  timeout: "The broker did not respond in time.",
  unsupported_endpoint: "The broker does not expose that data through its API.",
  sync_in_progress: "A sync is already running for this connection.",
  connection_not_connected: "Connect or reauthorize this broker before syncing.",
  conflict: "The connection changed while the request was running. Reload and retry.",
  internal_error: "The request could not be completed.",
};

export const BROKER_CATEGORY_LABELS: Record<BrokerCategoryId, string> = {
  holdings: "Holdings",
  positions: "Positions",
  orders: "Orders",
  trades: "Executed trades",
};

export const BROKER_METHOD_LABELS = {
  oauth: "Connect account",
  api_keys: "Use my API keys",
} as const;
