/**
 * Palette and small maths helpers for the festival canvas.
 *
 * The colours are the approved concept values: warm inks on the pale landing
 * page, the same hues lifted for dark mode. They are literal hex strings rather
 * than theme tokens on purpose — a firework is a light source, not a surface,
 * and it must not drift when the palette is retuned.
 */
import type { AnimationId } from "@/lib/events/animationIds";

export interface FestivalPalette {
  dark: readonly string[];
  light: readonly string[];
}

/**
 * Diwali bursts. Light-theme colours are deeper inks of the same hues so the
 * sparks stay saturated against ivory instead of washing out.
 */
export const DIWALI_PALETTE: FestivalPalette = {
  dark: ["#FFC85A", "#FF8A32", "#FF46A0", "#50DCFF", "#FFF4DC", "#FFD27A"],
  light: ["#E0560B", "#D62476", "#0089B0", "#7C3AED", "#C81E5A", "#D97706"],
};

/** Marigold petals and garland beads. */
export const MARIGOLD = ["#FF9F1C", "#FFB627", "#F77F00", "#FFC94A", "#E85D04"] as const;

/** Bulb colours for the Christmas light strings, in the approved order. */
export const BULB_COLOURS = ["#FF5A4E", "#FFC65C", "#57D68D", "#6CC4FF", "#FFF2D6"] as const;

/** Warm bokeh lights rising through the winter sky. */
export const BOKEH_COLOURS = ["#FFC65C", "#FF8A5C", "#FFE7A8", "#9FE6D2"] as const;

export function paletteFor(fest: AnimationId, dark: boolean): readonly string[] {
  if (fest === "diwali") return dark ? DIWALI_PALETTE.dark : DIWALI_PALETTE.light;
  // Christmas sparks are only used by the frozen reduced-motion frame and by
  // bulb glows, which have their own colours.
  return DIWALI_PALETTE.light;
}

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];

/** `#rrggbb` → `rgba(r,g,b,a)`. */
export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);
