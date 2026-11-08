import { useId, type CSSProperties } from "react";

export interface DiyaProps {
  className?: string;
  /** Stagger for the illuminate-in sequence, in milliseconds. */
  delayMs?: number;
  /** Flame loop duration; different per diya so they never pulse in sync. */
  flameDuration?: string;
  flameDelay?: string;
}

/**
 * A single diya: shallow brass bowl, oil surface, and a two-layer flame.
 *
 * The flame is two SVG paths animated with transform only (scale/rotate around
 * its base), which reads as organic movement without a canvas, a filter or a
 * per-frame script. Gradient ids are namespaced with useId so several diyas can
 * coexist on one page.
 */
export default function Diya({
  className,
  delayMs = 0,
  flameDuration = "2.8s",
  flameDelay = "0s",
}: DiyaProps) {
  const uid = useId().replace(/:/g, "");
  const glowId = `zl-diya-glow-${uid}`;
  const bowlId = `zl-diya-bowl-${uid}`;
  const rimId = `zl-diya-rim-${uid}`;
  const flameId = `zl-diya-flame-${uid}`;

  const style = {
    "--zl-diya-delay": `${delayMs}ms`,
    "--zl-flame-dur": flameDuration,
    "--zl-flame-delay": flameDelay,
  } as CSSProperties;

  return (
    <div className={className} style={style}>
      <svg viewBox="0 0 120 120" role="presentation" focusable="false">
        <defs>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(36 100% 68%)" stopOpacity=".55" />
            <stop offset="55%" stopColor="hsl(30 100% 58%)" stopOpacity=".2" />
            <stop offset="100%" stopColor="hsl(28 100% 52%)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={bowlId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(34 82% 58%)" />
            <stop offset="45%" stopColor="hsl(26 74% 44%)" />
            <stop offset="100%" stopColor="hsl(18 62% 28%)" />
          </linearGradient>
          <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(42 92% 76%)" />
            <stop offset="50%" stopColor="hsl(36 88% 64%)" />
            <stop offset="100%" stopColor="hsl(28 78% 48%)" />
          </linearGradient>
          <linearGradient id={flameId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="hsl(22 96% 52%)" />
            <stop offset="45%" stopColor="hsl(34 100% 62%)" />
            <stop offset="100%" stopColor="hsl(48 100% 88%)" />
          </linearGradient>
        </defs>

        <ellipse className="zl-ev-diya-glow" cx="60" cy="64" rx="42" ry="30" fill={`url(#${glowId})`} />

        <g className="zl-ev-diya-body">
          <path
            d="M16 74 C20 91 38 101 60 101 C82 101 100 91 104 74 C94 83 78 87 60 87 C42 87 26 83 16 74 Z"
            fill={`url(#${bowlId})`}
          />
          <ellipse cx="60" cy="74" rx="44" ry="8" fill={`url(#${rimId})`} />
          <ellipse cx="60" cy="74" rx="34" ry="5.2" fill="hsl(20 60% 22%)" opacity=".55" />
          <path
            d="M26 80 C34 88 46 92 60 92"
            fill="none"
            stroke="hsl(44 96% 82%)"
            strokeOpacity=".35"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>

        <g className="zl-ev-flame">
          <path
            className="zl-ev-flame-outer"
            d="M60 24 C67.5 39 74 50 74 58.5 C74 66.5 67.7 72 60 72 C52.3 72 46 66.5 46 58.5 C46 50 52.5 39 60 24 Z"
            fill={`url(#${flameId})`}
          />
          <path
            className="zl-ev-flame-inner"
            d="M60 41 C64 49.5 66.5 55 66.5 59.5 C66.5 64.5 63.6 68 60 68 C56.4 68 53.5 64.5 53.5 59.5 C53.5 55 56 49.5 60 41 Z"
            fill="hsl(48 100% 92%)"
            opacity=".92"
          />
          <path
            className="zl-ev-flame-wick"
            d="M60 72 L60 66.5"
            stroke="hsl(20 40% 18%)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
