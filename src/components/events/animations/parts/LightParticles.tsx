import type { CSSProperties } from "react";

export interface LightParticlesProps {
  count: number;
}

/**
 * Deterministic pseudo-random in [0, 1). Seeded so the composition is identical
 * on every render and in tests — no Math.random, no layout jitter.
 */
function seeded(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

/**
 * Slow golden motes drifting upward.
 *
 * Each mote is one element animated with transform + opacity only. Positions,
 * sizes, durations and delays are derived from the index, so the field looks
 * scattered but is stable across renders.
 */
export default function LightParticles({ count }: LightParticlesProps) {
  if (count <= 0) return null;

  const motes = Array.from({ length: count }, (_, index) => {
    const x = seeded(index + 1);
    const size = seeded(index + 17);
    const duration = seeded(index + 41);
    const delay = seeded(index + 73);
    const drift = seeded(index + 97);

    const style = {
      "--zl-p-x": `${8 + x * 84}%`,
      "--zl-p-size": `${2 + size * 3.2}px`,
      "--zl-p-dur": `${16 + duration * 14}s`,
      "--zl-p-delay": `${1.4 + delay * 6}s`,
      "--zl-p-drift": `${(drift - 0.5) * 70}px`,
    } as CSSProperties;

    return <span key={index} className="zl-ev-particle" style={style} />;
  });

  return <div className="zl-ev-particles">{motes}</div>;
}
