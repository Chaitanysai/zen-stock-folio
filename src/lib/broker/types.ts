/**
 * Broker sync DTOs shared by the Pages Function (server) and the browser
 * client. No DOM, no `@` imports: Functions bundle this file directly.
 */

export type BrokerProvider = "indmoney";

export interface NormalizedHolding {
  /** INDstocks supports NSE/BSE only; BSE rows are unmatched, never mapped. */
  market: "NSE";
  ticker: string;
  isin: string | null;
  quantity: number;
  /** Broker-reported average cost per share, in INR. */
  averagePrice: number;
  lastPrice: number | null;
  brokerRef: string;
}

export interface NormalizedFill {
  /** Canonical ledger id: `indmoney:<tradeId>` or `indmoney:hash:<sha256>`. */
  id: string;
  market: "NSE";
  ticker: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  /** ISO-8601 UTC. */
  executedAt: string;
  currency: "INR";
}

export interface UnmatchedHolding {
  ticker: string;
  brokerRef: string;
  reason: "unsupported-exchange" | "no-executions" | "invalid-row";
  detail: string;
}

export interface SyncConflict {
  code: "manual-position" | "empty-derivation" | "notes" | "limit";
  ticker?: string;
  detail: string;
}

export interface HoldingChange {
  ticker: string;
  before: { quantity: number; averagePrice: number } | null;
  after: { quantity: number; averagePrice: number } | null;
}

export interface PreviewResult {
  mode: "preview";
  provider: BrokerProvider;
  generatedAt: string;
  holdingsSeen: number;
  executionsSeen: number;
  openPositions: HoldingChange[];
  closedPositions: HoldingChange[];
  executionsAdded: number;
  /** Rows that already match the broker/ledger, across open and closed. */
  unchangedPositions: number;
  unmatched: UnmatchedHolding[];
  conflicts: SyncConflict[];
  warnings: string[];
  /** Firestore updateTime this preview was computed against; null = create. */
  snapshotUpdateTime: string | null;
  /** Applying would remove every synced position; the route demands `confirmEmpty`. */
  requiresEmptyConfirmation: boolean;
}

export interface ApplyResult {
  mode: "apply";
  provider: BrokerProvider;
  appliedAt: string;
  openPositions: number;
  closedPositions: number;
  executions: number;
  snapshotUpdateTime: string;
}

/** What the link route returns and the browser stores in the private doc. */
export interface BrokerConnectionPayload {
  ciphertext: string;
  iv: string;
  keyVersion: number;
  expiresAt: string;
}

/** Browser-side view of the sealed connection document. */
export interface BrokerConnection extends BrokerConnectionPayload {
  provider: BrokerProvider;
  /** Last successful apply, or null before the first one. */
  syncedAt: string | null;
}

export interface PreviewSyncRequest {
  mode: "preview";
  ciphertext: string;
  iv: string;
  keyVersion: number;
}

export interface ApplySyncRequest {
  mode: "apply";
  ciphertext: string;
  iv: string;
  keyVersion: number;
  /** null means "create only": the route refuses if the document exists. */
  baseUpdateTime: string | null;
  /** Required when the preview reports `requiresEmptyConfirmation`. */
  confirmEmpty?: boolean;
}

export type BrokerSyncRequest = PreviewSyncRequest | ApplySyncRequest;
