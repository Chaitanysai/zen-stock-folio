/**
 * Symbol normalization and validation.
 *
 * The app's persisted data uses bare NSE trading symbols ("RELIANCE"), while
 * every provider wants its own form ("RELIANCE.NS", "NSE_EQ|INE002A01018",
 * "^NSEI"). All conversion lives here so no handler invents its own.
 */

import type { Instrument, Market } from "./types.ts";

/** Providers use this shape for a bare NSE symbol. */
const NSE_SYMBOL_RE = /^[A-Z0-9][A-Z0-9&._-]{0,19}$/;

/** U.S. tickers allow class-share dots (`BRK.B`); leading digits are rejected. */
const US_SYMBOL_RE = /^[A-Z][A-Z0-9.]{0,9}$/;

/** A provider-suffixed form we accept on input and strip. */
const SUFFIXED_RE = /^([A-Z0-9][A-Z0-9&._-]{0,19})\.(NS|BO)$/;

export function isMarket(value: unknown): value is Market {
  return value === "NSE" || value === "US";
}

/**
 * Canonicalize a user-supplied ticker to a bare uppercase symbol for `market`.
 *
 * Returns `null` for anything that is not plausibly a symbol in that market, so
 * callers must handle rejection rather than passing junk upstream. Deliberately
 * strict: this is the input boundary for outbound HTTP.
 */
export function normalizeSymbol(raw: unknown, market: Market = "NSE"): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;

  if (market === "US") {
    // Yahoo encodes class shares with `-` (BRK-B); the canonical form is `BRK.B`.
    const canonical = trimmed.replace(/-/g, ".");
    return US_SYMBOL_RE.test(canonical) ? canonical : null;
  }

  const suffixed = SUFFIXED_RE.exec(trimmed);
  if (suffixed) {
    // Only NSE (.NS) is supported for quotes; BSE would need a separate feed.
    return suffixed[2] === "NS" ? suffixed[1] : null;
  }
  // Reject index symbols here — those go through `normalizeIndexSymbol`.
  if (trimmed.startsWith("^")) return null;
  return NSE_SYMBOL_RE.test(trimmed) ? trimmed : null;
}

/** Index symbols we expose, with the label a human should see. */
export const SUPPORTED_INDICES = [
  { label: "NIFTY 50", providerSymbol: "^NSEI" },
  { label: "SENSEX", providerSymbol: "^BSESN" },
  { label: "BANK NIFTY", providerSymbol: "^NSEBANK" },
] as const;

export type SupportedIndexSymbol = (typeof SUPPORTED_INDICES)[number]["providerSymbol"];

export function isSupportedIndexSymbol(value: string): value is SupportedIndexSymbol {
  return SUPPORTED_INDICES.some((i) => i.providerSymbol === value);
}

/** Yahoo needs `.NS` for NSE equities and bare (hyphenated) tickers for U.S. */
export function toYahooSymbol(ticker: string, market: Market = "NSE"): string {
  return market === "US" ? ticker.replace(/\./g, "-") : `${ticker}.NS`;
}

/** Recover a canonical ticker from a Yahoo symbol; `null` for a foreign NSE symbol. */
export function fromYahooSymbol(yahooSymbol: string, market: Market = "NSE"): string | null {
  if (market === "US") return yahooSymbol.toUpperCase().replace(/-/g, ".");
  if (!yahooSymbol.endsWith(".NS")) return null;
  return yahooSymbol.slice(0, -3);
}

/** Stable identity for caches, responses, and portfolio rows. */
export function instrumentKey(instrument: Instrument): string {
  return `${instrument.market}:${instrument.ticker}`;
}

/** Parse an untrusted `{ market, ticker }` value. `market` defaults to NSE. */
export function parseInstrument(raw: unknown): Instrument | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const market = record.market ?? "NSE";
  if (!isMarket(market)) return null;
  const ticker = normalizeSymbol(record.ticker, market);
  return ticker ? { market, ticker } : null;
}

export interface InstrumentListResult {
  instruments: Instrument[];
  rejected: string[];
  truncated: boolean;
}

/** Normalize, de-duplicate by `market:ticker`, and cap an untrusted list. */
export function normalizeInstrumentList(raw: unknown, max: number): InstrumentListResult {
  const rejected: string[] = [];
  const seen = new Map<string, Instrument>();
  let truncated = false;

  if (!Array.isArray(raw)) return { instruments: [], rejected, truncated };

  for (const entry of raw) {
    const instrument = parseInstrument(entry);
    if (!instrument) {
      const label = typeof entry === "string" ? entry.trim() : JSON.stringify(entry);
      if (label && label !== "{}" && label !== "null") rejected.push(label.slice(0, 32));
      continue;
    }
    const key = instrumentKey(instrument);
    if (seen.has(key)) continue;
    if (seen.size >= max) {
      truncated = true;
      continue;
    }
    seen.set(key, instrument);
  }

  return { instruments: [...seen.values()], rejected, truncated };
}

/** Normalize and de-duplicate a caller-supplied ticker list. */
export function normalizeSymbolList(
  raw: unknown,
  max: number,
): { symbols: string[]; rejected: string[]; truncated: boolean } {
  const rejected: string[] = [];
  const seen = new Set<string>();
  let truncated = false;

  if (!Array.isArray(raw)) return { symbols: [], rejected, truncated };

  for (const entry of raw) {
    const symbol = normalizeSymbol(entry);
    if (!symbol) {
      if (typeof entry === "string" && entry.trim()) rejected.push(entry.trim().slice(0, 32));
      continue;
    }
    if (seen.has(symbol)) continue;
    if (seen.size >= max) {
      truncated = true;
      continue;
    }
    seen.add(symbol);
  }

  return { symbols: [...seen], rejected, truncated };
}
