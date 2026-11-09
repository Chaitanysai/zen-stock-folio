import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { UnrealisedHolding } from "@/lib/portfolio/positions";
import { compact, signedInr } from "@/lib/dashboard/format";

interface TipProps {
  active?: boolean;
  payload?: { payload: UnrealisedHolding }[];
}

/** Matches the CSS entrance so the grow is finished before the gate closes. */
const ENTRY_MS = 620;

function motionQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

function HoldingTip({ active, payload }: TipProps) {
  const holding = active ? payload?.[0]?.payload : undefined;
  if (!holding) return null;
  return (
    <div className="zf-chart-tooltip">
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
 *
 * The bars grow on entry only. A quote poll that changes a value must not replay
 * that grow: length changing on its own would read as the position moving, which
 * is a financial claim the animation has no right to make.
 */
export default function UnrealisedChart({ holdings }: { holdings: UnrealisedHolding[] }) {
  const labelWidth = Math.min(
    200,
    Math.max(76, ...holdings.map((holding) => holding.axisLabel.length * 7.4)),
  );

  // Motion is allowed at mount unless the user has asked for less of it, and it
  // is only ever withdrawn — re-enabling the setting must never replay an entry.
  const [motionAllowed, setMotionAllowed] = useState(() => !(motionQuery()?.matches ?? false));
  const [entering, setEntering] = useState(true);
  const firstHoldings = useRef(holdings);

  useEffect(() => {
    const query = motionQuery();
    if (!query) return;
    const onChange = () => {
      if (query.matches) setMotionAllowed(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (firstHoldings.current === holdings) return;
    firstHoldings.current = holdings;
    setEntering(false);
  }, [holdings]);

  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), ENTRY_MS);
    return () => clearTimeout(timer);
  }, []);

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
            isAnimationActive={entering && motionAllowed}
            animationDuration={ENTRY_MS}
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
