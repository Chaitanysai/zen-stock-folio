type HeroSceneProps = {
  className?: string;
};

/**
 * Decorative portfolio-performance backdrop for the public hero.
 *
 * This deliberately reads as long-term portfolio growth rather than a trading
 * interface: one smooth upward line, a quiet filled area and a handful of
 * milestones. It is static by default, needs no WebGL or pointer input, and is
 * therefore available immediately on every device.
 */
export default function HeroScene({ className }: HeroSceneProps) {
  return (
    <div className={["zl-scene", className].filter(Boolean).join(" ")} aria-hidden="true">
      <svg className="zl-growth-chart" viewBox="0 0 720 480" focusable="false">
        <defs>
          <linearGradient id="zl-growth-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="zl-growth-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".42" />
            <stop offset="72%" stopColor="currentColor" />
            <stop offset="100%" stopColor="#e68a3d" />
          </linearGradient>
        </defs>

        <g className="zl-growth-grid">
          {[104, 184, 264, 344].map((y) => <line key={y} x1="38" y1={y} x2="682" y2={y} />)}
          {[112, 232, 352, 472, 592].map((x) => <line key={x} x1={x} y1="64" x2={x} y2="396" />)}
        </g>
        <g className="zl-growth-perspective">
          <line x1="38" y1="396" x2="286" y2="438" />
          <line x1="166" y1="396" x2="366" y2="438" />
          <line x1="294" y1="396" x2="446" y2="438" />
          <line x1="422" y1="396" x2="526" y2="438" />
          <line x1="550" y1="396" x2="606" y2="438" />
        </g>
        <path
          className="zl-growth-area"
          d="M38 350 C88 338 104 315 142 322 S202 294 236 300 S296 264 334 274 S398 234 432 248 S488 202 528 214 S590 145 682 102 L682 396 L38 396 Z"
        />
        <path
          className="zl-growth-line"
          pathLength="1"
          d="M38 350 C88 338 104 315 142 322 S202 294 236 300 S296 264 334 274 S398 234 432 248 S488 202 528 214 S590 145 682 102"
        />
        <g className="zl-growth-milestones">
          <circle cx="236" cy="300" r="4" />
          <circle cx="432" cy="248" r="4" />
          <circle cx="528" cy="214" r="4" />
          <circle className="zl-growth-last-ring" cx="682" cy="102" r="12" />
          <circle className="zl-growth-last" cx="682" cy="102" r="5" />
        </g>
        <g className="zl-growth-labels">
          <text x="38" y="424">JAN</text>
          <text x="236" y="424">APR</text>
          <text x="432" y="424">JUL</text>
          <text x="630" y="424">TODAY</text>
        </g>
      </svg>
    </div>
  );
}
