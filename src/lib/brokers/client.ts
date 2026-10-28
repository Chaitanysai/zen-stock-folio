import { apiFetch } from "@/lib/api";
import type {
  BrokerAuthorizeRequest,
  BrokerAuthorizeResponse,
  BrokerConnectionPublic,
  BrokerConnectionsResponse,
  BrokerCreateRequest,
  BrokerCreateResponse,
  BrokerErrorCode,
  BrokerProvidersResponse,
  BrokerSyncResponse,
  BrokerSyncStatusResponse,
  BrokerTestResponse,
  BrokerUpdateRequest,
  BrokerUpdateResponse,
} from "./contracts";

/**
 * Browser client for the broker API.
 *
 * Secrets only ever travel in a POST body to this same origin and are cleared
 * from component state after submission. No broker value is written to
 * localStorage, the URL or analytics.
 */

export class BrokerApiError extends Error {
  readonly code: BrokerErrorCode | "network_error";
  readonly status: number;

  constructor(code: BrokerErrorCode | "network_error", message: string, status: number) {
    super(message);
    this.name = "BrokerApiError";
    this.code = code;
    this.status = status;
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    throw new BrokerApiError("network_error", "Could not reach the server.", 0);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const row = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const code = typeof row.code === "string" ? (row.code as BrokerErrorCode) : "internal_error";
    const message = typeof row.error === "string" ? row.error : "The broker request failed.";
    throw new BrokerApiError(code, message, response.status);
  }
  if (body === null) throw new BrokerApiError("internal_error", "The server returned an invalid response.", response.status);
  return body as T;
};

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const brokerApi = {
  providers: (): Promise<BrokerProvidersResponse> => request("/api/brokers/providers"),

  connections: (): Promise<BrokerConnectionsResponse> => request("/api/brokers/connections"),

  create: (body: BrokerCreateRequest): Promise<BrokerCreateResponse> =>
    request("/api/brokers/connections", json(body)),

  authorize: (body: BrokerAuthorizeRequest): Promise<BrokerAuthorizeResponse> =>
    request("/api/brokers/authorize", json(body)),

  update: (id: string, body: BrokerUpdateRequest): Promise<BrokerUpdateResponse> =>
    request(`/api/brokers/connections/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  disconnect: (id: string): Promise<{ connection: BrokerConnectionPublic }> =>
    request(`/api/brokers/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),

  test: (id: string): Promise<BrokerTestResponse> =>
    request(`/api/brokers/connections/${encodeURIComponent(id)}/test`, { method: "POST" }),

  sync: (id: string): Promise<BrokerSyncResponse> =>
    request(`/api/brokers/connections/${encodeURIComponent(id)}/sync`, { method: "POST" }),

  syncStatus: (id: string): Promise<BrokerSyncStatusResponse> =>
    request(`/api/brokers/connections/${encodeURIComponent(id)}/sync-status`),
};

/** True when the browser was sent back by the provider callback. */
export interface BrokerCallbackResult {
  status: "connected" | "error";
  provider: string;
  code: string | null;
  connectionId: string | null;
}

export const readBrokerCallback = (): BrokerCallbackResult | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const status = params.get("broker");
  if (status !== "connected" && status !== "error") return null;
  return {
    status,
    provider: params.get("provider") ?? "",
    code: params.get("code"),
    connectionId: params.get("connection"),
  };
};

/** Removes the callback parameters without adding a history entry. */
export const clearBrokerCallback = (): void => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of ["broker", "provider", "code", "connection"]) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};
