/**
 * Broker connection contracts shared by the browser and Pages Functions.
 *
 * This module is intentionally dependency-free and secret-free. Anything that
 * needs an encryption key, a provider secret or KV access belongs in
 * `functions/api/brokers/_lib/`, never here.
 */

export const BROKER_PROVIDER_IDS = ["zerodha", "groww"] as const;
export type BrokerProviderId = (typeof BROKER_PROVIDER_IDS)[number];

export const BROKER_METHODS = ["oauth", "api_keys"] as const;
export type BrokerConnectionMethod = (typeof BROKER_METHODS)[number];

export const BROKER_CATEGORIES = ["holdings", "positions", "orders", "trades"] as const;
export type BrokerCategoryId = (typeof BROKER_CATEGORIES)[number];

export type BrokerConnectionStatus =
  | "pending_credentials"
  | "pending_authorization"
  | "connected"
  | "syncing"
  | "reauthorization_required"
  | "permission_required"
  | "temporarily_unavailable"
  | "error"
  | "disconnected";

export type BrokerSharedSupport =
  | "approved"
  | "approval_required"
  | "unavailable"
  | "not_applicable";

export type BrokerHistoryWindow =
  | "current_day"
  | "date_range"
  | "snapshot"
  | "unavailable";

export type BrokerCategoryStatus = "ok" | "empty" | "partial" | "unsupported" | "failed";

export type BrokerErrorCode =
  | "invalid_request"
  | "unsupported_provider"
  | "unsupported_method"
  | "provider_disabled"
  | "setup_required"
  | "not_found"
  | "state_invalid"
  | "state_expired"
  | "state_reused"
  | "provider_error"
  | "invalid_credentials"
  | "authentication_expired"
  | "permission_missing"
  | "rate_limited"
  | "provider_unavailable"
  | "timeout"
  | "unsupported_endpoint"
  | "sync_in_progress"
  | "connection_not_connected"
  | "conflict"
  | "internal_error";

// ── Provider capability description ──────────────────────────────────────────

export interface BrokerProviderCapabilities {
  id: BrokerProviderId;
  name: string;
  /** The provider product this integration uses, e.g. "Kite Connect". */
  authProduct: string;
  docsUrl: string;
  setupUrl: string;
  /** Methods this provider actually documents. */
  methods: { oauth: boolean; apiKeys: boolean };
  sharedMultiUser: BrokerSharedSupport;
  sharedMultiUserReason: string;
  data: Record<BrokerCategoryId, boolean>;
  history: Record<BrokerCategoryId, BrokerHistoryWindow>;
  historyNote: string;
  tokenLifetime: string;
  reauthNote: string;
  rateLimitNote: string;
  subscriptionNote: string;
  scheduledSync: boolean;
  /** Environment variable NAMES only. Never values. */
  requiredEnv: string[];
  limitations: string[];
}

export interface BrokerProviderPublic extends BrokerProviderCapabilities {
  enabled: boolean;
  unavailableReason: string | null;
  setupIssues: string[];
  /** URL the user must register with the provider, when the flow needs one. */
  callbackUrl: string;
}

// ── Normalized provider records ──────────────────────────────────────────────

export interface NormalizedHolding {
  /** ISIN when available, otherwise `EXCHANGE:TICKER`. */
  instrumentId: string;
  ticker: string;
  isin?: string;
  exchange?: string;
  currency: "INR";
  quantity: number;
  averagePrice: number;
  lastPrice?: number;
  asOf: string;
}

export interface NormalizedPosition {
  instrumentId: string;
  ticker: string;
  exchange?: string;
  segment: "CASH" | "FNO";
  product?: string;
  quantity: number;
  averagePrice: number;
  lastPrice?: number;
  realisedPnl?: number;
  asOf: string;
}

export interface NormalizedOrder {
  orderId: string;
  ticker: string;
  exchange?: string;
  segment?: string;
  product?: string;
  side: "BUY" | "SELL";
  quantity: number;
  filledQuantity: number;
  averagePrice?: number;
  status: string;
  placedAt?: string;
}

