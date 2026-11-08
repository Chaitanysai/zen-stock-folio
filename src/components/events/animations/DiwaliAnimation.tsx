import type { EventAnimationProps } from "../types";
import AmbientGlow from "./parts/AmbientGlow";
import Diya from "./parts/Diya";
import LightParticles from "./parts/LightParticles";
import Rangoli from "./parts/Rangoli";

const DEFAULT_PARTICLES = 14;

/**
 * Diwali: warm light, three diyas, slow golden motes and a faint rangoli.
 *
 * Sequence — glow fades in, diyas illuminate one after another, motes begin to
 * drift, then everything settles into a low-intensity loop. Under reduced
 * motion the same composition is rendered static: lit diyas, no motes, no
 * flicker.
 */
export default function DiwaliAnimation({ config, reducedMotion = false }: EventAnimationProps) {
  const particleCount = reducedMotion ? 0 : (config?.particleCount ?? DEFAULT_PARTICLES);
  const showRangoli = config?.showRangoli !== false;

  return (
    <div className="zl-ev-scene zl-ev-diwali" data-reduced={reducedMotion ? "1" : "0"}>
      <AmbientGlow tone="warm" />
      {showRangoli ? <Rangoli /> : null}

      <div className="zl-ev-diyas">
        <Diya className="zl-ev-diya zl-ev-diya-1" delayMs={500} flameDuration="2.7s" flameDelay="-0.4s" />
        <Diya className="zl-ev-diya zl-ev-diya-2" delayMs={900} flameDuration="3.3s" flameDelay="-1.1s" />
        <Diya className="zl-ev-diya zl-ev-diya-3" delayMs={1300} flameDuration="2.2s" flameDelay="-1.8s" />
      </div>

      <LightParticles count={particleCount} />
    </div>
  );
}
