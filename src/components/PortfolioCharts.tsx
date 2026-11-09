import { PortfolioStock, calcInvestedValue, hasKnownCost } from "@/data/sampleData";
import {
  BarChart, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useMarketStatus } from "@/hooks/useMarketStatus";
import { fetchCandles } from "@/lib/market-data/client";
import { RANGE_PRESETS } from "@/lib/market-data/freshness";
import { chartTimeAxisOptions } from "@/lib/charts/timeAxis";
import { isValidPrice, marketOf, positionKey, quoteFor } from "@/lib/portfolio/valuation";
import type { Instrument, Market } from "@/lib/market-data/types";
import { useEffect, useRef, useState } from "react";
import { candleThemeOptions, chartThemeOptions, readChartColors, useChartColors } from "@/hooks/useChartTheme";

const PALETTE = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="zf-chart-tooltip">
      {label && (
        <p className="text-[11px] text-muted-foreground mb-0.5 font-mono">{label}</p>
      )}
      <p className="text-sm font-mono font-semibold text-foreground">
        {payload[0]?.value === null || payload[0]?.value === undefined
          ? "—"
          : `₹${Number(payload[0].value).toLocaleString("en-IN")}`}
      </p>
    </div>
  );
};

// ── Candlestick Panel (lightweight-charts) ────────────────────────────────────
type CandleRange = "1d" | "5d" | "1mo";

interface CandlestickPanelProps {
  ticker: string;
  /** Listing to chart; the same ticker on NSE and on the NYSE are different series. */
  market: Market;
  range: CandleRange;
}

