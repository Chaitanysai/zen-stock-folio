import { useEffect, useState, type CSSProperties } from "react";

/**
 * Home atmosphere.
 *
 * A night sky behind misted glass that clears by itself into the daylight
 * dashboard — no hand, no gesture, nothing to pull. The sequence is time-driven
 * and decorative (`aria-hidden`, never focusable), so it can never block a
 * click or a screen reader.
 *
 * It plays once per browser session: the first Home mount gets the full
 * night-to-day resolve, later visits (including a reload) go straight to the
 * settled dashboard. Reduced-motion users skip it entirely.
 */

const SEEN_KEY = "zf.home.atmosphere";

type Phase = "night" | "dawn" | "day";

/** Tiles in the dissolve veil; enough to read as sections, few enough to stay soft. */
const TILES = 24;

function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Private mode can throw on access; treating it as "seen" keeps the app usable.
    return true;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* nothing to do — the sequence simply replays next mount */
  }
}

export function HomeAtmosphere() {
  const [phase, setPhase] = useState<Phase>(() =>
    reducedMotion() || alreadySeen() ? "day" : "night",
  );

  useEffect(() => {
    if (phase === "day") return;
    // Chained, not two timers in one effect: a phase change re-runs the effect,
    // and its cleanup would cancel the second timer before daylight arrives.
    const next = phase === "night" ? "dawn" : "day";
    const hold = phase === "night" ? 620 : 1880;
    const timer = setTimeout(() => setPhase(next), hold);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "night") markSeen();
  }, [phase]);

  return (
    <div className="zf-atmos" data-phase={phase} aria-hidden="true">
      <div className="zf-atmos-sky" />
      <div className="zf-atmos-aurora" />
      <div className="zf-atmos-mist" />
      <div className="zf-atmos-veil">
        {Array.from({ length: TILES }, (_, tile) => (
          <i key={tile} style={{ "--t": tile % 6, "--r": Math.floor(tile / 6) } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
