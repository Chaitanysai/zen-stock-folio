/**
 * Upstox adapter.
 *
 * Verified against the live API on 2026-10-27:
 *   GET /v2/market-quote/quotes?instrument_key=NSE_EQ|INE002A01018
 *     - no token → 401 UDAPI100050 "Invalid token used to access API"
 *   GET /v2/historical-candle/NSE_EQ%7CINE002A01018/day/2026-01-01/2025-12-24
 *     - 200 with real candles, NO auth (undocumented; endpoint marked
 *       "Deprecated" in the docs) → reached only when explicitly enabled.
 *
 * Hard rules encoded here:
 *  1. Equity instrument keys are `NSE_EQ|<ISIN>` — a trading symbol is rejected
 *     by the API with UDAPI100011. Keys are resolved from the instrument master,
 *     never composed from a ticker.
 *  2. Every call is bounded and every response is checked for `status:"error"`.
 *  3. The auth-free historical path is opt-in only, because it is not licensed.
 */

import type { Candle, Quote } from "./types.ts";
import { ProviderHttpError } from "./yahoo.ts";

const API_BASE = "https://api.upstox.com/v2";

/** Upstox rejects requests without a plausible UA from some edges. */
const USER_AGENT = "zen-stock-folio/1.0 (+https://github.com/zen-stock-folio)";

export interface UpstoxCredentials {
  accessToken: string;
}

interface UpstoxErrorBody {
  status?: string;
  errors?: Array<{ errorCode?: string; message?: string }>;
}

function assertSuccess(status: number, body: unknown): void {
  const errorBody = body as UpstoxErrorBody;
  if (status >= 400 || errorBody?.status === "error") {
    const first = errorBody?.errors?.[0];
    throw new ProviderHttpError(
      "upstox",
      status,
      `Upstox ${status}: ${first?.errorCode ?? "unknown"}${first?.message ? ` — ${first.message}` : ""}`,
    );
  }
}

async function getJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProviderHttpError("upstox", response.status, "Upstox returned non-JSON");
    }
  }
  assertSuccess(response.status, body);
  return body;
}

interface UpstoxQuoteRow {
  last_price?: number;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
  volume?: number;
  change?: number;
  change_percent?: number;
  open_interest?: number;
  oi?: number;
  last_trade_time?: string;
  timestamp?: string;
}

