/**
 * USD→INR lookup from Yahoo's `USDINR=X` chart endpoint.
 *
 * Server-side only: Yahoo sends no CORS header. The rate is never derived from
 * another pair and never defaulted; if the provider has no usable number this
 * throws, so the route can fail closed or serve a labelled cache entry.
 */

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * The pair stays literal in the path: `=` is a legal path sub-delimiter, and
 * percent-encoding it (`USDINR%3DX`) would make the requested pair unreadable
 * in logs and upstream-stub matching for no benefit.
 */
const USD_INR_SYMBOL = "USDINR=X";

export interface UsdInrObservation {
  rate: number;
  exchangeTimestampMs: number | null;
}

const finitePositive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export async function fetchUsdInr(timeoutMs = 6000): Promise<UsdInrObservation> {
  const url = `${CHART_BASE}/${USD_INR_SYMBOL}?range=1d&interval=15m`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new Error("FX provider did not respond");
  }
  if (!response.ok) throw new Error(`FX provider responded ${response.status}`);

  let body: {
    chart?: {
      result?: Array<{
        meta?: { regularMarketPrice?: number; regularMarketTime?: number };
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
      error?: { code?: string } | null;
    };
  };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    throw new Error("FX provider returned a non-JSON body");
  }
  if (body.chart?.error) throw new Error(`FX provider error: ${body.chart.error.code ?? "unknown"}`);

  const result = body.chart?.result?.[0];
  if (!result) throw new Error("FX provider returned no chart result");

  let rate = finitePositive(result.meta?.regularMarketPrice);
  let atMs = finitePositive(result.meta?.regularMarketTime)
    ? (result.meta!.regularMarketTime as number) * 1000
    : null;

  if (rate === null) {
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const timestamps = result.timestamp ?? [];
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const close = finitePositive(closes[index]);
      if (close !== null) {
        rate = close;
        atMs = finitePositive(timestamps[index]) ? (timestamps[index] as number) * 1000 : null;
        break;
      }
    }
  }

  if (rate === null) throw new Error("FX provider returned no USD/INR rate");
  return { rate, exchangeTimestampMs: atMs };
}
