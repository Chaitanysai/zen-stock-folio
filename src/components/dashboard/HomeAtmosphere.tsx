import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Home atmosphere.
 *
 * A night sky behind misted glass that clears by itself into the daylight
 * dashboard — no hand, no gesture, nothing to pull. The sequence is time-driven
 * and decorative (`aria-hidden`, never focusable), so it can never block a
 * click or a screen reader.
 *
 * The timing is the point: the lights come up on the page chrome first, the sky
 * resolves second, and the cards only appear as the sky turns light. That
 * ordering is why a card is never a bright rectangle sitting on a dark page —
 * by the time one is opaque the background behind it already is.
 *
 * It plays once per browser session: the first Home mount gets the full
 * night-to-day resolve, later visits (including a reload) go straight to the
 * settled dashboard. Reduced-motion users skip it entirely, and switching the
 * setting on mid-sequence settles it immediately.
 *
 * Once daylight lands the decorative layers are unmounted rather than hidden,
 * so nothing blurred or infinite is left compositing behind the dashboard.
 */

const SEEN_KEY = "zf.home.atmosphere";

/** Night holds while the chrome fades in; dawn is the actual light resolve. */
const NIGHT_HOLD_MS = 650;
const DAWN_HOLD_MS = 1250;

type Phase = "night" | "dawn" | "day";

/** Tiles in the dissolve veil; enough to read as sections, few enough to stay soft. */
const TILES = 24;

function motionQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

function reducedMotion(): boolean {
  return motionQuery()?.matches ?? false;
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    if (phase === "day") {
      // Daylight is the end state: nothing may still be scheduled behind it.
      stopTimer();
      return;
    }
    // Chained, not two timers in one effect: a phase change re-runs the effect,
    // and its cleanup would cancel the second timer before daylight arrives.
    const next = phase === "night" ? "dawn" : "day";
    const hold = phase === "night" ? NIGHT_HOLD_MS : DAWN_HOLD_MS;
    timer.current = setTimeout(() => setPhase(next), hold);
    return stopTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopTimer only touches a ref
  }, [phase]);

  useEffect(() => {
    if (phase === "night") markSeen();
  }, [phase]);

  // The OS setting can flip while the sequence runs. Settle rather than leaving
  // a half-lit page, and let the timer effect above clear its own timeout.
  useEffect(() => {
    const query = motionQuery();
    if (!query || phase === "day") return;
    const onChange = () => {
      if (query.matches) setPhase("day");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [phase]);

  const settled = phase === "day";

  return (
    <div className="zf-atmos" data-phase={phase} data-intro="" aria-hidden="true">
      {!settled && (
        <>
          <div className="zf-atmos-sky" />
          <div className="zf-atmos-aurora" />
          <div className="zf-atmos-mist" />
          <div className="zf-atmos-veil">
            {Array.from({ length: TILES }, (_, tile) => (
              <i key={tile} style={{ "--t": tile % 6, "--r": Math.floor(tile / 6) } as CSSProperties} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
