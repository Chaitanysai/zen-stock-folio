import { PortfolioStock, calcInvestedValue } from "@/data/sampleData";
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer,
  AreaChart, Area
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
      <p className="text-xs text-muted-foreground">{label}</p>
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
  const tickers = stocks.map(s => s.ticker);
  const { prices } = useLivePrices(tickers);

  const [priceHistory, setPriceHistory] = useState<any[]>([]);

  // 🔥 REAL MARKET DATA (Groww style)
  useEffect(() => {
    const fetchPortfolioChart = async () => {
      try {
        const responses = await Promise.all(
          stocks.map(s =>
            fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${s.ticker}.NS?range=1d&interval=5m`
            ).then(res => res.json())
          )
        );

        // Get timestamps from first stock
        const timestamps =
          responses[0]?.chart?.result?.[0]?.timestamp || [];

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

      {/* 🔥 REAL PORTFOLIO CHART */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">
          Portfolio Value (Intraday ₹)
        </h3>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={priceHistory}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* X Axis */}
            <XAxis
              dataKey="time"
              tick={{ fill: "hsl(215,12%,50%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={25}
            />

            {/* Y Axis */}
            <YAxis
              tick={{ fill: "hsl(215,12%,50%)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
            />

            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorValue)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 📊 P&L */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">P&L Distribution (₹)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={plData}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="pl">
              {plData.map((entry, i) => (
                <Cell key={i} fill={entry.pl >= 0 ? "#16a34a" : "#ef4444"} />
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
              outerRadius={75}
              innerRadius={40}
            >
              {allocationData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

export default PortfolioCharts;