import { getSectorAllocation, PortfolioStock } from "@/data/sampleData";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieIcon } from "lucide-react";

const COLORS = ["hsl(174,72%,46%)", "hsl(145,72%,44%)", "hsl(38,92%,50%)", "hsl(262,60%,55%)", "hsl(200,70%,50%)", "hsl(0,72%,55%)", "hsl(30,80%,55%)", "hsl(320,60%,50%)"];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{payload[0]?.name}</p>
      <p className="text-sm font-mono text-primary">₹{Number(payload[0]?.value).toLocaleString("en-IN")}</p>
      <p className="text-xs text-muted-foreground">{payload[0]?.payload?.percentage?.toFixed(1)}% of portfolio</p>
    </div>
  );
};

interface SectorDiversificationProps {
  stocks: PortfolioStock[];
}

const SectorDiversification = ({ stocks }: SectorDiversificationProps) => {
  const sectorData = getSectorAllocation(stocks);

  if (sectorData.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">No active positions for sector analysis</p>
      </div>
    );
  }

  const chartData = sectorData.map(s => ({ name: s.sector, value: s.value, percentage: s.percentage }));

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <PieIcon className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Sector Diversification</h2>
          <p className="text-xs text-muted-foreground mt-1">Active portfolio breakdown by sector</p>
        </div>
      </div>
      <div className="p-4 flex flex-col lg:flex-row items-center gap-6">
        <div className="w-full lg:w-1/2">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} strokeWidth={2} stroke="hsl(220,18%,10%)">
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full lg:w-1/2 space-y-2">
          {sectorData.map((s, i) => (
            <div key={s.sector} className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm text-foreground">{s.sector}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">₹{s.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  <span className="text-xs font-mono font-semibold text-primary w-12 text-right">{s.percentage.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SectorDiversification;
