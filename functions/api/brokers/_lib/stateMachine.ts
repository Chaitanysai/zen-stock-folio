import type { BrokerConnectionStatus, BrokerErrorCode } from "../../../../src/lib/brokers/contracts.ts";
import { BrokerError } from "./errors.ts";
import type { BrokerConnectionRecord } from "./store.ts";

/**
 * Legal connection transitions. `disconnected` is terminal; reconnecting
 * creates a new connection rather than reviving the old one.
 */
const TRANSITIONS: Record<BrokerConnectionStatus, BrokerConnectionStatus[]> = {
  pending_credentials: [
    "pending_authorization",
    "connected",
    "reauthorization_required",
    "temporarily_unavailable",
    "error",
    "disconnected",
  ],
  pending_authorization: [
    "connected",
    "pending_credentials",
    "reauthorization_required",
    "temporarily_unavailable",
    "error",
    "disconnected",
  ],
  connected: [
    "syncing",
    "reauthorization_required",
    "permission_required",
    "temporarily_unavailable",
    "error",
    "disconnected",
  ],
  syncing: [
    "connected",
    "reauthorization_required",
    "permission_required",
    "temporarily_unavailable",
    "error",
  ],
  reauthorization_required: [
    "pending_authorization",
    "connected",
    "temporarily_unavailable",
    "error",
    "disconnected",
  ],
  permission_required: [
    "connected",
    "syncing",
    "reauthorization_required",
    "temporarily_unavailable",
    "error",
    "disconnected",
  ],
  temporarily_unavailable: [
    "connected",
    "syncing",
    "reauthorization_required",
    "permission_required",
    "error",
    "disconnected",
  ],
  error: [
    "connected",
    "pending_credentials",
    "pending_authorization",
    "reauthorization_required",
    "syncing",
    "temporarily_unavailable",
    "disconnected",
  ],
  disconnected: [],
};

export const canTransition = (
  from: BrokerConnectionStatus,
  to: BrokerConnectionStatus,
): boolean => from === to || TRANSITIONS[from].includes(to);

export const withStatus = (
  record: BrokerConnectionRecord,
  to: BrokerConnectionStatus,
  now: Date = new Date(),
  patch: Partial<BrokerConnectionRecord> = {},
): BrokerConnectionRecord => {
  if (!canTransition(record.status, to)) {
    throw new BrokerError("conflict", `Illegal connection transition ${record.status} -> ${to}`);
  }
  return {
    ...record,
    ...patch,
    status: to,
    updatedAt: now.toISOString(),
    ...(to === "disconnected" ? { disconnectedAt: now.toISOString() } : {}),
  };
};

/** Maps a provider failure to the connection state the user must act on. */
export const statusForError = (code: BrokerErrorCode): BrokerConnectionStatus => {
  switch (code) {
    case "authentication_expired":
      return "reauthorization_required";
    case "permission_missing":
      return "permission_required";
    case "rate_limited":
    case "provider_unavailable":
    case "timeout":
      return "temporarily_unavailable";
    default:
      return "error";
  }
};
