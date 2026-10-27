/**
 * Upstox instrument master — symbol ↔ ISIN ↔ instrument-key resolution.
 *
 * Why this exists: Upstox rejects a composed key. Verified 2026-10-27:
 *   `NSE_EQ|RELIANCE`            → UDAPI100011 Invalid Instrument key
 *   `NSE_EQ|INE002A01018`        → success
 *   F&O keys are opaque numeric tokens (`NSE_FO|125833`), never
 *   `NFO_OPT|SYM|DATE|STRIKE|CE`.
 *
 * Source: https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz
 * Verified 2026-10-27: 200, 2,039,412 B gz, 82,013 records
 *   (NSE_FO 40,846 / NSE_COM 22,391 / NCD_FO 8,788 / NSE_EQ 9,849 / NSE_INDEX 139).
 *
 * This module is pure: parsing and lookups only. Fetching and caching live in
 * `api/_lib/instruments.ts` so the logic stays testable without network access.
 */

import type { Candle } from "./types.ts";

export interface InstrumentRecord {
  segment: string;
  name?: string;
  exchange?: string;
  isin?: string;
  instrument_type?: string;
  instrument_key: string;
  lot_size?: number;
  tick_size?: number;
  freeze_quantity?: number;
  trading_symbol?: string;
  short_name?: string;
  underlying_symbol?: string;
  asset_symbol?: string;
  asset_key?: string;
  underlying_key?: string;
  asset_type?: string;
  underlying_type?: string;
  /** Epoch **milliseconds** for F&O contracts. */
  expiry?: number;
  strike_price?: number;
  weekly?: boolean;
}

export type OptionSide = "CE" | "PE";
export type FnoInstrumentType = "FUT" | OptionSide;

export interface InstrumentIndex {
  /** Uppercase trading symbol → NSE_EQ record. */
  equityBySymbol: Map<string, InstrumentRecord>;
  /** Trading symbol → lowercased name, for search and display. */
  equityNames: Map<string, string>;
  /** `${underlying}|${expiryMs}|FUT` → record. */
  futures: Map<string, InstrumentRecord>;
  /** `${underlying}|${expiryMs}|${strike}|${CE|PE}` → record. */
  options: Map<string, InstrumentRecord>;
  /** `${underlying}` → sorted distinct FUT expiries (ms). */
  futuresExpiries: Map<string, number[]>;
  /** Underlying symbol → set of option expiries (ms). */
  optionExpiries: Map<string, number[]>;
  counts: {
    total: number;
    equity: number;
    futures: number;
    options: number;
    skipped: number;
  };
  /** When the master file's bytes were produced, if known. */
  builtAt: string;
}

const SEGMENT_EQUITY = "NSE_EQ";
const SEGMENT_FNO = "NSE_FO";

/** Keep only the fields we use; the raw file carries ~30 keys per record. */
function slimRecord(raw: Record<string, unknown>): InstrumentRecord | null {
  const instrumentKey = typeof raw.instrument_key === "string" ? raw.instrument_key : "";
  const segment = typeof raw.segment === "string" ? raw.segment : "";
  if (!instrumentKey || !segment) return null;
  return {
    segment,
    instrument_key: instrumentKey,
    name: typeof raw.name === "string" ? raw.name : undefined,
    exchange: typeof raw.exchange === "string" ? raw.exchange : undefined,
    isin: typeof raw.isin === "string" ? raw.isin : undefined,
    instrument_type: typeof raw.instrument_type === "string" ? raw.instrument_type : undefined,
    trading_symbol: typeof raw.trading_symbol === "string" ? raw.trading_symbol : undefined,
    short_name: typeof raw.short_name === "string" ? raw.short_name : undefined,
    underlying_symbol: typeof raw.underlying_symbol === "string" ? raw.underlying_symbol : undefined,
    asset_symbol: typeof raw.asset_symbol === "string" ? raw.asset_symbol : undefined,
    asset_key: typeof raw.asset_key === "string" ? raw.asset_key : undefined,
    underlying_key: typeof raw.underlying_key === "string" ? raw.underlying_key : undefined,
    asset_type: typeof raw.asset_type === "string" ? raw.asset_type : undefined,
    underlying_type: typeof raw.underlying_type === "string" ? raw.underlying_type : undefined,
    lot_size: typeof raw.lot_size === "number" ? raw.lot_size : undefined,
    tick_size: typeof raw.tick_size === "number" ? raw.tick_size : undefined,
    freeze_quantity: typeof raw.freeze_quantity === "number" ? raw.freeze_quantity : undefined,
    expiry: typeof raw.expiry === "number" ? raw.expiry : undefined,
    strike_price: typeof raw.strike_price === "number" ? raw.strike_price : undefined,
    weekly: typeof raw.weekly === "boolean" ? raw.weekly : undefined,
  };
}