function CandlestickPanel({ ticker, market, range }: CandlestickPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  // The chart is created by an async import, so the data effect would otherwise
  // run before the series exists and never be retried.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const colors = useChartColors();
  const initialAxis = useRef(chartTimeAxisOptions(RANGE_PRESETS[range].resolution));

  // Re-theme in place when the theme class changes; data and zoom are kept.
  useEffect(() => {
    chartRef.current?.applyOptions(chartThemeOptions(colors));
    seriesRef.current?.applyOptions?.(candleThemeOptions(colors));
  }, [colors]);

  // Initialise chart once
  useEffect(() => {
    if (!containerRef.current) return;

    let chart: any;
    let observer: ResizeObserver | null = null;
    let isMounted = true;

    (async () => {
      try {
        // Dynamic import - using v5.1 API
        const { createChart, CandlestickSeries, ColorType } = await import("lightweight-charts");
        
        if (!isMounted) return;

        const initial = readChartColors();
        const themed = chartThemeOptions(initial);

        chart = createChart(containerRef.current!, {
          width: containerRef.current!.clientWidth,
          height: 280,
          ...themed,
          layout: { ...themed.layout, background: { type: ColorType.Solid, color: "transparent" } },
          crosshair: { mode: 1 },
          timeScale: {
            ...themed.timeScale,
            ...initialAxis.current.timeScale,
          },
          localization: initialAxis.current.localization,
          handleScroll: true,
          handleScale: true,
        });

        // Use the v5.1 API: addSeries(CandlestickSeries, options)
        const series = chart.addSeries(CandlestickSeries, candleThemeOptions(initial));

        if (isMounted) {
          chartRef.current = chart;
          seriesRef.current = series;
          setReady(true);

          // Resize observer
          observer = new ResizeObserver(() => {
            if (containerRef.current && chartRef.current) {
              chartRef.current.applyOptions({
                width: containerRef.current.clientWidth,
              });
            }
          });
          observer.observe(containerRef.current!);
        } else {
          chart.remove();
        }
      } catch (err: any) {
        console.error("Chart initialization error:", err);
        if (isMounted) {
          setError(`Failed to initialize chart: ${err?.message || 'Unknown error'}`);
          setLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      observer?.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch OHLC data whenever ticker, market or range changes
  useEffect(() => {
    if (!ready || !seriesRef.current) return;
    setLoading(true);
    setError(null);

    // Candles come from the API, never straight from a provider: a browser
    // request to the provider is CORS-blocked and would leak the symbol list.
    // The instrument carries the market, so a U.S. row charts its own listing.
    fetchCandles({ market, ticker }, range)
      .then((envelope) => {
        const candles = (envelope.candles ?? []).map(({ time, open, high, low, close }) => ({
          time,
          open,
          high,
          low,
          close,
        }));

        if (candles.length === 0) {
          setError("No candle data available for this range.");
          setLoading(false);
          return;
        }

        seriesRef.current?.setData(candles);
        chartRef.current?.applyOptions(chartTimeAxisOptions(envelope.resolution));
        chartRef.current?.timeScale().fitContent();
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to fetch chart data. Check your network.");
        setLoading(false);
      });
  }, [ready, ticker, market, range]);

  if (error) {
    return (
      <div
        style={{
          height: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <p className="text-xs text-muted-foreground text-center max-w-xs font-mono">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            background: "transparent",
          }}
        >
          <span className="text-xs text-muted-foreground font-mono animate-pulse">
            Loading candles…
          </span>
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height: 280 }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface PortfolioChartsProps {
  stocks: PortfolioStock[];
}

const PortfolioCharts = ({ stocks }: PortfolioChartsProps) => {
  const instruments: Instrument[] = stocks.map((s) => ({
    market: s.market ?? "NSE",
    ticker: s.ticker,
  }));
  const { prices } = useLivePrices(instruments);
  const market = useMarketStatus();

  const activeStocks = stocks.filter((s) => s.status === "Active");
  const chartStocks = activeStocks.length > 0 ? activeStocks : stocks;

  // The selection is a listing (`market:ticker`), not a ticker: `INFY` on NSE
  // and `INFY` on the NYSE are different series. When the selected row is gone,
  // the first remaining row is charted — never a guessed market for a deleted
  // ticker.
  const [selectedKey, setSelectedKey] = useState(
    chartStocks[0] ? positionKey(chartStocks[0]) : ""
  );
  const [candleRange, setCandleRange] = useState<CandleRange>("1d");

  const selectedStock =
    chartStocks.find((s) => positionKey(s) === selectedKey) ?? chartStocks[0] ?? null;
  const selectedKeyValue = selectedStock ? positionKey(selectedStock) : "";
  const selectedLabel = selectedStock
    ? `${selectedStock.ticker} (${marketOf(selectedStock)})`
    : null;

  // P&L per stock. Unknown cost means unknown P&L, never the full market value.
  const plData = stocks.map((s) => {
    const live = quoteFor(prices, s);
    const cmp = live?.price ?? s.cmp;
    const pl =
      isValidPrice(cmp) && hasKnownCost(s) ? (cmp - s.entryPrice) * s.quantity : null;
    return { name: s.ticker, pl };
  });
  const unpricedCount = plData.filter((entry) => entry.pl === null).length;

  // Allocation: fall back to market value for unknown-cost rows so the
  // position stays visible without inventing a cost.
  const allocationData = stocks.map((s) => {
    const live = quoteFor(prices, s);
    const cmp = live?.price ?? s.cmp;
    const value = calcInvestedValue(s) ?? (isValidPrice(cmp) ? cmp * s.quantity : 0);
    return { name: s.ticker, value };
  });
  const hasPnlChartData = plData.some(
    (entry) => entry.pl !== null && Number.isFinite(entry.pl) && entry.pl !== 0,
  );
  const hasAllocationChartData = allocationData.some(
    (entry) => Number.isFinite(entry.value) && entry.value !== 0,
  );

  const axisStyle = {
    fill: "hsl(var(--muted-foreground))",
    fontSize: 10,
    fontFamily: "'Geist Mono', monospace",
  };

  const RANGES: CandleRange[] = ["1d", "5d", "1mo"];
  const RANGE_LABELS: Record<CandleRange, string> = {
    "1d": "1 Day",
    "5d": "5 Days",
    "1mo": "1 Month",
  };

  return (
    <div className="flex flex-col gap-4">

      {/* ── Candlestick Chart — full width ── */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Candlestick{selectedLabel ? ` — ${selectedLabel}` : ""}
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Real-time OHLC · Yahoo Finance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Ticker selector */}
            <select
              aria-label="Chart ticker"
              value={selectedKeyValue}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="h-9 rounded-lg border border-border bg-secondary px-3 text-xs font-medium font-mono text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            >
              {chartStocks.map((s) => (
                <option key={positionKey(s)} value={positionKey(s)}>
                  {s.ticker} ({marketOf(s)})
                </option>
              ))}
            </select>

            {/* Range pills */}
            <div className="flex gap-1 rounded-lg bg-secondary/60 p-1" role="group" aria-label="Chart range">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={candleRange === r}
                  onClick={() => setCandleRange(r)}
                  className={`min-h-7 rounded-md px-2.5 py-1 text-[10px] font-mono transition-colors ${
                    candleRange === r
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>

            {/* Market status badge — shared market-status service, not API state */}
            <span
              title={market.description}
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                market.isOpen
                  ? "bg-profit/10 text-profit border-profit/20"
                  : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {market.label}
            </span>
          </div>
        </div>

        {selectedStock ? (
          <CandlestickPanel
            key={`${selectedKeyValue}-${candleRange}`}
            ticker={selectedStock.ticker}
            market={marketOf(selectedStock)}
            range={candleRange}
          />
        ) : (
          <div className="flex h-[280px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Add stocks to your portfolio to view the candlestick chart.
          </div>
        )}
      </div>

      {/* ── Bottom row: P&L bar + Allocation donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* P&L Bar Chart */}
        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">P&L per Stock</h3>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Live unrealized
              </p>
              {unpricedCount > 0 && (
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {unpricedCount} position{unpricedCount === 1 ? "" : "s"} without a market price or cost basis {unpricedCount === 1 ? "is" : "are"} excluded from this chart.
                </p>
              )}
            </div>
          </div>
          {hasPnlChartData ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={plData} barSize={16}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border) / 0.55)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pl" radius={[4, 4, 0, 0]}>
                  {plData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.pl === null ? "hsl(var(--muted-foreground) / 0.35)" : entry.pl >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="zf-empty-state zf-chart-empty">
              <span className="zf-empty-icon" aria-hidden="true"><BarChart3 /></span>
              <p className="zf-empty-title">No P&amp;L movement to chart</p>
              <p className="zf-empty-body">
                A non-zero unrealized result appears once market prices and cost basis are available.
              </p>
            </div>
          )}
        </div>

        {/* Allocation Donut */}
        <div className="glass-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Allocation</h3>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                By invested value
              </p>
            </div>
          </div>

          {hasAllocationChartData ? (
            <div className="flex flex-col items-center gap-5 min-[420px]:flex-row">
              <ResponsiveContainer width={130} height={130}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={58}
                    innerRadius={32}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {allocationData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              <div className="flex flex-col gap-2 flex-1 min-w-0">
                {allocationData.slice(0, 7).map((item, i) => {
                  const total = allocationData.reduce((s, d) => s + d.value, 0);
                  const pct =
                    total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                  return (
                    <div
                      key={item.name}
                      className="flex items-center gap-2 min-w-0"
                    >
                      <div
                        className="w-2 h-2 rounded-sm flex-shrink-0"
                        style={{ background: PALETTE[i % PALETTE.length] }}
                      />
                      <span className="text-[11px] text-muted-foreground font-mono truncate flex-1">
                        {item.name}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-foreground flex-shrink-0">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="zf-empty-state zf-chart-empty">
              <span className="zf-empty-icon" aria-hidden="true"><PieChartIcon /></span>
              <p className="zf-empty-title">No allocation value to chart</p>
              <p className="zf-empty-body">
                Allocation appears once a position has a known cost or usable market value.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioCharts;