export interface NormalizedTrade {
  tradeId: string;
  orderId?: string;
  ticker: string;
  exchange?: string;
  segment?: string;
  product?: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fees?: number;
  tradedAt?: string;
}

/**
 * Provenance stored on a portfolio holding after a broker import. The `key`
 * is stable across syncs and is how a repeat import finds the same row.
 */
export interface BrokerStockProvenance {
  provider: BrokerProviderId;
  connectionId: string;
  key: string;
  instrumentId: string;
  isin?: string;
  exchange?: string;
  source: "holding";
  quantity: number;
  averagePrice: number;
  lastSyncedAt: string;
}

// ── Sync reporting ───────────────────────────────────────────────────────────

export interface BrokerCategoryResult {
  status: BrokerCategoryStatus;
  count: number;
  safeErrorCode: BrokerErrorCode | null;
  note: string | null;
}

export interface BrokerCoverage {
  /** Earliest and latest provider timestamps actually observed. */
  start: string | null;
  end: string | null;
  currentDayOnly: boolean;
  note: string;
  statementImportRecommended: boolean;
}

export interface BrokerSyncSummary {
  startedAt: string;
  finishedAt: string;
  status: "success" | "partial" | "failed";
  categories: Record<BrokerCategoryId, BrokerCategoryResult>;
  coverage: BrokerCoverage;
  counts: {
    fetched: number;
    new: number;
    updated: number;
    unchanged: number;
  };
  safeErrorCode: BrokerErrorCode | null;
}

export interface BrokerSyncRecords {
  holdings: NormalizedHolding[];
  positions: NormalizedPosition[];
  orders: NormalizedOrder[];
  trades: NormalizedTrade[];
}

export interface BrokerSyncResult extends BrokerSyncSummary {
  connectionId: string;
  provider: BrokerProviderId;
  records: BrokerSyncRecords;
}

// ── Public connection (never contains credentials) ───────────────────────────

export interface BrokerConnectionPublic {
  id: string;
  provider: BrokerProviderId;
  method: BrokerConnectionMethod;
  displayName: string;
  status: BrokerConnectionStatus;
  /** The read-only surface this integration uses. Providers do not report scopes. */
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  tokenExpiresAt: string | null;
  lastErrorCode: BrokerErrorCode | null;
  disconnectedAt: string | null;
  lastSync: BrokerSyncSummary | null;
}

// ── API request/response shapes ──────────────────────────────────────────────

export interface BrokerProvidersResponse {
  providers: BrokerProviderPublic[];
  storeReady: boolean;
  setupIssues: string[];
  callbackOrigin: string;
}

export interface BrokerConnectionsResponse {
  connections: BrokerConnectionPublic[];
  storeReady: boolean;
  setupIssues: string[];
}

export interface BrokerCreateRequest {
  provider: BrokerProviderId;
  method: BrokerConnectionMethod;
  apiKey: string;
  apiSecret: string;
  displayName?: string;
}

export type BrokerNextStep = "ready" | "pending" | "authorize";

export interface BrokerCreateResponse {
  connection: BrokerConnectionPublic;
  nextStep: BrokerNextStep;
  authorizationUrl?: string;
}

export interface BrokerAuthorizeRequest {
  connectionId: string;
}

export interface BrokerAuthorizeResponse {
  authorizationUrl: string;
  expiresAt: string;
  callbackUrl: string;
}

export interface BrokerUpdateRequest {
  displayName?: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface BrokerUpdateResponse {
  connection: BrokerConnectionPublic;
  nextStep: BrokerNextStep;
  authorizationUrl?: string;
}

export interface BrokerTestResponse {
  connection: BrokerConnectionPublic;
  checkedAt: string;
}

export interface BrokerSyncResponse {
  connection: BrokerConnectionPublic;
  report: BrokerSyncResult;
}

export interface BrokerSyncStatusResponse {
  connection: BrokerConnectionPublic;
  report: BrokerSyncSummary | null;
}

export interface BrokerErrorBody {
  error: string;
  code: BrokerErrorCode;
}

export const BROKER_READ_PERMISSIONS = [
  "read:holdings",
  "read:positions",
  "read:orders",
  "read:trades",
] as const;
