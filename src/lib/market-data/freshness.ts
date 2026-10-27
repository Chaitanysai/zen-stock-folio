/**
 * Freshness and data-mode derivation.
 *
 * A freshness label must be derived from the provider's own last-trade
 * timestamp — never from the local clock and never from a successful HTTP
 * status. This module is the single place that decides "delayed vs eod vs
 * unknown", so no handler or component can invent its own answer.
 */

import type { CandleRange, CandleResolution, DataMode, Provenance, ProviderId } from "./types.ts";
import { getMarketStatus } from "../market/marketStatus.ts";

/**
 * How old a value may be before we call it stale, per mode.
 *
 * Yahoo's NSE quotes are ~15 min delayed; 30 min leaves headroom for a slow
 * poll without pretending that a 3-hour-old tick is current.
 */
export const STALE_AFTER_MS: Record<DataMode, number> = {
  realtime: 30_000,
  delayed: 30 * 60_000,
  eod: 30 * 60 * 60_000,
  unknown: 0,
};

/**
 * Derive the data mode from the provider's exchange timestamp and the exchange
 * clock.
 *
 * `realtimeProvider` is only true when a verified realtime feed answered
 * (Upstox with a valid token). Yahoo is never realtime for NSE.
 */
export function deriveDataMode(params: {
  exchangeTimestampMs: number | null;
  now: number;
  realtimeProvider: boolean;
}): DataMode {
  const { exchangeTimestampMs, now, realtimeProvider } = params;
  // No provider timestamp means no defensible freshness claim.
  if (exchangeTimestampMs === null || !Number.isFinite(exchangeTimestampMs)) return "unknown";
  if (exchangeTimestampMs > now + 5 * 60_000) {
    // A timestamp far in the future is a provider or clock fault, not freshness.
    return "unknown";
  }

  const market = getMarketStatus(new Date(now));
  if (market.phase === "unknown") return "unknown";

  if (realtimeProvider) {
    // Still only realtime while a session is actually running.
    return market.isOpen ? "realtime" : "eod";
  }

  if (!market.isOpen) {
    // Outside a session the last trade IS the close of the previous session.
    return "eod";
  }

  return "delayed";
}

export interface ProvenanceInput {
  provider: ProviderId;
  exchangeTimestampMs: number | null;
  now: number;
  cached: boolean;
  cacheAgeMs: number;
  unavailable?: string[];
  warnings?: string[];
  /** True only when a verified realtime-capable provider answered. */
  realtimeProvider?: boolean;
}

/** Build the provenance block attached to every market-data response. */
export function buildProvenance(input: ProvenanceInput): Provenance {
  const dataMode = deriveDataMode({
    exchangeTimestampMs: input.exchangeTimestampMs,
    now: input.now,
    realtimeProvider: input.realtimeProvider ?? false,
  });

  const age = input.exchangeTimestampMs === null ? null : input.now - input.exchangeTimestampMs;
  const threshold = STALE_AFTER_MS[dataMode];

  return {
    provider: input.provider,
    dataMode,
    fetchedAt: new Date(input.now).toISOString(),
    exchangeTimestamp:
      input.exchangeTimestampMs === null
        ? null
        : new Date(input.exchangeTimestampMs).toISOString(),
    cached: input.cached,
    cacheAgeMs: Math.max(0, input.cacheAgeMs),
    stale: age === null ? true : age > threshold,
    unavailable: input.unavailable ?? [],
    warnings: input.warnings ?? [],
  };
}

/** Short label a UI can render directly. */
export function dataModeLabel(mode: DataMode): string {
  switch (mode) {
    case "realtime":
      return "Live";
    case "delayed":
      return "Delayed";
    case "eod":
      return "EOD";
    case "unknown":
    default:
      return "Unverified";
  }
}

/**
 * Human text for a provenance block. Returns a claim the data actually
 * supports; when nothing is known it says so.
 */
/**
 * Render a provider exchange timestamp in IST.
 *
 * A raw ISO string is never shown to a user: it is UTC, it is not the format
 * anyone reads a market time in, and it hides whether the value is the current
 * session's. Falls back to the raw value only when it cannot be parsed.
 */
export function formatExchangeTimestamp(iso: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(stamp);
}

export function describeProvenance(p: Provenance): string {
  const mode = dataModeLabel(p.dataMode);
  if (p.exchangeTimestamp === null) {
    return `${mode} — provider did not report an exchange timestamp`;
  }
  const ist = formatExchangeTimestamp(p.exchangeTimestamp);
  const suffix = p.cached ? ` · cached ${formatAge(p.cacheAgeMs)}` : "";
  return `${mode} · as of ${ist} IST${suffix}`;
}

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s old`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m old`;
  return `${Math.round(ms / 3_600_000)}h old`;
}

/**
 * Cache TTL by mode. A live session may cache briefly; a closed one may cache
 * until the next session, because the value cannot change.
 */
export function cacheTtlMs(dataMode: DataMode): number {
  switch (dataMode) {
    case "realtime":
      return 5_000;
    case "delayed":
      return 60_000;
    case "eod":
      return 6 * 60 * 60_000;
    case "unknown":
    default:
      // Unknown data is never cached: we must retry to establish freshness.
      return 0;
  }
}

/** Allowed resolution for a range, and the provider range strings we map to. */
export const RANGE_PRESETS: Record<
  CandleRange,
  { resolution: CandleResolution; yahooRange: string; yahooInterval: string; maxAgeDays: number }
> = {
  "1d": { resolution: "5m", yahooRange: "1d", yahooInterval: "5m", maxAgeDays: 2 },
  "5d": { resolution: "15m", yahooRange: "5d", yahooInterval: "15m", maxAgeDays: 10 },
  "1mo": { resolution: "1d", yahooRange: "1mo", yahooInterval: "1d", maxAgeDays: 45 },
  "3mo": { resolution: "1d", yahooRange: "3mo", yahooInterval: "1d", maxAgeDays: 120 },
  "1y": { resolution: "1d", yahooRange: "1y", yahooInterval: "1d", maxAgeDays: 400 },
};

export function isCandleRange(value: unknown): value is CandleRange {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RANGE_PRESETS, value);
}
