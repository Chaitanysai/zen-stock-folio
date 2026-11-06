import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UnrealisedHolding } from "@/lib/portfolio/positions";
import { compact, signedInr } from "@/lib/dashboard/format";

interface TipProps {
  active?: boolean;
  payload?: { payload: UnrealisedHolding }[];
}

function HoldingTip({ active, payload }: TipProps) {
  const holding = active ? payload?.[0]?.payload : undefined;
  if (!holding) return null;
  return (
    <div className="glass-elevated rounded-xl px-3 py-2 text-xs">
      <div className="font-mono text-muted-foreground">{holding.ticker} · {holding.sourceLabel}</div>
      <div className="zf-num mt-0.5 text-sm font-semibold" style={{ color: holding.value < 0 ? "hsl(var(--loss))" : "hsl(var(--profit))" }}>
        {signedInr(holding.value)}
      </div>
      <div className="max-w-[180px] truncate text-muted-foreground">{holding.label}</div>
    </div>
  );
}

const axisTick = (v: number) => (v === 0 ? "0" : `${v < 0 ? "−" : ""}${compact(v).replace("₹", "")}`);

/**
 * Unrealised P&L of open holdings. Green bars are gains, red bars are losses;
 * both scale from the same zero line so a large loss cannot hide behind a
 * larger gain. The SVG is hidden from assistive tech; the caller renders an
 * equivalent text table.
 */
export default function UnrealisedChart({ holdings }: { holdings: UnrealisedHolding[] }) {
  const labelWidth = Math.min(
    200,
    Math.max(76, ...holdings.map((holding) => holding.axisLabel.length * 7.4)),
  );
  return (
    <div className="zf-pnl-chart" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={holdings}
          layout="vertical"
          margin={{ top: 4, right: 10, left: 0, bottom: 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid horizontal={false} stroke="hsl(var(--chart-grid))" />
          <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={axisTick} />
          <YAxis
            type="category"
            dataKey="axisLabel"
            width={labelWidth}
            tickLine={false}
            axisLine={false}
            // Recharts wraps any tick wider than the axis; keep source labels on one line.
            tick={{ fontSize: 11, width: undefined }}
          />
          <ReferenceLine x={0} stroke="hsl(var(--border-strong))" />
          <Tooltip content={<HoldingTip />} cursor={{ fill: "hsl(var(--foreground) / .05)" }} />
          <Bar
            dataKey="value"
            radius={[6, 6, 6, 6]}
            maxBarSize={18}
            // Bars grow from the zero line when the card appears or the held set
            // changes. The values and scale stay untouched; only the length animates.
            animationDuration={620}
            animationEasing="ease-out"
          >
            {holdings.map((h) => (
              <Cell
                key={h.key}
                fill={h.value >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
