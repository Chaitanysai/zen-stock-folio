/**
 * Ambient light bed shared by both events.
 *
 * Two stacked layers: the outer one fades the whole bed in once, the inner one
 * breathes slowly. Splitting them keeps the entrance and the loop from fighting
 * over the same `opacity` property.
 */
export interface AmbientGlowProps {
  tone: "warm" | "cool";
}

export default function AmbientGlow({ tone }: AmbientGlowProps) {
  return (
    <div className="zl-ev-glow" data-tone={tone}>
      <div className="zl-ev-glow-core" />
    </div>
  );
}
