/**
 * Shared market-data contract.
 *
 * This module is deliberately isomorphic: it must work in the browser bundle
 * (`tsc -b`), in Vitest, and in the Node/Cloudflare server handlers, so it
 * contains types and pure functions only — no `process.env`, no `node:*`.
 *
 * Core honesty rule: a field that a provider did not send is `null`, never a
 * copy of some other field and never a computed stand-in. Every envelope
 * carries `provider`, `dataMode`, `exchangeTimestamp` and `unavailable` so a
 * consumer can label the data truthfully instead of guessing.
 */

export type ProviderId = "upstox" | "yahoo" | "twelvedata" | "cache";

/**
 * What the provider's contract says about the data, NOT what we hope it is.
 *
 * - `realtime`  — only when a verified realtime feed answered (Upstox + token).
 * - `delayed`   — a delayed feed during a live session (Yahoo's published
 *                 behaviour for NSE is ~15 min; we never claim better).
 * - `eod`       — the last value is a session close (market closed, or a
 *                 historical/daily series).
 * - `unknown`   — no provider timestamp, so freshness cannot be established.
 */
export type DataMode = "realtime" | "delayed" | "eod" | "unknown";

export type CandleResolution = "1m" | "5m" | "15m" | "1d";

export type CandleRange = "1d" | "5d" | "1mo" | "3mo" | "1y";

/** A single OHLCV bar. `time` is epoch **seconds** (UTC), as lightweight-charts expects. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** `null` when the provider omitted it (e.g. index series report 0/absent). */
  volume: number | null;
}

export interface Quote {
  /** Canonical NSE trading symbol, uppercase, no exchange suffix. */
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  volume: number | null;
  currency: string | null;
  exchange: string | null;
  /** Human-readable company name when the provider sent one. */
  name: string | null;
}

/**
 * Provenance wrapper shared by every market-data response.
 *
 * `fetchedAt`       — when *this server* issued the upstream request (or served cache).
 * `exchangeTimestamp` — the provider's own last-trade time, ISO 8601 with offset.
 *                       This is the only acceptable basis for a freshness label.
 */
export interface Provenance {
  provider: ProviderId;
  dataMode: DataMode;
  fetchedAt: string;
  exchangeTimestamp: string | null;
  /** True when the payload came from our cache rather than a live upstream call. */
  cached: boolean;
  /** Age of the cached payload in ms; 0 for a fresh upstream response. */
  cacheAgeMs: number;
  /** True when the observation is older than its mode allows. */
  stale: boolean;
  /** Names of fields the provider did not supply. Never silently defaulted. */
  unavailable: string[];
  warnings: string[];
}

export interface QuoteEnvelope extends Provenance {
  quote: Quote | null;
}

export interface QuotesResponse {
  quotes: Record<string, QuoteEnvelope>;
  fetchedAt: string;
  /** Provider mix actually used, e.g. { yahoo: 3, cache: 1 }. */
  providerCounts: Record<string, number>;
  /** Symbols nothing could be returned for. */
  missing: string[];
  notes: string[];
}

export interface CandlesEnvelope extends Provenance {
  symbol: string;
  resolution: CandleResolution;
  range: CandleRange;
  candles: Candle[];
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  /** Provider-native quote type, e.g. EQUITY / ETF / INDEX. */
  instrumentType: string | null;
  sector: string | null;
  /** ISIN when a provider supplied a real one; null when unavailable or a placeholder. */
  isin: string | null;
  provider: ProviderId;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  provider: ProviderId | "mixed";
  fetchedAt: string;
  notes: string[];
}

export interface IndexQuote {
  /** Display label, e.g. "NIFTY 50". */
  label: string;
  /** Provider symbol, e.g. "^NSEI". */
  providerSymbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  exchangeTimestamp: string | null;
}

export interface MarketOverviewResponse {
  indices: IndexQuote[];
  provider: ProviderId;
  dataMode: DataMode;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  warnings: string[];
}

export type IntegrationState =
  | "connected"      // configured and a request succeeded recently
  | "degraded"       // configured, last request failed
  | "unconfigured"   // required env vars are absent
  | "error";         // unexpected condition

export interface IntegrationHealth {
  id: string;
  label: string;
  /** What the integration powers, in one line. */
  purpose: string;
  state: IntegrationState;
  /** Env var NAMES only. Values are never returned. */
  requiredEnv: readonly string[];
  /** Env var names that are present. Booleans only — never the value. */
  configuredEnv: readonly string[];
  lastCheckedAt: string;
  /** Round-trip ms for the check, or null when no request was made. */
  latencyMs: number | null;
  /** Sanitized message; must never contain a secret or an upstream URL with a key. */
  detail: string;
  /** Extra facts, e.g. record counts. Never secrets. */
  facts: Record<string, string | number | boolean>;
}

export interface HealthResponse {
  generatedAt: string;
  integrations: IntegrationHealth[];
  /** Aggregate: worst state among "required" integrations. */
  summary: IntegrationState;
}
