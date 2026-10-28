import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthBucket } from "@/lib/dashboard/overview";
import { compact, signedInr } from "@/lib/dashboard/format";

interface TipProps {
  active?: boolean;
  payload?: { payload: MonthBucket }[];
}

function MonthTip({ active, payload }: TipProps) {
  const month = active ? payload?.[0]?.payload : undefined;
  if (!month) return null;
  return (
    <div className="glass-elevated rounded-xl px-3 py-2 text-xs">
      <div className="font-mono text-muted-foreground">{month.label}</div>
      <div className="zf-num mt-0.5 text-sm font-semibold" style={{ color: month.value < 0 ? "hsl(var(--loss))" : "hsl(var(--profit))" }}>
        {signedInr(month.value)}
      </div>
      <div className="text-muted-foreground">{month.trades} closed trade{month.trades === 1 ? "" : "s"}</div>
    </div>
  );
}

const axisTick = (v: number) => (v === 0 ? "0" : `${v < 0 ? "−" : ""}${compact(v).replace("₹", "")}`);

/**
 * Realised P&L by exit month. Orange hatched bars are profit months, solid dark
 * bars are loss months. Colours are CSS variables, so the chart re-themes with
 * no JavaScript when the theme class changes. The SVG is hidden from assistive
 * tech; the caller renders an equivalent text table.
 */
export default function PnlChart({ months }: { months: MonthBucket[] }) {
  return (
    <div className="zf-pnl-chart" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={months} margin={{ top: 8, right: 4, left: -6, bottom: 0 }} barCategoryGap="26%">
          <defs>
            <pattern id="zf-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="hsl(var(--brand) / .16)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="hsl(var(--brand))" strokeWidth="2.6" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="hsl(var(--chart-grid))" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={axisTick} />
          <ReferenceLine y={0} stroke="hsl(var(--border-strong))" />
          <Tooltip content={<MonthTip />} cursor={{ fill: "hsl(var(--foreground) / .05)" }} />
          <Bar dataKey="value" radius={[8, 8, 8, 8]} maxBarSize={38} isAnimationActive={false}>
            {months.map((m) => (
              <Cell
                key={m.key}
                fill={m.value >= 0 ? "url(#zf-hatch)" : "hsl(var(--chart-ink))"}
                stroke={m.value >= 0 ? "hsl(var(--brand))" : "none"}
                strokeWidth={m.value >= 0 ? 1 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
