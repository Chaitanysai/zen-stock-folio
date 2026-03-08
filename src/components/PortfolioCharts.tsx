import { portfolioData, calcInvestedValue, calcFinalValue, calcProfitLoss } from "@/data/sampleData";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const COLORS = ["hsl(174,72%,46%)", "hsl(145,72%,44%)", "hsl(0,72%,55%)", "hsl(38,92%,50%)", "hsl(262,60%,55%)", "hsl(200,70%,50%)", "hsl(30,80%,55%)", "hsl(320,60%,50%)"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg">
      <p className="text-xs text-muted-foreground">{label || payload[0]?.name}</p>
      <p className="text-sm font-mono font-semibold text-foreground">₹{Number(payload[0]?.value).toLocaleString("en-IN")}</p>
    </div>
  );
};

const PortfolioCharts = () => {
  const allocationData = portfolioData.map((s) => ({
    name: s.ticker,
    value: calcInvestedValue(s),
  }));

  const plData = portfolioData.map((s) => ({
    name: s.ticker,
    pl: calcProfitLoss(s),
  }));

  // Simulated portfolio growth
  const growthData = [
    { month: "Oct", value: 145000 },
    { month: "Nov", value: 152000 },
    { month: "Dec", value: 148000 },
    { month: "Jan", value: 165000 },
    { month: "Feb", value: 178000 },
    { month: "Mar", value: portfolioData.reduce((s, st) => s + calcFinalValue(st), 0) },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Portfolio Growth */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Portfolio Growth</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={growthData}>
            <defs>
              <linearGradient id="gradientGrowth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(174,72%,46%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(174,72%,46%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: "hsl(215,12%,50%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215,12%,50%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="value" stroke="hsl(174,72%,46%)" fill="url(#gradientGrowth)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* P&L Distribution */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">P&L Distribution</h3>
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

      {/* Allocation Pie */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-semibold mb-3">Stock Allocation</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} strokeWidth={0}>
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
