import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer,
  LineChart, Line
} from "recharts";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useEffect, useState } from "react";

const COLORS = [
  "hsl(174,72%,46%)",
  "hsl(145,72%,44%)",
  "hsl(0,72%,55%)",
  "hsl(38,92%,50%)",
  "hsl(262,60%,55%)",
  "hsl(200,70%,50%)",
  "hsl(30,80%,55%)",
  "hsl(320,60%,50%)"
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label || payload[0]?.name}</p>
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
  // ✅ LIVE PRICES
  const tickers = stocks.map(s => s.ticker);
  const { prices } = useLivePrices(tickers);

  // ✅ REAL-TIME HISTORY
  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toLocaleTimeString();

      const totalValue = stocks.reduce((sum, s) => {
        const live = prices[s.ticker];
        const cmp = live?.price ?? s.cmp;
        return sum + (cmp * s.quantity);
      }, 0);

      setPriceHistory(prev => [
        ...prev.slice(-20), // last 20 points
        { time: now, value: totalValue }
      ]);
    }, 5000);

    return () => clearInterval(interval);
  }, [prices, stocks]);

  // ✅ Allocation
  const allocationData = stocks.map((s) => ({
    name: s.ticker,
    value: calcInvestedValue(s),
  }));

  // ✅ LIVE P&L
  const plData = stocks.map((s) => {
    const live = prices[s.ticker];
    const cmp = live?.price ?? s.cmp;

    const invested = s.entryPrice * s.quantity;
    const currentValue = cmp * s.quantity;
    const pl = currentValue - invested;

    return { name: s.ticker, pl };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

      {/* 🔴 REAL-TIME PORTFOLIO CHART */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Live Portfolio Value (₹)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={priceHistory}>
            <XAxis
              dataKey="time"
              tick={{ fill: "hsl(215,12%,50%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(215,12%,50%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(174,72%,46%)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 📊 P&L Distribution */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">P&L Distribution (₹)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={plData}>
            <XAxis dataKey="name" tick={{ fill: "hsl(215,12%,50%)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215,12%,50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="pl" radius={[4, 4, 0, 0]}>
              {plData.map((entry, i) => (
                <Cell key={i} fill={entry.pl >= 0 ? "hsl(145,72%,44%)" : "hsl(0,72%,55%)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 🥧 Allocation */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Stock Allocation (₹)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={allocationData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={75}
              innerRadius={40}
              strokeWidth={0}
            >
              {allocationData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-2 mt-2">
          {allocationData.map((d, i) => (
            <div key={d.name} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-[10px] text-muted-foreground">{d.name}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default PortfolioCharts;