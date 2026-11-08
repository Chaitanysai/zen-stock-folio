import type { EventAnimationProps } from "../types";
import AmbientGlow from "./parts/AmbientGlow";
import EvergreenRidge from "./parts/EvergreenRidge";
import SnowField from "./parts/SnowField";
import StarField from "./parts/StarField";

const DEFAULT_FLAKES = 22;

/**
 * Christmas: cool ambient light, layered snow, a few distant sparkles and an
 * abstract evergreen horizon.
 *
 * Sequence — light fades in, snow starts drifting at different depths, sparkles
 * appear occasionally, then the scene holds as a calm loop. Under reduced
 * motion the light and the evergreen ridge stay, and every moving element is
 * removed.
 */
export default function ChristmasAnimation({ config, reducedMotion = false }: EventAnimationProps) {
  const flakeCount = reducedMotion ? 0 : (config?.particleCount ?? DEFAULT_FLAKES);
  const showEvergreen = config?.showEvergreen !== false;

  return (
    <div className="zl-ev-scene zl-ev-christmas" data-reduced={reducedMotion ? "1" : "0"}>
      <AmbientGlow tone="cool" />
      {showEvergreen ? <EvergreenRidge /> : null}
      {reducedMotion ? null : <StarField />}
      <SnowField count={flakeCount} />
    </div>
  );
}
