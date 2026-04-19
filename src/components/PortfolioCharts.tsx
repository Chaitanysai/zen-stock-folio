import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import {
  BarChart, Bar, Cell,
  PieChart, Pie,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useEffect, useRef, useState } from "react";

// ── Palette ──────────────────────────────────────────────────────────────────
const PALETTE = [
  "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      {label && (
        <p className="text-[11px] text-muted-foreground mb-0.5 font-mono">{label}</p>
      )}
      <p className="text-sm font-mono font-semibold text-foreground">
        ₹{Number(payload[0]?.value).toLocaleString("en-IN")}
      </p>
    </div>
  );
};

// ── Candlestick Panel (lightweight-charts) ────────────────────────────────────
type CandleRange = "1d" | "5d" | "1mo";

interface CandlestickPanelProps {
  ticker: string;
  range: CandleRange;
}

function CandlestickPanel({ ticker, range }: CandlestickPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialise chart once
  useEffect(() => {
    if (!containerRef.current) return;

    let chart: any;
    (async () => {
      try {
        // Dynamic import — only loads if the package is installed
        const { createChart, ColorType } = await import("lightweight-charts");

        const isDark = document.documentElement.classList.contains("dark");

        chart = createChart(containerRef.current!, {
          width: containerRef.current!.clientWidth,
          height: 260,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: isDark ? "#94a3b8" : "#64748b",
          },
          grid: {
            vertLines: { color: isDark ? "#ffffff0d" : "#0000000d" },
            horzLines: { color: isDark ? "#ffffff0d" : "#0000000d" },
          },
          crosshair: { mode: 1 },
          rightPriceScale: {
            borderColor: isDark ? "#ffffff14" : "#00000014",
          },
          timeScale: {
            borderColor: isDark ? "#ffffff14" : "#00000014",
            timeVisible: range === "1d",
            secondsVisible: false,
          },
          handleScroll: true,
          handleScale: true,
        });

        const series = chart.addCandlestickSeries({
          upColor: "#10b981",
          downColor: "#ef4444",
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        });

        chartRef.current = chart;
        seriesRef.current = series;

        // Resize observer
        const ro = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: containerRef.current.clientWidth,
            });
          }
        });
        ro.observe(containerRef.current!);

        return () => ro.disconnect();
      } catch {
        setError("Install lightweight-charts: npm install lightweight-charts");
        setLoading(false);
      }
    })();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch OHLC data whenever ticker or range changes
  useEffect(() => {
    if (!seriesRef.current) return;
    setLoading(true);
    setError(null);

    const intervalMap: Record<CandleRange, string> = {
      "1d": "5m",
      "5d": "15m",
      "1mo": "1d",
    };
    const interval = intervalMap[range];

    fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.NS?range=${range}&interval=${interval}`
    )
      .then((r) => r.json())
      .then((data) => {
        const result = data?.chart?.result?.[0];
        if (!result) {
          setError("No chart data returned for this ticker.");
          setLoading(false);
          return;
        }

        const timestamps: number[] = result.timestamp ?? [];
        const quote = result.indicators?.quote?.[0] ?? {};

        const candles = timestamps
          .map((t, i) => ({
            time: t as any,
            open: quote.open?.[i] ?? 0,
            high: quote.high?.[i] ?? 0,
            low: quote.low?.[i] ?? 0,
            close: quote.close?.[i] ?? 0,
          }))
          .filter((c) => c.open > 0 && c.close > 0)
          // lightweight-charts requires ascending time, deduplicated
          .filter((c, i, arr) => i === 0 || c.time > arr[i - 1].time);

        if (candles.length === 0) {
          setError("No candle data available for this range.");
          setLoading(false);
          return;
        }

        seriesRef.current.setData(candles);
        chartRef.current?.timeScale().fitContent();
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to fetch chart data. Check your network.");
        setLoading(false);
      });
  }, [ticker, range]);

  if (error) {
    return (
      <div
        style={{
          height: 260,
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
      <div ref={containerRef} style={{ width: "100%", height: 260 }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface PortfolioChartsProps {
  stocks: PortfolioStock[];
}

const PortfolioCharts = ({ stocks }: PortfolioChartsProps) => {
  const tickers = stocks.map((s) => s.ticker);
  const { prices } = useLivePrices(tickers);

  const activeStocks = stocks.filter((s) => s.status === "Active");

  const [selectedTicker, setSelectedTicker] = useState(
    activeStocks[0]?.ticker ?? tickers[0] ?? ""
  );
  const [candleRange, setCandleRange] = useState<CandleRange>("1d");

  // Sync selectedTicker if stocks change
  useEffect(() => {
    if (activeStocks.length > 0 && !activeStocks.find((s) => s.ticker === selectedTicker)) {
      setSelectedTicker(activeStocks[0].ticker);
    }
  }, [activeStocks, selectedTicker]);

  // P&L per stock
  const plData = stocks.map((s) => {
    const live = prices[s.ticker];
    const cmp = live?.price ?? s.cmp;
    const pl = (cmp - s.entryPrice) * s.quantity;
    return { name: s.ticker, pl };
  });

  // Allocation
  const allocationData = stocks.map((s) => ({
    name: s.ticker,
    value: calcInvestedValue(s),
  }));

  const axisStyle = {
    fill: "hsl(220 12% 52%)",
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
      <div className="glass-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Candlestick — {selectedTicker}
            </h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              Real-time OHLC · Yahoo Finance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Ticker selector */}
            <select
              value={selectedTicker}
              onChange={(e) => setSelectedTicker(e.target.value)}
              className="text-xs font-mono bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              {(activeStocks.length > 0 ? activeStocks : stocks).map((s) => (
                <option key={s.ticker} value={s.ticker}>
                  {s.ticker}
                </option>
              ))}
            </select>

            {/* Range pills */}
            <div className="flex gap-1 bg-secondary/60 rounded-md p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => setCandleRange(r)}
                  className={`text-[10px] font-mono px-2.5 py-1 rounded transition-all ${
                    candleRange === r
                      ? "bg-primary text-primary-foreground font-bold shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>

            {/* Live badge */}
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/20">
              Live
            </span>
          </div>
        </div>

        {selectedTicker ? (
          <CandlestickPanel
            key={`${selectedTicker}-${candleRange}`}
            ticker={selectedTicker}
            range={candleRange}
          />
        ) : (
          <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm font-mono">
            Add stocks to your portfolio to view the candlestick chart.
          </div>
        )}
      </div>

      {/* ── Bottom row: P&L bar + Allocation donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* P&L Bar Chart */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">P&L per Stock</h3>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                Live unrealized
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={plData} barSize={16}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220 14% 89% / 0.5)"
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
                    fill={entry.pl >= 0 ? "#10b981" : "#ef4444"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Allocation Donut */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Allocation</h3>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                By invested value
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
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
        </div>
      </div>
    </div>
  );
};

export default PortfolioCharts;
