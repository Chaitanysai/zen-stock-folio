import { getSectorAllocation, PortfolioStock } from "@/data/sampleData";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";

// Categorical sector colours come from the shared chart tokens (indigo-led,
// theme-aware) so green/red stay reserved for gains and losses.
const PALETTE = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted-foreground))",
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
      <div className="glass-card">
        <div className="zf-empty-state">
          <div className="zf-empty-icon" aria-hidden="true"><PieChartIcon /></div>
          <h3 className="zf-empty-title">No active positions for sector analysis</h3>
          <p className="zf-empty-body">
            Once you hold open positions, their invested value is grouped by sector here.
          </p>
        </div>
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
                    className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none"
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