export interface UpstoxQuoteResult {
  quote: Quote;
  exchangeTimestampMs: number | null;
  /** Open interest, present for derivatives and absent for cash equities. */
  openInterest: number | null;
  unavailable: string[];
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Fetch one equity quote.
 *
 * `instrumentKey` MUST come from the instrument master, e.g.
 * `NSE_EQ|INE002A01018`. `symbol` is what we label the result with.
 */
export async function fetchUpstoxQuote(
  instrumentKey: string,
  symbol: string,
  credentials: UpstoxCredentials,
  timeoutMs = 5000,
): Promise<UpstoxQuoteResult> {
  const url = `${API_BASE}/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`;
  const body = (await getJson(
    url,
    { Authorization: `Bearer ${credentials.accessToken}` },
    timeoutMs,
  )) as { data?: Record<string, UpstoxQuoteRow> };

  const data = body?.data;
  if (!data || typeof data !== "object") {
    throw new ProviderHttpError("upstox", 200, "Upstox returned no data object");
  }
  // Response keys use `:` as the segment separator even though the request uses `|`.
  const row = data[instrumentKey.replace("|", ":")] ?? Object.values(data)[0];
  if (!row) throw new ProviderHttpError("upstox", 200, "Upstox returned no row for instrument");

  const price = finite(row.last_price);
  if (price === null || price <= 0) {
    throw new ProviderHttpError("upstox", 200, "Upstox returned no usable last price");
  }

  return quoteFromRow(row, price, symbol);
}

/**
 * Map one provider row to our Quote contract.
 *
 * Single and batched requests share this so the two paths cannot describe the
 * same row differently. Fields the provider did not send are `null` and are
 * named in `unavailable`; nothing is derived from a different field.
 */
function quoteFromRow(row: UpstoxQuoteRow, price: number, symbol: string): UpstoxQuoteResult {
  const previousClose = finite(row.ohlc?.close);
  const unavailable: string[] = [];
  let change = finite(row.change);
  let changePercent = finite(row.change_percent);
  if (change === null && previousClose !== null) {
    change = price - previousClose;
    changePercent = (change / previousClose) * 100;
  }
  if (change === null) unavailable.push("change");
  if (changePercent === null) unavailable.push("changePercent");
  if (previousClose === null) unavailable.push("previousClose");
  // Upstox's market-quote payload is a live snapshot and does not include
  // 52-week extremes. Reporting them would require a second range call.
  unavailable.push("weekHigh52", "weekLow52", "name");

  const timestampRaw = row.last_trade_time ?? row.timestamp ?? null;
  const exchangeTimestampMs = timestampRaw ? Date.parse(timestampRaw) : null;

  return {
    quote: {
      symbol,
      price,
      change,
      changePercent,
      previousClose,
      dayHigh: finite(row.ohlc?.high),
      dayLow: finite(row.ohlc?.low),
      weekHigh52: null,
      weekLow52: null,
      volume: finite(row.volume),
      currency: "INR",
      exchange: "NSE",
      name: null,
    },
    exchangeTimestampMs:
      exchangeTimestampMs !== null && Number.isFinite(exchangeTimestampMs)
        ? exchangeTimestampMs
        : null,
    openInterest: finite(row.open_interest) ?? finite(row.oi),
    unavailable,
  };
}

export type UpstoxCandleUnit = "minutes" | "hours" | "days" | "weeks" | "months";

/**
 * Upstox documents a ceiling of 500 instrument keys per quote request.
 * Requesting more is not a smaller response — it is a rejected request that
 * consumes one of the account's rate-limited slots.
 */
export const UPSTOX_MAX_KEYS_PER_QUOTE = 500;

export interface UpstoxQuoteBatchResult {
  /** Instrument key as requested → its parsed row, for keys the API returned. */
  rows: Map<string, UpstoxQuoteResult>;
  /** Keys the API did not return a usable row for. */
  missing: string[];
}

/**
 * Fetch several instrument quotes in one call.
 *
 * Batched rather than looped so N contracts cost one rate-limited request
 * instead of N. `labelFor` names the result; unlabelled keys are labelled with
 * the key itself. The response is keyed with `:` separators, so both spellings
 * of each requested key are accepted when matching rows back.
 */
export async function fetchUpstoxQuotes(
  instrumentKeys: string[],
  credentials: UpstoxCredentials,
  options: { labelFor?: (key: string) => string; timeoutMs?: number } = {},
): Promise<UpstoxQuoteBatchResult> {
  const unique = [...new Set(instrumentKeys.filter(Boolean))];
  const rows = new Map<string, UpstoxQuoteResult>();
  const missing: string[] = [];
  if (unique.length === 0) return { rows, missing };

  if (unique.length > UPSTOX_MAX_KEYS_PER_QUOTE) {
    throw new ProviderHttpError(
      "upstox",
      0,
      `Upstox accepts at most ${UPSTOX_MAX_KEYS_PER_QUOTE} instrument keys per quote request`,
    );
  }

  const url = `${API_BASE}/market-quote/quotes?instrument_key=${encodeURIComponent(unique.join(","))}`;
  const body = (await getJson(
    url,
    { Authorization: `Bearer ${credentials.accessToken}` },
    options.timeoutMs ?? 8000,
  )) as { data?: Record<string, UpstoxQuoteRow> };

  const data = body?.data;
  if (!data || typeof data !== "object") {
    throw new ProviderHttpError("upstox", 200, "Upstox returned no data object");
  }

  for (const key of unique) {
    const row = data[key.replace("|", ":")] ?? data[key];
    if (!row) {
      missing.push(key);
      continue;
    }
    const price = finite(row.last_price);
    if (price === null || price <= 0) {
      missing.push(key);
      continue;
    }
    rows.set(key, quoteFromRow(row, price, options.labelFor?.(key) ?? key));
  }

  return { rows, missing };
}

export interface UpstoxCandlesResult {
  candles: Candle[];
  warnings: string[];
}

/**
 * Historical daily candles for one instrument.
 *
 * Only used when `allowUnexpensiveHistorical` is explicitly true, because the
 * observed auth-free behaviour is undocumented. Callers must pass a token
 * whenever they have one; the flag exists so an operator can decide knowingly.
 */
export async function fetchUpstoxHistoricalCandles(params: {
  instrumentKey: string;
  unit: UpstoxCandleUnit;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  credentials: UpstoxCredentials | null;
  allowUnauthenticated: boolean;
  timeoutMs?: number;
}): Promise<UpstoxCandlesResult> {
  const { instrumentKey, unit, fromDate, toDate, credentials, allowUnauthenticated } = params;
  if (!credentials && !allowUnauthenticated) {
    throw new ProviderHttpError(
      "upstox",
      0,
      "Upstox historical requires UPSTOX_ACCESS_TOKEN unless unauthenticated historical is explicitly enabled",
    );
  }

  const path =
    `${API_BASE}/historical-candle/${encodeURIComponent(instrumentKey)}` +
    `/${unit}/${encodeURIComponent(toDate)}/${encodeURIComponent(fromDate)}`;
  const headers: Record<string, string> = credentials
    ? { Authorization: `Bearer ${credentials.accessToken}` }
    : {};

  const body = (await getJson(path, headers, params.timeoutMs ?? 8000)) as {
    data?: { candles?: Array<Array<number | string>> };
  };

  const rows = body?.data?.candles;
  if (!Array.isArray(rows)) {
    throw new ProviderHttpError("upstox", 200, "Upstox returned no candle array");
  }

  // Rows are newest-first: [ts, open, high, low, close, volume, oi].
  const warnings: string[] = [];
  const candles: Candle[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) {
      dropped += 1;
      continue;
    }
    const time = typeof row[0] === "string" ? Date.parse(row[0]) : NaN;
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = row.length > 5 ? Number(row[5]) : NaN;
    if (
      !Number.isFinite(time) ||
      ![open, high, low, close].every((n) => Number.isFinite(n) && n > 0)
    ) {
      dropped += 1;
      continue;
    }
    candles.push({
      time: Math.floor(time / 1000),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : null,
    });
  }
  if (dropped > 0) warnings.push(`${dropped} unparseable candle row(s) omitted.`);

  candles.sort((a, b) => a.time - b.time);
  return { candles, warnings };
}
