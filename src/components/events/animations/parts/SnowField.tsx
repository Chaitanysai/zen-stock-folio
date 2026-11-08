import type { CSSProperties } from "react";

export interface SnowFieldProps {
  count: number;
}

function seeded(index: number): number {
  const value = Math.sin(index * 91.7 + 47.3) * 43758.5453123;
  return value - Math.floor(value);
}

/**
 * Layered snowfall.
 *
 * One element per flake, animated with transform + opacity. Depth is faked with
 * size, opacity and duration: small/slow flakes read as distant, larger/faster
 * ones as near. The layer's mask keeps the copy column clear.
 */
export default function SnowField({ count }: SnowFieldProps) {
  if (count <= 0) return null;

  const flakes = Array.from({ length: count }, (_, index) => {
    const x = seeded(index + 1);
    const size = seeded(index + 23);
    const duration = seeded(index + 53);
    const delay = seeded(index + 79);
    const drift = seeded(index + 101);
    const depth = seeded(index + 131);

    const style = {
      "--zl-s-x": `${2 + x * 96}%`,
      "--zl-s-size": `${2 + size * 3.4}px`,
      "--zl-s-dur": `${16 + duration * 18}s`,
      "--zl-s-delay": `${delay * 6}s`,
      "--zl-s-drift": `${(drift - 0.5) * 90}px`,
      "--zl-s-o": `${0.35 + depth * 0.5}`,
    } as CSSProperties;

    return <span key={index} className="zl-ev-flake" style={style} />;
  });

  return <div className="zl-ev-snow">{flakes}</div>;
}
