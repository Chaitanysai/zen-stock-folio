import { useEffect, useRef, useState, type CSSProperties } from "react";
import { signedInr } from "@/lib/dashboard/format";

/**
 * Odometer figure.
 *
 * Every digit sits in its own fixed-width column; the column is a vertical
 * strip of digits and a change slides the strip to the new one, so digits pass
 * through the numbers between the old and the new value instead of swapping.
 * Positions are periodically rebased to an equivalent copy of the same digit
 * after a roll has settled. That keeps long-lived quote sessions inside the
 * rendered strip without a visible snap.
 *
 * Structural characters (₹, sign, comma) never move, and the accessible text is
 * the plain formatted amount, so the rolling columns are decorative.
 */

/** Extra headroom lets a normal 0–9 roll finish before it is quietly rebased. */
const STRIP_START = -19;
const STRIP_END = 29;
const STRIP = Array.from({ length: STRIP_END - STRIP_START + 1 }, (_, index) => STRIP_START + index);
const SAFE_MIN = -9;
const SAFE_MAX = 19;
const ROLL_MS = 620;
const COLUMN_DELAY_MS = 45;
const REBASE_BUFFER_MS = 32;
const digitOf = (index: number) => ((index % 10) + 10) % 10;

/** Right column first, exactly as the odometer reference does it. */
const isDigit = (char: string) => char >= "0" && char <= "9";

interface Slot {
  key: string;
  char: string;
  /** Digit columns carry their strip offset; structural characters do not. */
  pos: number | null;
  offset: number | null;
  delay: number;
  /** Disable the transition for an equivalent strip-position rebase. */
  rebased?: boolean;
}

/** Digit by distance from the decimal point, so a growing number keeps its columns. */
function digitsFromRight(text: string): Map<number, number> {
  const digits = new Map<number, number>();
  let offset = -1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (!isDigit(char)) continue;
    offset += 1;
    digits.set(offset, Number(char));
  }
  return digits;
}

/**
 * Build the next column layout. Positions are absolute strip indexes, kept in
 * `positions` so a fast second update continues from where the strip actually
 * is rather than snapping back.
 */
function buildSlots(
  text: string,
  previousText: string,
  up: boolean,
  positions: Map<number, number>,
  reduced: boolean,
  seedZero = false,
): Slot[] {
  const previous = digitsFromRight(previousText);
  const slots: Slot[] = [];
  // Column identity is the digit's distance from the right edge, so the ones
  // column keeps its strip when the figure grows a new leading digit.
  const offsets = new Map<number, number>();
  let running = -1;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (!isDigit(text[index])) continue;
    running += 1;
    offsets.set(index, running);
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const offset = offsets.get(index);
    if (offset === undefined) {
      slots.push({ key: `s${index}-${char}`, char, pos: null, offset: null, delay: 0 });
      continue;
    }
    const target = Number(char);
    const from = previous.get(offset) ?? 0;
    const current = previous.has(offset) ? (positions.get(offset) ?? 0) : 0;
    const steps = up ? (target - from + 10) % 10 : (from - target + 10) % 10;
    const next = reduced ? target : seedZero ? 0 : current + (up ? steps : -steps);

    positions.set(offset, next);
    slots.push({ key: `d${offset}`, char, pos: next, offset, delay: offset * COLUMN_DELAY_MS });
  }

  return slots;
}

function rebasePosition(position: number): number {
  let next = position;
  while (next > SAFE_MAX) next -= 10;
  while (next < SAFE_MIN) next += 10;
  return next;
}

function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface OdometerProps {
  /** A resolved amount. Callers never pass a stand-in for missing data. */
  value: number;
  format?: (value: number) => string;
}