/** Build the lookup index from parsed records. */
export function buildInstrumentIndex(
  records: InstrumentRecord[],
  builtAt: string = new Date().toISOString(),
): InstrumentIndex {
  const equityBySymbol = new Map<string, InstrumentRecord>();
  const equityNames = new Map<string, string>();
  const futures = new Map<string, InstrumentRecord>();
  const options = new Map<string, InstrumentRecord>();
  const futuresExpiries = new Map<string, number[]>();
  const optionExpiries = new Map<string, number[]>();
  let equity = 0;
  let futureCount = 0;
  let optionCount = 0;
  let skipped = 0;

  for (const record of records) {
    if (record.segment === SEGMENT_EQUITY) {
      const symbol = (record.trading_symbol ?? "").trim().toUpperCase();
      if (!symbol) {
        skipped += 1;
        continue;
      }
      // EQ instruments only; ETF/BE series share the segment but are valid too,
      // so we keep everything that has a trading symbol.
      equityBySymbol.set(symbol, record);
      if (record.name) equityNames.set(symbol, record.name);
      equity += 1;
      continue;
    }

    if (record.segment === SEGMENT_FNO) {
      const underlying = (record.underlying_symbol ?? "").trim().toUpperCase();
      const expiry = record.expiry;
      const type = (record.instrument_type ?? "").toUpperCase();
      if (!underlying || typeof expiry !== "number" || !Number.isFinite(expiry)) {
        skipped += 1;
        continue;
      }
      if (type === "FUT") {
        futures.set(`${underlying}|${expiry}|FUT`, record);
        const list = futuresExpiries.get(underlying) ?? [];
        if (!list.includes(expiry)) list.push(expiry);
        futuresExpiries.set(underlying, list);
        futureCount += 1;
        continue;
      }
      if ((type === "CE" || type === "PE") && typeof record.strike_price === "number") {
        const strike = record.strike_price;
        options.set(`${underlying}|${expiry}|${strike}|${type}`, record);
        const list = optionExpiries.get(underlying) ?? [];
        if (!list.includes(expiry)) list.push(expiry);
        optionExpiries.set(underlying, list);
        optionCount += 1;
        continue;
      }
      skipped += 1;
    }
  }

  for (const list of futuresExpiries.values()) list.sort((a, b) => a - b);
  for (const list of optionExpiries.values()) list.sort((a, b) => a - b);

  return {
    equityBySymbol,
    equityNames,
    futures,
    options,
    futuresExpiries,
    optionExpiries,
    counts: { total: records.length, equity, futures: futureCount, options: optionCount, skipped },
    builtAt,
  };
}

/** Parse the raw JSON array from the master file. Tolerates junk records. */
export function parseInstrumentMaster(json: unknown): InstrumentRecord[] {
  if (!Array.isArray(json)) {
    throw new Error("Instrument master must be a JSON array");
  }
  const out: InstrumentRecord[] = [];
  for (const entry of json) {
    if (entry && typeof entry === "object") {
      const slim = slimRecord(entry as Record<string, unknown>);
      if (slim) out.push(slim);
    }
  }
  return out;
}

/** Empty index, used as an explicit "not available" value instead of throwing. */
export function emptyInstrumentIndex(reason: string): InstrumentIndex & { reason: string } {
  return {
    ...buildInstrumentIndex([], new Date(0).toISOString()),
    reason,
  };
}

/** Resolve an NSE equity trading symbol to its Upstox instrument key. */
export function resolveEquityKey(
  index: InstrumentIndex,
  symbol: string,
): { key: string; isin: string | null; name: string | null } | null {
  const record = index.equityBySymbol.get(symbol.trim().toUpperCase());
  if (!record) return null;
  return {
    key: record.instrument_key,
    isin: record.isin ?? null,
    name: record.name ?? record.short_name ?? null,
  };
}

export interface FnoResolution {
  key: string;
  tradingSymbol: string | null;
  lotSize: number | null;
  tickSize: number | null;
  expiryMs: number;
  strike: number | null;
  instrumentType: FnoInstrumentType;
}

/**
 * Resolve an F&O contract to its numeric Upstox instrument key.
 *
 * `expiry` accepts a number (epoch ms or ISO-parsed ms) or a date string. An
 * exact match is required — there is deliberately no "nearest expiry" fallback,
 * because silently pricing a different contract than the user holds is worse
 * than returning "not found".
 */
export function resolveFnoKey(
  index: InstrumentIndex,
  params: {
    underlying: string;
    instrumentType: FnoInstrumentType;
    expiryMs: number;
    strike?: number | null;
  },
): FnoResolution | null {
  const underlying = params.underlying.trim().toUpperCase();
  if (!Number.isFinite(params.expiryMs)) return null;

  // Expiry timestamps in the master are end-of-day epoch ms; callers often hold
  // a midnight date. Snap to the nearest master expiry within one day.
  const resolvedExpiry = snapExpiry(index, underlying, params.expiryMs);
  if (resolvedExpiry === null) return null;

  if (params.instrumentType === "FUT") {
    const record = index.futures.get(`${underlying}|${resolvedExpiry}|FUT`);
    if (!record) return null;
    return {
      key: record.instrument_key,
      tradingSymbol: record.trading_symbol ?? null,
      lotSize: record.lot_size ?? null,
      tickSize: record.tick_size ?? null,
      expiryMs: resolvedExpiry,
      strike: null,
      instrumentType: "FUT",
    };
  }

  if (typeof params.strike !== "number" || !Number.isFinite(params.strike)) return null;
  const record = index.options.get(
    `${underlying}|${resolvedExpiry}|${params.strike}|${params.instrumentType}`,
  );
  if (!record) return null;
  return {
    key: record.instrument_key,
    tradingSymbol: record.trading_symbol ?? null,
    lotSize: record.lot_size ?? null,
    tickSize: record.tick_size ?? null,
    expiryMs: resolvedExpiry,
    strike: params.strike,
    instrumentType: params.instrumentType,
  };
}

