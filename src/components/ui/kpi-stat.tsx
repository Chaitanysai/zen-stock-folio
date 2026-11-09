import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * KPI tile.
 *
 * The compact financial-performance block: a label, a large tabular figure, a
 * delta, and an optional supporting line. It is the presentation half of a
 * metric — callers own the number, so nothing is derived or guessed here.
 *
 * Contract for direction, which matters for money:
 *  - `tone` states the meaning, never the raw sign, so a positive expense or a
 *    loss reported as a positive magnitude are still coloured correctly.
 *  - `tone="auto"` derives direction from the sign of `value`.
 *  - Direction is carried by an icon and a sign as well as colour, so it
 *    survives greyscale and colour-blindness.
 */

export type KpiTone = "auto" | "positive" | "negative" | "neutral";

export interface KpiStatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  /** Pre-formatted figure. The caller owns currency symbols and precision. */
  value: React.ReactNode;
  /** Numeric value used only for auto tone. */
  numericValue?: number;
  /** Pre-formatted delta with its own sign. */
  delta?: React.ReactNode;
  /** Numeric delta used only for auto tone. */
  numericDelta?: number;
  tone?: KpiTone;
  /** Supporting line under the figure (freshness, context, a caveat). */
  hint?: React.ReactNode;
  /** Replaces `value` while loading, to avoid a misleading zero. */
  loading?: boolean;
  /** Rendered top-right; use for a menu or a drill-in affordance. */
  action?: React.ReactNode;
}

function resolveTone(tone: KpiTone, value: number | undefined): "positive" | "negative" | "neutral" {
  if (tone !== "auto") return tone;
  if (value === undefined || !Number.isFinite(value) || value === 0) return "neutral";
  return value > 0 ? "positive" : "negative";
}

const TONE_CLASS: Record<"positive" | "negative" | "neutral", string> = {
  positive: "text-[hsl(var(--profit))]",
  negative: "text-[hsl(var(--loss))]",
  neutral: "text-muted-foreground",
};

const KpiStat = React.forwardRef<HTMLDivElement, KpiStatProps>(
  ({ label, value, numericValue, delta, numericDelta, tone = "auto", hint, loading, action, className, ...props }, ref) => {
    const valueTone = resolveTone(tone, numericValue);
    const deltaTone = resolveTone("auto", numericDelta);

    return (
      <div
        ref={ref}
        className={cn("zf-kpi", className)}
        {...props}
      >
        <div className="zf-kpi-head">
          <span className="zf-kpi-label">{label}</span>
          {action && <span className="zf-kpi-action">{action}</span>}
        </div>

        <div className={cn("zf-kpi-value", loading ? "text-muted-foreground" : TONE_CLASS[valueTone])}>
          {loading ? <span className="zf-skeleton-block inline-block h-6 w-24 rounded" /> : value}
        </div>

        {(delta !== undefined || hint !== undefined) && (
          <div className="zf-kpi-foot">
            {delta !== undefined && !loading && (
              <span className={cn("zf-kpi-delta", TONE_CLASS[deltaTone])}>{delta}</span>
            )}
            {hint !== undefined && <span className="zf-kpi-hint">{hint}</span>}
          </div>
        )}
      </div>
    );
  },
);
KpiStat.displayName = "KpiStat";

export { KpiStat };