export function OdometerInr({ value, format = signedInr }: OdometerProps) {
  const text = format(value);
  const reduced = useRef(reducedMotion()).current;
  const positions = useRef(new Map<number, number>());
  const previousText = useRef("");
  const previousMagnitude = useRef(0);
  const firstPaint = useRef(true);
  const rebaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rebaseFrame = useRef<number | null>(null);

  // The first frame shows zero, so the figure rolls up into the real value on
  // load instead of appearing whole. Reduced motion starts at the answer.
  const [slots, setSlots] = useState<Slot[]>(() =>
    buildSlots(text, "", true, new Map(), reduced, !reduced),
  );
  // The spoken amount follows the figure, so a screen reader hears zero while the
  // tile still reads zero and the settled amount once the roll has finished.
  const [label, setLabel] = useState(() => (reduced ? text : format(0)));

  useEffect(() => () => {
    if (rebaseTimer.current) clearTimeout(rebaseTimer.current);
    if (rebaseFrame.current !== null) cancelAnimationFrame(rebaseFrame.current);
  }, []);

  useEffect(() => {
    const clearRebase = () => {
      if (rebaseTimer.current) clearTimeout(rebaseTimer.current);
      if (rebaseFrame.current !== null) cancelAnimationFrame(rebaseFrame.current);
      rebaseTimer.current = null;
      rebaseFrame.current = null;
    };

    const scheduleRebase = (latestSlots: Slot[]) => {
      if (reduced) return;
      clearRebase();
      const lastColumnDelay = latestSlots.reduce((latest, slot) => Math.max(latest, slot.delay), 0);
      rebaseTimer.current = setTimeout(() => {
        rebaseTimer.current = null;
        let changed = false;
        for (const [offset, position] of positions.current) {
          const next = rebasePosition(position);
          if (next !== position) {
            positions.current.set(offset, next);
            changed = true;
          }
        }
        if (!changed) return;

        // Every rebased destination shows the same digit as its settled source.
        // Disabling this one transform transition makes the reset imperceptible.
        setSlots((current) => current.map((slot) => (
          slot.offset === null
            ? slot
            : { ...slot, pos: positions.current.get(slot.offset) ?? slot.pos, rebased: true }
        )));
        rebaseFrame.current = requestAnimationFrame(() => {
          rebaseFrame.current = null;
          setSlots((current) => current.map((slot) => (slot.rebased ? { ...slot, rebased: false } : slot)));
        });
      }, ROLL_MS + lastColumnDelay + REBASE_BUFFER_MS);
    };

    const up = Math.abs(value) >= previousMagnitude.current;
    const apply = () => {
      const nextSlots = buildSlots(text, previousText.current, up, positions.current, reduced);
      setSlots(nextSlots);
      setLabel(text);
      previousText.current = text;
      previousMagnitude.current = Math.abs(value);
      scheduleRebase(nextSlots);
    };

    // Wait one frame after mount so the zero state is painted before the roll.
    if (firstPaint.current) {
      firstPaint.current = false;
      const frame = requestAnimationFrame(apply);
      return () => cancelAnimationFrame(frame);
    }
    apply();
    return undefined;
  }, [text, value, reduced]);

  return (
    <span className="zf-count zf-odometer">
      <span className="zf-sr-only">{label}</span>
      <span className="zf-odo-row" aria-hidden="true">
        {slots.map((slot) => (
          slot.pos === null ? (
            <span key={slot.key} className="zf-odo-fixed">{slot.char}</span>
          ) : (
            <span key={slot.key} className="zf-odo" data-digit={slot.char}>
              {/* The delay belongs on the element that owns the transform. A
                  transition-delay on the wrapper is not inherited, so the columns
                  would all roll in lockstep instead of right-to-left. */}
              <span
                className="zf-odo-track"
                data-rebased={slot.rebased ? "" : undefined}
                style={{ "--slot": slot.pos, transitionDelay: `${slot.delay}ms` } as CSSProperties}
              >
                {STRIP.map((index) => (
                  <span key={index}>{digitOf(index)}</span>
                ))}
              </span>
            </span>
          )
        ))}
      </span>
    </span>
  );
}