/** One day in ms — expiry timestamps land at 15:30 IST, dates at midnight. */
const EXPIRY_TOLERANCE_MS = 24 * 60 * 60 * 1000;

function snapExpiry(
  index: InstrumentIndex,
  underlying: string,
  target: number,
): number | null {
  const candidates = [
    ...(index.futuresExpiries.get(underlying) ?? []),
    ...(index.optionExpiries.get(underlying) ?? []),
  ];
  if (candidates.length === 0) return null;

  let best: number | null = null;
  let bestDelta = Infinity;
  for (const expiry of candidates) {
    const delta = Math.abs(expiry - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = expiry;
    }
  }
  return best !== null && bestDelta <= EXPIRY_TOLERANCE_MS ? best : null;
}

/**
 * NSE_EQ is not an equity list. The master puts every NSE-listed security that
 * is not an F&O contract into that segment: 2,717 `EQ` shares plus 483 `SM`
 * (SME board), 224 `BE`/42 `BZ` (trade-to-trade / surveillance), 4,352 `SG` +
 * 135 `GS` + ~2,300 `N*` (government securities, SDLs, NCDs), 44 `GB` (gold
 * bonds), 83 `TB` (T-bills) and 21 `IV`/6 `RR` (InvITs / REITs).
 *
 * Verified 2026-10-27 against the live master. Search therefore reports the
 * series the provider actually gave rather than stamping everything "EQUITY",
 * and ranks a real share ahead of a bond that happens to share a prefix.
 */
const EQUITY_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "SZ", "IT"]);

/** Human-readable instrument type for a record's series, or `null` if unknown. */
export function instrumentTypeFor(record: InstrumentRecord): string | null {
  const series = (record.instrument_type ?? "").trim().toUpperCase();
  if (!series) return null;
  if (EQUITY_SERIES.has(series)) return "EQUITY";
  if (series === "RR" || series === "IV") return "TRUST";
  if (series === "GB") return "GOLD_BOND";
  if (series === "TB") return "TBILL";
  return "DEBT";
}

export interface InstrumentSearchRow {
  symbol: string;
  name: string;
  isin: string | null;
  instrumentType: string | null;
}

/** Fuzzy symbol search over the master's equity segment. */
export function searchInstruments(
  index: InstrumentIndex,
  query: string,
  limit = 10,
): InstrumentSearchRow[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored: Array<InstrumentSearchRow & { score: number }> = [];

  for (const [symbol, record] of index.equityBySymbol) {
    const name = (record.name ?? "").toUpperCase();
    let score = -1;
    if (symbol === q) score = 100;
    else if (symbol.startsWith(q)) score = 80 - Math.min(symbol.length - q.length, 20);
    else if (name.startsWith(q)) score = 60;
    else if (name.includes(q)) score = 40;
    else if (symbol.includes(q)) score = 20;
    if (score < 0) continue;
    const instrumentType = instrumentTypeFor(record);
    // A bond or T-bill that merely shares a prefix should never outrank the
    // share a user is looking for.
    const penalty = instrumentType === "EQUITY" ? 0 : 15;
    scored.push({
      symbol,
      name: record.name ?? record.short_name ?? symbol,
      isin: record.isin ?? null,
      instrumentType,
      score: score - penalty,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  return scored.slice(0, limit).map(({ score: _score, ...rest }) => rest);
}

/**
 * Decode a gzip body using the platform `DecompressionStream`.
 *
 * Available as a global in Node 24 (verified) and in every current browser, and
 * it works inside Cloudflare Workers — unlike `node:zlib`. Kept here rather than
 * in the handler so the decode path is identical everywhere.
 */
export async function gunzipToBytes(body: ReadableStream<Uint8Array> | ArrayBuffer): Promise<Uint8Array> {
  const stream =
    body instanceof ArrayBuffer
      ? new Blob([body]).stream()
      : body;
  const decompressed = stream.pipeThrough(new DecompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = decompressed.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Convert an upstream candle array into our ascending, validated series. */
export function normalizeCandleSeries(
  rows: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number | null }>,
): Candle[] {
  const out: Candle[] = [];
  let lastTime = -Infinity;
  for (const row of rows) {
    if (
      !Number.isFinite(row.time) ||
      ![row.open, row.high, row.low, row.close].every((n) => Number.isFinite(n) && n > 0)
    ) {
      continue;
    }
    if (row.time <= lastTime) continue;
    lastTime = row.time;
    out.push({
      time: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: typeof row.volume === "number" && Number.isFinite(row.volume) ? row.volume : null,
    });
  }
  return out;
}
