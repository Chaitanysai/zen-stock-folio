import { useEffect, useRef, useState, type CSSProperties } from "react";
import { signedInr } from "@/lib/dashboard/format";

/**
 * Odometer figure.
 *
 * Every digit sits in its own fixed-width column; the column is a vertical
 * strip of digits and a change slides the strip to the new one, so digits pass
 * through the numbers between the old and the new value instead of swapping.
 * The strip runs from −9 to 19 so a roll can travel either way without ever
 * running out of digits, which is what keeps 9 → 0 and 0 → 9 continuous.
 *
 * Structural characters (₹, sign, comma) never move, and the accessible text is
 * the plain formatted amount, so the rolling columns are decorative.
 */

/** Enough digits above and below to complete any 0–9 roll in either direction. */
const STRIP = Array.from({ length: 29 }, (_, index) => index - 9);
const digitOf = (index: number) => ((index % 10) + 10) % 10;

/** Right column first, exactly as the odometer reference does it. */
const COLUMN_DELAY_MS = 45;
const isDigit = (char: string) => char >= "0" && char <= "9";

interface Slot {
  key: string;
  char: string;
  /** Digit columns carry their strip offset; structural characters do not. */
  pos: number | null;
  delay: number;
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
      slots.push({ key: `s${index}-${char}`, char, pos: null, delay: 0 });
      continue;
    }
    const target = Number(char);
    const from = previous.get(offset) ?? 0;
    const current = positions.get(offset) ?? 0;
    const steps = up ? (target - from + 10) % 10 : (from - target + 10) % 10;
    const next = reduced ? target : seedZero ? 0 : current + (up ? steps : -steps);

    positions.set(offset, next);
    slots.push({ key: `d${offset}`, char, pos: next, delay: offset * COLUMN_DELAY_MS });
  }

  return slots;
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

  // The first frame shows zero, so the figure rolls up into the real value on
  // load instead of appearing whole. Reduced motion starts at the answer.
  const [slots, setSlots] = useState<Slot[]>(() =>
    buildSlots(text, "", true, new Map(), reduced, !reduced),
  );
  // The spoken amount follows the figure, so a screen reader hears zero while the
  // tile still reads zero and the settled amount once the roll has finished.
  const [label, setLabel] = useState(() => (reduced ? text : format(0)));

  useEffect(() => {
    const up = Math.abs(value) >= previousMagnitude.current;
    const apply = () => {
      setSlots(buildSlots(text, previousText.current, up, positions.current, reduced));
      setLabel(text);
      previousText.current = text;
      previousMagnitude.current = Math.abs(value);
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
        {slots.map((slot) =>
          slot.pos === null ? (
            <span key={slot.key} className="zf-odo-fixed">{slot.char}</span>
          ) : (
            <span
              key={slot.key}
              className="zf-odo"
              data-digit={slot.char}
              style={{ "--slot": slot.pos, transitionDelay: `${slot.delay}ms` } as CSSProperties}
            >
              <span className="zf-odo-track">
                {STRIP.map((index) => (
                  <span key={index}>{digitOf(index)}</span>
                ))}
              </span>
            </span>
          ),
        )}
      </span>
    </span>
  );
}
