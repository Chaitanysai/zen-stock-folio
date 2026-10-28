import { useId } from "react";

interface LoginHeroVisualsProps {
  className?: string;
  /** Compact = tablet band: chart only, no floating chips. */
  compact?: boolean;
}

/*
 * Illustrative market scene for the auth hero. Static by design: a deterministic
 * price series (no Math.random, so it never reshuffles on re-render) drawn with
 * theme tokens, so it reads correctly in light and dark. Purely decorative.
 */
const SERIES = [42, 46, 44, 51, 49, 55, 53, 58, 56, 63, 60, 66, 64, 71, 69, 74, 72, 79];

const W = 520;
const H = 300;
const PAD = 24;

function toPoint(value: number, index: number) {
  const x = PAD + (index * (W - PAD * 2)) / (SERIES.length - 1);
  const y = H - PAD - ((value - 36) / (84 - 36)) * (H - PAD * 2);
  return [x, y] as const;
}

const points = SERIES.map(toPoint);
const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
const area = `${line} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`;

export default function LoginHeroVisuals({ className = "", compact = false }: LoginHeroVisualsProps) {
  const [lastX, lastY] = points[points.length - 1];
  // Unique per instance: a gradient defined inside a display:none subtree doesn't paint.
  const gradientId = `zf-hero-area-${useId().replace(/:/g, "")}`;

  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden="true">
      <div className="glass-surface relative overflow-hidden rounded-2xl p-4 sm:p-5">
        {/* Card header */}
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Portfolio value</p>
            <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground sm:text-2xl">₹12,48,320</p>
          </div>
          <span className="rounded-full border border-profit/25 bg-profit/10 px-2.5 py-1 font-mono text-xs font-semibold text-profit">
            +2.84%
          </span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className={compact ? "h-28 w-full" : "h-auto w-full"} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="[stop-color:hsl(var(--brand))] [stop-opacity:.28]" />
              <stop offset="100%" className="[stop-color:hsl(var(--brand))] [stop-opacity:0]" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={PAD}
              x2={W - PAD}
              y1={PAD + t * (H - PAD * 2)}
              y2={PAD + t * (H - PAD * 2)}
              className="stroke-border"
              strokeDasharray="3 5"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            className="stroke-brand"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {!compact && (
            <>
              <circle cx={lastX} cy={lastY} r="9" className="fill-brand/20" />
              <circle cx={lastX} cy={lastY} r="4" className="fill-brand" />
            </>
          )}
        </svg>
      </div>

      {!compact && (
        <>
          <div className="glass-elevated absolute -left-6 bottom-10 hidden rounded-xl px-4 py-3 xl:block">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Day&apos;s P&amp;L</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-profit">+₹34,180</p>
          </div>
          <div className="glass-elevated absolute -right-10 top-[38%] hidden rounded-xl px-4 py-3 xl:block">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Watchlist</p>
            <p className="mt-0.5 font-mono text-sm font-semibold text-foreground">
              INFY <span className="text-loss">−0.6%</span>
            </p>
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">Illustrative data</p>
    </div>
  );
}
