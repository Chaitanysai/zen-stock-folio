/**
 * Candlestick chart backed by `GET /api/candles`.
 *
 * Previously each panel fetched Yahoo directly from the browser. That is
 * CORS-blocked from any origin other than Yahoo's own (verified 2026-10-27: no
 * `Access-Control-Allow-Origin` on `v8/finance/chart`), so the failure mode was
 * an opaque "Network error". Routing through our own endpoint also gives the
 * panel a provider timestamp it can label the chart with.
 *
 * The panel never invents a bar: when the server returns an empty series it
 * shows the server's own warning instead of a flat placeholder line.
 */

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, CandlesEnvelope, CandleRange } from "@/lib/market-data/types.ts";
import { describeProvenance } from "@/lib/market-data/freshness.ts";
import { fetchCandles, MarketDataApiError } from "@/lib/market-data/client.ts";

export interface MarketCandlestickProps {
  symbol: string;
  range: CandleRange;
  height?: number;
  /** Hide the provenance line when the parent already renders it. */
  showProvenance?: boolean;
}

type PanelState =
  | { kind: "loading" }
  | { kind: "ready"; envelope: CandlesEnvelope }
  | { kind: "empty"; message: string }
  | { kind: "error"; message: string; retryable: boolean };

/** This chart's own bar shape, ignoring the nullable volume we do not plot. */
function toBar(candle: Candle): CandlestickData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

/** Turn an API failure into copy a trader can act on. */
function describeFailure(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof MarketDataApiError) {
    switch (error.code) {
      case "symbol_not_found":
        return { message: "This symbol is not covered by any configured provider.", retryable: false };
      case "invalid_range":
        return { message: "That chart range is not supported.", retryable: false };
      case "network_error":
        return { message: "Can't reach the price service. Check your connection.", retryable: true };
      case "rate_limited":
        return { message: "Too many chart requests. Pause a moment, then retry.", retryable: true };
      default:
        return { message: error.message, retryable: true };
    }
  }
  return { message: "Chart data could not be loaded.", retryable: true };
}

export function MarketCandlestick({ symbol, range, height = 260, showProvenance = true }: MarketCandlestickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [state, setState] = useState<PanelState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Create the chart once per mount; data updates reuse the same series.
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        textColor: isDark ? "#94a3b8" : "#64748b",
        background: { type: ColorType.Solid, color: "transparent" },
      },
      grid: {
        vertLines: { color: isDark ? "#ffffff0d" : "#0000000d" },
        horzLines: { color: isDark ? "#ffffff0d" : "#0000000d" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: isDark ? "#ffffff14" : "#00000014" },
      timeScale: { borderColor: isDark ? "#ffffff14" : "#00000014", secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Load candles whenever the symbol, range, or retry counter changes.
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    void (async () => {
      try {
        const envelope = await fetchCandles(symbol, range, { signal: controller.signal });
        if (controller.signal.aborted) return;

        if (envelope.candles.length === 0) {
          setState({
            kind: "empty",
            message: envelope.warnings[0] ?? `No candles were returned for ${symbol} over ${range}.`,
          });
          return;
        }

        seriesRef.current?.setData(envelope.candles.map(toBar));
        chartRef.current?.timeScale().fitContent();
        setState({ kind: "ready", envelope });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        const failure = describeFailure(error);
        setState({ kind: "error", message: failure.message, retryable: failure.retryable });
      }
    })();

    return () => controller.abort();
  }, [symbol, range, attempt]);

  return (
    <div style={{ position: "relative", minHeight: height }}>
      {state.kind !== "ready" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            zIndex: 10,
            textAlign: "center",
          }}
        >
          {state.kind === "loading" && (
            <span style={{ fontSize: 11, color: "var(--tx-400)", fontFamily: "var(--ff-mono)" }}>Loading candles…</span>
          )}
          {(state.kind === "empty" || state.kind === "error") && (
            <>
              <span style={{ fontSize: 11, color: "var(--tx-400)", fontFamily: "var(--ff-mono)", maxWidth: 300 }}>
                {state.message}
              </span>
              {state.kind === "error" && state.retryable && (
                <button
                  onClick={() => setAttempt((n) => n + 1)}
                  style={{
                    fontSize: 10.5,
                    fontFamily: "var(--ff-mono)",
                    cursor: "pointer",
                    padding: "3px 10px",
                    borderRadius: 999,
                    background: "transparent",
                    color: "var(--accent)",
                    border: "1px solid var(--accent-bd)",
                  }}
                >
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          width: "100%",
          height,
          opacity: state.kind === "ready" ? 1 : 0,
          transition: "opacity .2s",
        }}
      />

      {showProvenance && state.kind === "ready" && (
        <div
          style={{
            marginTop: 6,
            fontSize: 10,
            fontFamily: "var(--ff-mono)",
            color: "var(--tx-400)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>{describeProvenance(state.envelope)}</span>
          <span>· {state.envelope.candles.length} bars @ {state.envelope.resolution}</span>
          {state.envelope.warnings.length > 0 && (
            <span title={state.envelope.warnings.join(" · ")} style={{ color: "var(--amber)" }}>
              · {state.envelope.warnings.length} warning{state.envelope.warnings.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default MarketCandlestick;
