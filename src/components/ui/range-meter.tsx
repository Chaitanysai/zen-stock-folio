import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Range Meter.
 *
 * A compact, labelled meter for a value inside a range: a track, a filled
 * portion, and an optional marker for a reference point (the current price
 * inside the 52-week band, exposure inside a cap, and so on).
 *
 * It is a presentation component, not a chart: it renders with markup and CSS
 * only, so it stays crisp at any size and costs no charting dependency. Colour
 * is never the only channel — the label always states the value.
 *
 * The fill and marker are set as custom properties, so a parent can animate
 * them without this component re-rendering.
 */

export interface RangeMeterProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current value. Clamped to [min, max] for rendering. */
  value: number;
  min: number;
  max: number;
  /**
   * Optional reference position, e.g. cost basis or a target. Rendered as a
   * thin vertical marker. Also clamped.
   */
  marker?: number;
  /** Height of the track in pixels. */
  height?: number;
  /** Semantic tone of the fill. */
  tone?: "neutral" | "profit" | "loss" | "brand";
  /** Accessible name; required, because the meter carries real information. */
  label: string;
  /** Optional readable value shown to the right of the label. */
  valueLabel?: React.ReactNode;
  /** Optional tick labels under the track (e.g. low/high). */
  minLabel?: React.ReactNode;
  maxLabel?: React.ReactNode;
}

/** Fraction of the range, clamped, guarding a zero-width range. */
function fraction(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  return Math.min(Math.max((value - min) / (max - min), 0), 1);
}

const TONE_VAR: Record<NonNullable<RangeMeterProps["tone"]>, string> = {
  neutral: "hsl(var(--muted-foreground))",
  profit: "hsl(var(--profit))",
  loss: "hsl(var(--loss))",
  brand: "hsl(var(--brand))",
};

const RangeMeter = React.forwardRef<HTMLDivElement, RangeMeterProps>(
  (
    { value, min, max, marker, height = 6, tone = "neutral", label, valueLabel, minLabel, maxLabel, className, style, ...props },
    ref,
  ) => {
    const pct = fraction(value, min, max) * 100;
    const markerPct = marker !== undefined ? fraction(marker, min, max) * 100 : null;
    const toneColor = TONE_VAR[tone];

    return (
      <div ref={ref} className={cn("w-full", className)} style={style} {...props}>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
          {valueLabel !== undefined && (
            <span className="font-mono text-[11px] tabular-nums text-foreground">{valueLabel}</span>
          )}
        </div>
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={Number.isFinite(value) ? value : undefined}
          className="relative w-full overflow-hidden rounded-full bg-[hsl(var(--surface-3))]"
          style={{ height }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: toneColor }}
          />
          {markerPct !== null && (
            <div
              aria-hidden="true"
              className="absolute top-0 h-full w-px bg-[hsl(var(--foreground)/.55)]"
              style={{ left: `${markerPct}%` }}
            />
          )}
        </div>
        {(minLabel !== undefined || maxLabel !== undefined) && (
          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </div>
        )}
      </div>
    );
  },
);
RangeMeter.displayName = "RangeMeter";

export { RangeMeter, fraction as rangeFraction };
