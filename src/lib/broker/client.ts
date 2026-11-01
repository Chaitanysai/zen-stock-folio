import { apiFetch } from "../api";
import type {
  ApplyResult,
  ApplySyncRequest,
  BrokerConnectionPayload,
  BrokerSyncRequest,
  PreviewResult,
  PreviewSyncRequest,
} from "./types";

/**
 * Browser client for the broker routes. `apiFetch` attaches the Firebase ID
 * token; the sealed material travels in the body, never in a URL.
 */

const LINK_PATH = "/api/broker/indmoney/link";
const SYNC_PATH = "/api/broker/indmoney/sync";
const MAX_TOKEN_CHARS = 4096;
const MAX_CIPHERTEXT_CHARS = 8192;
const MAX_IV_CHARS = 64;

const INVALID_RESPONSE_MESSAGE = "The sync service returned an unreadable response. Try again.";

export class BrokerApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BrokerApiError";
    this.status = status;
    this.code = code;
  }
}

const FALLBACK_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: "The broker token expired. Generate a new one and link the account again.",
  BAD_CIPHERTEXT: "The saved broker token is unreadable. Link the account again.",
  BROKER_DISABLED: "Broker sync is not configured on this deployment.",
  BROKER_UNAVAILABLE: "The broker is temporarily unavailable. Try again later.",
  BROKER_CONTRACT: "The broker returned an unexpected response. Nothing was changed.",
  RATE_LIMITED: "Too many broker requests. Try again later.",
  SNAPSHOT_CHANGED: "The portfolio changed since the preview. Run the preview again.",
  SNAPSHOT_UNAVAILABLE: "The portfolio could not be read. Nothing was changed.",
  SNAPSHOT_WRITE_FAILED: "The portfolio could not be written. Nothing was changed.",
  SNAPSHOT_LIMIT_EXCEEDED: "This sync would exceed a storage limit. Nothing was changed.",
  EMPTY_HOLDINGS_CONFIRMATION_REQUIRED:
    "The broker returned no holdings. Confirm to remove the synced positions.",
  MISSING_BASE_UPDATE_TIME: "The preview is incomplete. Run the preview again.",
  INVALID_REQUEST: "The sync request was rejected. Run the preview again.",
  NETWORK: "Could not reach the sync service. Check your connection and try again.",
  INVALID_RESPONSE: INVALID_RESPONSE_MESSAGE,
};

export const brokerErrorMessage = (error: unknown): string => {
  if (error instanceof BrokerApiError) {
    return FALLBACK_MESSAGES[error.code] ?? error.message;
  }
  return "Broker sync failed. Please try again.";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

const isSealedPayload = (value: unknown): value is BrokerConnectionPayload => {
  if (!isRecord(value)) return false;
  const { ciphertext, iv, keyVersion, expiresAt } = value;
  return (
    typeof ciphertext === "string" &&
    ciphertext.length > 0 &&
    ciphertext.length <= MAX_CIPHERTEXT_CHARS &&
    typeof iv === "string" &&
    iv.length > 0 &&
    iv.length <= MAX_IV_CHARS &&
    keyVersion === 1 &&
    isTimestamp(expiresAt)
  );
};

const isSyncResult = (
  value: unknown,
  mode: BrokerSyncRequest["mode"],
): value is PreviewResult | ApplyResult => {
  if (!isRecord(value) || value.mode !== mode) return false;
  const { snapshotUpdateTime } = value;

  if (mode === "preview") {
    // A preview computed against an absent snapshot reports null.
    if (snapshotUpdateTime !== null && !isTimestamp(snapshotUpdateTime)) return false;
    return ["openPositions", "closedPositions", "unmatched", "conflicts", "warnings"].every(
      (key) => Array.isArray(value[key]),
    );
  }

  // An applied snapshot must name the updateTime it wrote.
  if (!isTimestamp(snapshotUpdateTime)) return false;
  return typeof value.appliedAt === "string";
};

const parseError = async (response: Response): Promise<BrokerApiError> => {
  let message = `Broker sync failed (HTTP ${response.status}).`;
  let code = "UNKNOWN";

  try {
    const body = await response.json() as { error?: unknown; code?: unknown };
    if (typeof body.error === "string" && body.error) message = body.error;
    if (typeof body.code === "string" && body.code) code = body.code;
  } catch {
    // Non-JSON error body: keep the status-based message.
  }

  return new BrokerApiError(response.status, code, message);
};

interface ParsedResponse {
  status: number;
  data: unknown;
}

const postJson = async (path: string, body: unknown): Promise<ParsedResponse> => {
  let response: Response;
  try {
    response = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BrokerApiError(0, "NETWORK", "Could not reach the sync service.");
  }

  if (!response.ok) throw await parseError(response);

  try {
    return { status: response.status, data: await response.json() };
  } catch {
    throw new BrokerApiError(response.status, "INVALID_RESPONSE", INVALID_RESPONSE_MESSAGE);
  }
};

export const linkBrokerToken = async (token: string): Promise<BrokerConnectionPayload> => {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > MAX_TOKEN_CHARS) {
    throw new BrokerApiError(400, "INVALID_TOKEN", "Paste a valid broker API token.");
  }

  const { data } = await postJson(LINK_PATH, { token: trimmed });
  if (!isSealedPayload(data)) {
    throw new BrokerApiError(200, "INVALID_RESPONSE", INVALID_RESPONSE_MESSAGE);
  }
  return data;
};

export async function runBrokerSync(request: PreviewSyncRequest): Promise<PreviewResult>;
export async function runBrokerSync(request: ApplySyncRequest): Promise<ApplyResult>;
export async function runBrokerSync(
  request: BrokerSyncRequest,
): Promise<PreviewResult | ApplyResult> {
  const { status, data } = await postJson(SYNC_PATH, request);
  if (!isSyncResult(data, request.mode)) {
    throw new BrokerApiError(status, "INVALID_RESPONSE", INVALID_RESPONSE_MESSAGE);
  }
  return data;
}

export const isConnectionExpired = (
  connection: BrokerConnectionPayload,
  nowMs: number = Date.now(),
): boolean => {
  const expiresAt = Date.parse(connection.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= nowMs;
};
