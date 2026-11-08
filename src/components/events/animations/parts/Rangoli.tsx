const PETALS = Array.from({ length: 16 }, (_, index) => index * 22.5);
const DIAMONDS = Array.from({ length: 8 }, (_, index) => index * 45);

/**
 * Rangoli-inspired geometry: concentric rings, a dotted outer band and two
 * rings of petals. Stroked, never filled, so it reads as an engraved detail
 * rather than a poster motif. The whole group rotates very slowly.
 */
export default function Rangoli() {
  return (
    <svg
      className="zl-ev-rangoli"
      viewBox="0 0 400 400"
      role="presentation"
      focusable="false"
      aria-hidden="true"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <circle cx="200" cy="200" r="192" />
        <circle cx="200" cy="200" r="176" strokeDasharray="1 7" strokeLinecap="round" />
        <circle cx="200" cy="200" r="64" />
        <circle cx="200" cy="200" r="44" />
        <circle cx="200" cy="200" r="26" strokeDasharray="2 6" />

        {PETALS.map((angle) => (
          <path
            key={`petal-${angle}`}
            d="M200 44 C214 86 214 118 200 152 C186 118 186 86 200 44 Z"
            transform={`rotate(${angle} 200 200)`}
          />
        ))}

        {DIAMONDS.map((angle) => (
          <path
            key={`diamond-${angle}`}
            d="M200 158 L208 170 L200 182 L192 170 Z"
            transform={`rotate(${angle} 200 200)`}
          />
        ))}
      </g>
    </svg>
  );
}
