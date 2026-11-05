import { useEffect, useRef, useState } from "react";
import { signedInr } from "@/lib/dashboard/format";

/** Long enough to read as a roll, short enough that the figure lands promptly. */
const COUNT_MS = 900;

/** True when the OS asks for less motion. */
function reduceMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Decelerating curve: quick off the mark, long settle. */
const easeOut = (progress: number) => 1 - (1 - progress) ** 3;

interface AnimatedCurrencyProps {
  /** A resolved amount. Callers never pass a stand-in for missing data. */
  value: number;
  /** Override the formatter when the figure is not a signed currency amount. */
  format?: (value: number) => string;
  durationMs?: number;
}

/**
 * Counts to `value` instead of printing it.
 *
 * The first real figure rolls up from zero, and every later figure rolls from
 * the number already on screen, so a poll or a manual refresh continues from
 * where the reader left off rather than restarting at zero. Re-rendering with
 * the same value does nothing, and the single animation frame this component
 * owns is cancelled on unmount (and whenever the target changes), so a stale
 * frame can never update a dashboard that has gone away.
 *
 * The element itself only ever holds one text node: the live figure. Callers
 * reserve its width in CSS (`.zf-count`) so digits landing never reflow a card.
 */
export function AnimatedCurrency({ value, format = signedInr, durationMs = COUNT_MS }: AnimatedCurrencyProps) {
  // Reduced-motion users start at the answer; everyone else starts at zero so
  // the tile is never blank and pops into place once the figure resolves.
  const [shown, setShown] = useState(() => (reduceMotion() ? value : 0));
  const shownRef = useRef(shown);

  useEffect(() => {
    const from = shownRef.current;
    const settle = () => {
      shownRef.current = value;
      setShown(value);
    };

    // Nothing to animate: same figure, no duration, or a reduced-motion user.
    if (from === value || durationMs <= 0 || reduceMotion()) {
      settle();
      return;
    }

    let frame = 0;
    let startedAt: number | null = null;
    const step = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / durationMs);
      if (progress >= 1) {
        settle();
        return;
      }
      const next = from + (value - from) * easeOut(progress);
      shownRef.current = next;
      setShown(next);
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span className="zf-count">{format(shown)}</span>;
}
