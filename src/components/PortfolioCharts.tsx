import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer,
  AreaChart, Area,
  CartesianGrid,
} from "recharts";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useEffect, useState } from "react";

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      {label && <p className="text-[11px] text-muted-foreground mb-0.5 font-mono">{label}</p>}
      <p className="text-sm font-mono font-semibold text-foreground">
        ₹{Number(payload[0]?.value).toLocaleString("en-IN")}
      </p>
    </div>
  );
};

interface PortfolioChartsProps {
  stocks: PortfolioStock[];
}

const PortfolioCharts = ({ stocks }: PortfolioChartsProps) => {
  const tickers = stocks.map((s) => s.ticker);
  const { prices } = useLivePrices(tickers);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchPortfolioChart = async () => {
      try {
        const responses = await Promise.all(
          stocks.map((s) =>
            fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${s.ticker}.NS?range=1d&interval=5m`
            ).then((res) => res.json())
          )
        );
        const timestamps = responses[0]?.chart?.result?.[0]?.timestamp || [];
        const chartData: any[] = [];
        timestamps.forEach((t: number, i: number) => {
          let totalValue = 0;
          stocks.forEach((s, idx) => {
            const pricesArr =
              responses[idx]?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
            const price = pricesArr?.[i];
            if (!price) return;
            totalValue += price * s.quantity;
          });
          chartData.push({
            time: new Date(t * 1000).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            value: totalValue,
          });
        });
        setPriceHistory(chartData);
      } catch (err) {
        console.error("Portfolio chart error:", err);
      }
    };
    fetchPortfolioChart();
  }, [stocks]);

  const allocationData = stocks.map((s) => ({
    name: s.ticker,
    value: calcInvestedValue(s),
  }));

  const plData = stocks.map((s) => {
    const live = prices[s.ticker];
    const cmp = live?.price ?? s.cmp;
    const pl = cmp * s.quantity - s.entryPrice * s.quantity;
    return { name: s.ticker, pl };
  });

  const axisStyle = {
    fill: "hsl(220 12% 52%)",
    fontSize: 10,
    fontFamily: "'Geist Mono', monospace",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* Portfolio Value Chart */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Portfolio Value</h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">Intraday · 5 min intervals</p>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-profit/10 text-profit border border-profit/20">
            Live
          </span>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={priceHistory}>
            <defs>
              <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89% / 0.5)" vertical={false} />
            <XAxis dataKey="time" tick={axisStyle} axisLine={false} tickLine={false} minTickGap={30} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5}
              fillOpacity={1} fill="url(#gradValue)" dot={false} activeDot={{ r: 3, fill: "#3b82f6" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* P&L Bar Chart */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">P&L per Stock</h3>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">Live unrealized</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={plData} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 89% / 0.5)" vertical={false} />
            <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="pl" radius={[3, 3, 0, 0]}>
              {plData.map((entry, i) => (
                <Cell key={i} fill={entry.pl >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.85} />
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
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">By invested value</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={120} height={120}>
            <PieChart>
              <Pie data={allocationData} dataKey="value" nameKey="name"
                outerRadius={54} innerRadius={30} strokeWidth={2}
                stroke="hsl(var(--card))">
                {allocationData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {allocationData.slice(0, 6).map((item, i) => {
              const total = allocationData.reduce((s, d) => s + d.value, 0);
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={item.name} className="flex items-center gap-2 min-w-0">
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
  );
};

export default PortfolioCharts;
