/**
 * One trading symbol's daily closes as a histogram.
 *
 * The chart mounts lazily: data is fetched as soon as the card renders (the
 * hook serialises requests across the page), but lightweight-charts is only
 * created once the card scrolls near the viewport, so a twenty-holding
 * dashboard does not build twenty canvases up front.
 */

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  createChart,
  HistogramSeries,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { Skeleton } from "@/components/ui/skeleton";
import { chartTimeAxisOptions } from "@/lib/charts/timeAxis";
import { buildCloseBars, closeBarBase } from "@/lib/charts/closeBars";
import { inr, signedPct } from "@/lib/dashboard/format";
import { describeProvenance } from "@/lib/market-data/freshness";
import type { CandleRange, Market } from "@/lib/market-data/types";
import { useCandleHistory } from "@/hooks/useCandleHistory";
import { chartThemeOptions, useChartColors } from "@/hooks/useChartTheme";

const RANGES = ["1mo", "3mo", "6mo", "1y"] as const satisfies readonly CandleRange[];
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export interface CloseBarCardProps {
  symbol: string;
  name: string;
  market?: Market;
}

export function CloseBarCard({ symbol, name, market = "NSE" }: CloseBarCardProps) {
  const [range, setRange] = useState<CandleRange>("1mo");
  const { status, envelope, retry } = useCandleHistory(symbol, range, market);
  const colors = useChartColors();
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  const candles = envelope?.candles ?? [];
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const changePct = last && previous && previous.close > 0
    ? ((last.close - previous.close) / previous.close) * 100
    : null;

  useEffect(() => {
    const host = hostRef.current;
    if (visible || !host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !visible || status !== "ready" || !envelope || envelope.candles.length === 0) return;

    const axis = chartTimeAxisOptions("1d");
    const themed = chartThemeOptions(colors);
    const chart = createChart(host, {
      width: host.clientWidth,
      height: 132,
      ...themed,
      layout: { ...themed.layout, background: { type: ColorType.Solid, color: "transparent" }, attributionLogo: false },
      grid: { horzLines: { color: colors.grid }, vertLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { ...axis.timeScale, borderVisible: false },
      localization: axis.localization,
      crosshair: {
        vertLine: { visible: true, labelVisible: false },
        horzLine: { visible: false },
      },
    });

    const series = chart.addSeries(HistogramSeries, {
      base: closeBarBase(envelope.candles),
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    series.setData(
      buildCloseBars(envelope.candles).map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.value,
        color: bar.up ? colors.up : colors.down,
      })),
    );

    const closes = new Map(envelope.candles.map((candle) => [candle.time, candle.close]));
    const tip = document.createElement("div");
    tip.className = "zf-chart-tooltip zf-closecard-tip";
    tip.style.display = "none";
    host.appendChild(tip);

    const onMove = (param: MouseEventParams) => {
      const close = param.time !== undefined ? closes.get(param.time as number) : undefined;
      if (close === undefined || !param.point) {
        tip.style.display = "none";
        return;
      }
      tip.textContent = `${DATE_FMT.format(new Date((param.time as number) * 1000))} · ₹${close.toFixed(2)}`;
      tip.style.display = "block";
      tip.style.left = `${Math.min(param.point.x + 12, Math.max(0, host.clientWidth - 150))}px`;
      tip.style.top = `${Math.max(2, Math.min(param.point.y - 30, 132 - 28))}px`;
    };
    chart.subscribeCrosshairMove(onMove);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => chart.applyOptions({ width: host.clientWidth }));
    observer.observe(host);

    return () => {
      observer.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      tip.remove();
      chart.remove();
    };
  }, [visible, status, envelope, colors]);

  return (
    <article className="zf-closecard" aria-labelledby={`zc-${symbol}`}>
      <header className="zf-closecard-head">
        <div>
          <p className="zf-closecard-symbol" id={`zc-${symbol}`}>{symbol}</p>
          <p className="zf-closecard-name">{name}</p>
        </div>
        <div className="zf-closecard-price">
          {last ? inr(last.close) : "—"}
          {changePct !== null && (
            <span className={`zf-closecard-move ${changePct >= 0 ? "up" : "down"}`}>
              {signedPct(changePct, 2)}
            </span>
          )}
        </div>
      </header>

      <div className="zf-closecard-ranges" role="group" aria-label={`${symbol} chart range`}>
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      <div className="zf-closecard-canvas">
        <div className="zf-closecard-plot" ref={hostRef} />
        {(!visible || status === "loading") && (
          <div className="zf-closecard-skel">
            <Skeleton height="100%" radius={12} />
          </div>
        )}
        {status === "error" && (
          <div className="zf-closecard-error" role="alert">
            <p>Chart unavailable</p>
            <button type="button" className="zf-link" onClick={retry}>Retry</button>
          </div>
        )}
        {status === "ready" && candles.length === 0 && (
          <p className="zf-closecard-empty">No daily closes for this range.</p>
        )}
      </div>

      {status === "ready" && envelope && (
        <p className="zf-closecard-meta">
          Daily close · {candles.length} sessions · {describeProvenance(envelope)}
        </p>
      )}
    </article>
  );
}
