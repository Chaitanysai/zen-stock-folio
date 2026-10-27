/**
 * Yahoo Finance adapter.
 *
 * Verified against the live endpoint on 2026-10-27 (see
 * docs/api-integration/MARKET-DATA-PROVIDER-CAPABILITY-COMPARISON.md):
 *   GET /v8/finance/chart/RELIANCE.NS?range=1d&interval=5m → 200
 *   meta.regularMarketPrice 1201.8, previousClose 1190, regularMarketTime 1793008688
 *   timestamp[] length 75, indicators.quote[0].volume present
 *   NO access-control-allow-origin header → server-side only
 *   A request without a browser User-Agent returned 429 on one attempt.
 *
 * Consequences encoded here:
 *  - A browser-like `User-Agent` is always sent.
 *  - Every call is bounded by an AbortSignal.
 *  - Nothing is invented: a missing array yields a warning + `null` fields.
 */

import type { Candle, CandleRange, CandleResolution, Quote } from "./types.ts";
import { RANGE_PRESETS } from "./freshness.ts";
import { fromYahooSymbol, toYahooSymbol } from "./symbols.ts";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const SEARCH_BASE = "https://query1.finance.yahoo.com/v1/finance/search";

/**
 * Yahoo rate-limits and occasionally 429s requests that look like bots.
 * The exact string matters less than being plausible and stable.
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class ProviderHttpError extends Error {
  readonly provider: string;
  readonly status: number;

  constructor(provider: string, status: number, message: string) {
    super(message);
    this.name = "ProviderHttpError";
    this.provider = provider;
    this.status = status;
  }
}

interface YahooMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  regularMarketTime?: number;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  longName?: string;
  shortName?: string;
  exchangeTimezoneName?: string;
  gmtoffset?: number;
  currentTradingPeriod?: {
    regular?: { start?: number; end?: number };
  };
}

interface YahooChartResult {
  meta?: YahooMeta;
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
}

interface YahooChartBody {
  chart?: {
    result?: YahooChartResult[] | null;
    error?: { code?: string; description?: string } | null;
  };
}

/** Only accept a finite, positive number; everything else is "not provided". */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

/**
 * Volume is never negative, but zero is a real observation (no trading in that
 * bar). A negative or non-finite volume is a provider fault and is reported as
 * unavailable.
 */
function nonNegative(value: unknown): number | null {
  const n = num(value);
  return n !== null && n >= 0 ? n : null;
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
    // Never let a shared cache serve another user's response.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ProviderHttpError("yahoo", response.status, `Yahoo responded ${response.status}`);
  }
  return response.json();
}

export interface YahooQuoteResult {
  quote: Quote;
  exchangeTimestampMs: number | null;
  unavailable: string[];
}

/** Map a chart response to our Quote contract. */
function toQuote(meta: YahooMeta, requestedSymbol: string): YahooQuoteResult {
  const name = meta.longName ?? meta.shortName ?? null;
  const price = positive(meta.regularMarketPrice);
  const previousClose = positive(meta.previousClose) ?? positive(meta.chartPreviousClose);

  // Derive change only when both inputs are real; never fabricate a zero.
  let change: number | null = null;
  let changePercent: number | null = null;
  if (price !== null && previousClose !== null) {
    change = price - previousClose;
    changePercent = (change / previousClose) * 100;
  } else if (num(meta.regularMarketChangePercent) !== null && price !== null) {
    // Fall back to the provider's own percentage, scaling to an absolute change.
    changePercent = meta.regularMarketChangePercent as number;
    change = (price * changePercent) / (100 + changePercent);
  }

  const unavailable: string[] = [];
  const track = (key: string, value: unknown) => {
    if (value === null) unavailable.push(key);
  };
  track("change", change);
  track("changePercent", changePercent);
  track("previousClose", previousClose);
  track("dayHigh", positive(meta.regularMarketDayHigh));
  track("dayLow", positive(meta.regularMarketDayLow));
  track("weekHigh52", positive(meta.fiftyTwoWeekHigh));
  track("weekLow52", positive(meta.fiftyTwoWeekLow));
  track("volume", nonNegative(meta.regularMarketVolume));
  track("name", name);
  if (price === null) unavailable.push("price");

  const symbol = fromYahooSymbol(meta.symbol ?? "") ?? requestedSymbol;

  return {
    quote: {
      symbol,
      price,
      change,
      changePercent,
      previousClose,
      dayHigh: positive(meta.regularMarketDayHigh),
      dayLow: positive(meta.regularMarketDayLow),
      weekHigh52: positive(meta.fiftyTwoWeekHigh),
      weekLow52: positive(meta.fiftyTwoWeekLow),
      volume: nonNegative(meta.regularMarketVolume),
      currency: meta.currency ?? null,
      exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
      name,
    },
    exchangeTimestampMs: positive(meta.regularMarketTime)
      ? (meta.regularMarketTime as number) * 1000
      : null,
    unavailable,
  };
}

