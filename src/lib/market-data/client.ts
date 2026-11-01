/**
 * Browser client for the market-data API.
 *
 * Deliberately separate from the `market-data/index.ts` barrel: this file uses
 * `fetch` and browser URL handling, while everything in the barrel must stay
 * isomorphic because the server handlers import it too.
 *
 * Every call maps a non-2xx reply to a `MarketDataApiError` carrying the
 * server's `code`, so a component can render "symbol not found" differently
 * from "provider unavailable" instead of showing one generic failure.
 */

import { apiFetch } from "@/lib/api.ts";
import type {
  CandleRange,
  CandlesEnvelope,
  FxRate,
  HealthResponse,
  Instrument,
  Market,
  MarketOverviewResponse,
  QuotesResponse,
  SearchResponse,
} from "./types.ts";

/** Server-declared failure. `status` is the HTTP status, `code` the app reason. */
export class MarketDataApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "MarketDataApiError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error?: unknown;
  code?: unknown;
}

async function failure(response: Response): Promise<MarketDataApiError> {
  let message = `HTTP ${response.status}`;
  let code = "request_failed";
  try {
    const body = (await response.json()) as ErrorBody;
    if (typeof body.error === "string" && body.error) message = body.error;
    if (typeof body.code === "string" && body.code) code = body.code;
  } catch {
    // Non-JSON error body — keep the status-derived message.
  }
  return new MarketDataApiError(message, response.status, code);
}

async function requestJson<T>(input: { path: string; init?: RequestInit }): Promise<T> {
  const init: RequestInit = { ...input.init };
  // Quotes/candles are freshness-sensitive: never reuse a browser-cached body.
  init.cache = "no-store";

  let response: Response;
  try {
    // apiFetch adds the Firebase bearer token; the Functions reject anonymous
    // calls, so a raw fetch here would always 401.
    response = await apiFetch(input.path, init);
  } catch (caught) {
    // A cancelled request is not a provider failure: callers abort on every
    // keystroke and on unmount, and treating that as an error would flash a
    // "Can't reach the price service" banner on every keypress.
    if (caught instanceof DOMException && caught.name === "AbortError") throw caught;
    throw new MarketDataApiError("Could not reach the price service.", 0, "network_error");
  }

  if (!response.ok) throw await failure(response);

  try {
    return (await response.json()) as T;
  } catch {
    throw new MarketDataApiError("The price service returned malformed data.", response.status, "invalid_response");
  }
}

/**
 * `POST /api/quotes`.
 *
 * Instruments (market + ticker), not bare symbols: `INFY` exists on both NSE
 * and the NYSE, so a ticker-only request cannot say which listing it means.
 * The reply is keyed `market:ticker` to match.
 *
 * POST (not GET) so the instrument list stays out of URLs, logs, and Referer
 * headers, and so the server can cap the list from a JSON array.
 */
export function fetchQuotes(
  instruments: Instrument[],
  options: { refresh?: boolean; signal?: AbortSignal } = {},
): Promise<QuotesResponse> {
  return requestJson<QuotesResponse>({
    path: "/api/quotes",
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruments, refresh: options.refresh ?? false }),
      signal: options.signal,
    },
  });
}

/**
 * `GET /api/candles` — OHLCV series plus the provenance needed to label it.
 *
 * Takes an `Instrument`, not a bare ticker: `AAPL` exists on both NSE and the
 * NYSE, and the server charts whichever listing the request names.
 */
export function fetchCandles(
  instrument: Instrument,
  range: CandleRange,
  options: { refresh?: boolean; signal?: AbortSignal } = {},
): Promise<CandlesEnvelope> {
  const query = new URLSearchParams({
    symbol: instrument.ticker,
    range,
    market: instrument.market,
  });
  if (options.refresh) query.set("refresh", "1");
  return requestJson<CandlesEnvelope>({
    path: `/api/candles?${query.toString()}`,
    init: { signal: options.signal },
  });
}

/** `GET /api/market` — index strip. */
export function fetchMarketOverview(
  options: { signal?: AbortSignal } = {},
): Promise<MarketOverviewResponse> {
  return requestJson<MarketOverviewResponse>({
    path: "/api/market",
    init: { signal: options.signal },
  });
}

/** `GET /api/search?q=&market=` — server-side symbol search; never query a provider from the browser. */
export function searchSymbols(
  query: string,
  options: { limit?: number; market?: Market; signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (options.limit) params.set("limit", String(options.limit));
  // The route defaults to NSE, but a caller that names a market must reach it.
  if (options.market) params.set("market", options.market);
  return requestJson<SearchResponse>({
    path: `/api/search?${params.toString()}`,
    init: { signal: options.signal },
  });
}

/**
 * `GET /api/health` — integration diagnostics.
 *
 * `deep` probes billable providers, so it is only ever requested on an explicit
 * user action and never from a timer.
 */
export function fetchHealth(options: { deep?: boolean; signal?: AbortSignal } = {}): Promise<HealthResponse> {
  return requestJson<HealthResponse>({
    path: options.deep ? "/api/health?deep=1" : "/api/health",
    init: { signal: options.signal },
  });
}

/**
 * `GET /api/fx` — the USD→INR rate the INR valuation needs.
 *
 * One call per dashboard refresh, shared by every U.S. row. `stale: true` marks
 * a cached rate served while the provider was down, or one whose observation
 * time the provider never supplied; `asOf` is passed through unchanged and is
 * null in the latter case. There is no numeric fallback here — an unavailable
 * rate arrives as an error, never as 0.
 */
export function fetchFxRate(options: { signal?: AbortSignal } = {}): Promise<FxRate> {
  return requestJson<FxRate>({
    path: "/api/fx?base=USD&quote=INR",
    init: { signal: options.signal },
  });
}
