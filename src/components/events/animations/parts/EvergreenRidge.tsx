const TREES = [
  { x: 54, scale: 0.62, opacity: 0.55 },
  { x: 132, scale: 0.92, opacity: 0.8 },
  { x: 214, scale: 0.5, opacity: 0.45 },
  { x: 402, scale: 0.78, opacity: 0.7 },
  { x: 486, scale: 1, opacity: 0.85 },
  { x: 556, scale: 0.58, opacity: 0.5 },
];

/**
 * Abstract evergreen ridge: three curved tiers and a trunk per tree, filled as
 * one silhouette. No ornaments, no cartoon outline — it is a horizon, not an
 * illustration, and it sits at very low opacity behind the content.
 */
export default function EvergreenRidge() {
  return (
    <svg
      className="zl-ev-evergreen"
      viewBox="0 0 600 240"
      preserveAspectRatio="xMidYMax slice"
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      {TREES.map((tree, index) => (
        <g
          key={index}
          transform={`translate(${tree.x} 240) scale(${tree.scale})`}
          fill="currentColor"
          opacity={tree.opacity}
        >
          <path d="M0 -210 C8 -180 16 -160 22 -146 C8 -150 -8 -150 -22 -146 C-16 -160 -8 -180 0 -210 Z" />
          <path d="M0 -170 C12 -132 24 -108 32 -92 C12 -98 -12 -98 -32 -92 C-24 -108 -12 -132 0 -170 Z" />
          <path d="M0 -120 C16 -76 32 -46 42 -26 C16 -34 -16 -34 -42 -26 C-32 -46 -16 -76 0 -120 Z" />
          <path d="M-4 -26 L4 -26 L4 0 L-4 0 Z" />
        </g>
      ))}
    </svg>
  );
}
