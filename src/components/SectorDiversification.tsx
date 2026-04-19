import { getSectorAllocation, PortfolioStock } from "@/data/sampleData";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6",
  "#ec4899", "#ef4444", "#f97316", "#06b6d4",
];

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{payload[0]?.name}</p>
      <p className="text-sm font-mono text-primary">
        ₹{Number(payload[0]?.value).toLocaleString("en-IN")}
      </p>
      <p className="text-[11px] text-muted-foreground font-mono">
        {payload[0]?.payload?.percentage?.toFixed(1)}% of portfolio
      </p>
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
      <div className="glass-card p-6 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No active positions for sector analysis
        </p>
      </div>
    );
  }

  const chartData = sectorData.map((s) => ({
    name: s.sector,
    value: s.value,
    percentage: s.percentage,
  }));

  const topSector = sectorData[0];

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Sector Diversification
          </h2>
          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
            Active portfolio breakdown
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-mono font-semibold text-primary">
            {topSector?.sector}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            top sector · {topSector?.percentage?.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="p-5 flex flex-col lg:flex-row items-center gap-6">
        {/* Donut */}
        <div className="flex-shrink-0">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={72}
                innerRadius={42}
                strokeWidth={2}
                stroke="hsl(var(--card))"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="w-full flex flex-col gap-2.5">
          {sectorData.map((s, i) => (
            <div key={s.sector} className="flex items-center gap-3">
              <div
                className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-[12px] text-foreground font-medium flex-1 truncate">
                  {s.sector}
                </span>
                {/* Bar */}
                <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${s.percentage}%`,
                      backgroundColor: PALETTE[i % PALETTE.length],
                    }}
                  />
                </div>
                <span className="text-[11px] font-mono font-semibold text-foreground w-10 text-right flex-shrink-0">
                  {s.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SectorDiversification;
