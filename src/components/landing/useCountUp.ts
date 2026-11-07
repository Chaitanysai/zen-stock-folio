import { useEffect, useState } from "react";

/**
 * Counts up to `target` once, on mount. Reduced motion, a missing rAF or a
 * non-DOM environment jumps straight to the final value, so the figure is
 * never delayed or hidden from the visitor.
 */
export function useCountUp(target: number, durationMs = 1200) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return target;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? target : 0;
  });

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof requestAnimationFrame === "undefined") {
      setValue(target);
      return;
    }

    let raf = 0;
    // Read the clock here rather than trusting the rAF timestamp: they can
    // come from different epochs (e.g. Node's global performance vs jsdom's
    // window clock), which would make `t` negative. One clock, rAF as the
    // scheduler.
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