/**
 * Fetch one quote. `target` is a bare NSE symbol (suffixed internally) or an
 * index symbol such as `^NSEI`.
 */
export async function fetchYahooQuote(
  target: string,
  timeoutMs = 5000,
): Promise<YahooQuoteResult> {
  const isIndex = target.startsWith("^");
  const yahooSymbol = isIndex ? target : toYahooSymbol(target);

  const url = `${CHART_BASE}/${encodeURIComponent(yahooSymbol)}?range=1d&interval=15m`;
  const body = (await getJson(url, timeoutMs)) as YahooChartBody;

  const error = body.chart?.error;
  if (error) {
    throw new ProviderHttpError("yahoo", 200, `Yahoo error: ${error.code ?? "unknown"}`);
  }
  const result = body.chart?.result?.[0];
  if (!result?.meta) {
    throw new ProviderHttpError("yahoo", 200, "Yahoo returned no chart result");
  }

  return toQuote(result.meta, target);
}

/** Fetch several quotes with bounded concurrency; per-symbol failures are isolated. */
export async function fetchYahooQuotes(
  targets: string[],
  options: { timeoutMs?: number; concurrency?: number } = {},
): Promise<Map<string, { ok: true; value: YahooQuoteResult } | { ok: false; error: string }>> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  const out = new Map<string, { ok: true; value: YahooQuoteResult } | { ok: false; error: string }>();

  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= targets.length) return;
      const target = targets[index];
      try {
        out.set(target, { ok: true, value: await fetchYahooQuote(target, timeoutMs) });
      } catch (error) {
        out.set(target, {
          ok: false,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return out;
}

export interface YahooCandlesResult {
  candles: Candle[];
  exchangeTimestampMs: number | null;
  unavailable: string[];
  warnings: string[];
  resolution: CandleResolution;
}

/**
 * Fetch OHLCV candles.
 *
 * Alignment rule: the four price arrays and the volume array are positional. A
 * row is kept only when open/high/low/close are all finite and positive, and
 * the timestamp is finite. Volume is optional per-row (null) — inventing 0
 * would misreport liquidity.
 */
export async function fetchYahooCandles(
  target: string,
  range: CandleRange,
  timeoutMs = 6000,
): Promise<YahooCandlesResult> {
  const preset = RANGE_PRESETS[range];
  const isIndex = target.startsWith("^");
  const yahooSymbol = isIndex ? target : toYahooSymbol(target);
  const url =
    `${CHART_BASE}/${encodeURIComponent(yahooSymbol)}` +
    `?range=${preset.yahooRange}&interval=${preset.yahooInterval}&includePrePost=false`;

  const body = (await getJson(url, timeoutMs)) as YahooChartBody;
  const error = body.chart?.error;
  if (error) {
    throw new ProviderHttpError("yahoo", 200, `Yahoo error: ${error.code ?? "unknown"}`);
  }
  const result = body.chart?.result?.[0];
  if (!result) throw new ProviderHttpError("yahoo", 200, "Yahoo returned no chart result");

  const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result.indicators?.quote?.[0];
  const warnings: string[] = [];
  const unavailable: string[] = [];

  if (timestamps.length === 0) {
    warnings.push("Provider returned no timestamps for this range.");
    return { candles: [], exchangeTimestampMs: null, unavailable, warnings, resolution: preset.resolution };
  }
  if (!quote) {
    warnings.push("Provider returned timestamps but no quote series.");
    return { candles: [], exchangeTimestampMs: null, unavailable, warnings, resolution: preset.resolution };
  }

  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  // Positional alignment is the only link between the price and volume arrays.
  // If the lengths differ, no index can be trusted, so the whole volume series
  // is dropped rather than paired with the wrong bar.
  const volumeAligned = volumes.length === timestamps.length;
  if (!volumeAligned) {
    unavailable.push("volume");
    warnings.push("Volume series length differs from timestamps; volume reported as unavailable.");
  }

  const candles: Candle[] = [];
  let droppedRows = 0;
  let lastTime = -Infinity;

  for (let i = 0; i < timestamps.length; i += 1) {
    const time = num(timestamps[i]);
    const open = positive(opens[i]);
    const high = positive(highs[i]);
    const low = positive(lows[i]);
    const close = positive(closes[i]);
    if (time === null || open === null || high === null || low === null || close === null) {
      droppedRows += 1;
      continue;
    }
    const seconds = Math.floor(time);
    // lightweight-charts requires strictly increasing, unique times.
    if (seconds <= lastTime) {
      droppedRows += 1;
      continue;
    }
    lastTime = seconds;
    const volumeRaw = volumeAligned ? nonNegative(volumes[i]) : null;
    candles.push({
      time: seconds,
      open,
      high,
      low,
      close,
      volume: volumeRaw === null ? null : volumeRaw,
    });
  }

  if (droppedRows > 0) {
    warnings.push(`${droppedRows} incomplete or out-of-order row(s) omitted.`);
  }

  const lastTimestamp = candles.length > 0 ? candles[candles.length - 1].time * 1000 : null;

  return {
    candles,
    // The last bar's open time is the honest "as of" for a candle series;
    // meta.regularMarketTime refers to the quote, not necessarily to the last bar.
    exchangeTimestampMs: lastTimestamp,
    unavailable,
    warnings,
    resolution: preset.resolution,
  };
}

export interface YahooSearchRow {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: string | null;
  sector: string | null;
}

/**
 * Yahoo symbol search.
 *
 * Verified pitfall: unfiltered results include non-Indian listings (`RS` on
 * `NYQ`), and `q=INFY` ranks the NYSE ADR above the NSE line. Callers must
 * therefore only accept `exchange === "NSI"`, which this function enforces.
 */
export async function fetchYahooSearch(
  query: string,
  timeoutMs = 5000,
): Promise<YahooSearchRow[]> {
  const url = `${SEARCH_BASE}?q=${encodeURIComponent(query)}&quotesCount=12&newsCount=0&listsCount=0`;
  const body = (await getJson(url, timeoutMs)) as {
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      longname?: string;
      exchange?: string;
      exchDisp?: string;
      quoteType?: string;
      sector?: string;
      industry?: string;
    }>;
  };

  const rows: YahooSearchRow[] = [];
  for (const item of body.quotes ?? []) {
    const symbol = item.symbol ?? "";
    // NSE equities only. `NSI` is Yahoo's exchange code for NSE.
    if (item.exchange !== "NSI" || !symbol.endsWith(".NS")) continue;
    const bare = symbol.slice(0, -3);
    if (!bare) continue;
    rows.push({
      symbol: bare,
      name: item.longname ?? item.shortname ?? bare,
      exchange: "NSE",
      quoteType: item.quoteType ?? null,
      sector: item.sector ?? item.industry ?? null,
    });
  }
  return rows;
}
