import type { CSSProperties } from "react";

/** Number formatting shared by the dashboard. Every function takes the magnitude; callers choose the sign. */

export const sign = (n: number): string => (n >= 0 ? "+" : "−");

/** `₹1,23,456` (Indian grouping), magnitude only. */
export function inr(n: number): string {
  return `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** `₹2.1K`, `₹1.25L`, `₹1.20Cr`, magnitude only. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(a / 1e3).toFixed(1)}K`;
  return `₹${a.toFixed(0)}`;
}

/** `+₹100` / `−₹100`; zero has no sign. */
export function signedInr(n: number, formatter: (v: number) => string = inr): string {
  return Math.round(n) === 0 ? formatter(0) : `${sign(n)}${formatter(n)}`;
}

/** `+5.0%` / `−2.3%`; zero has no sign. */
export function signedPct(n: number, digits = 1): string {
  return Number(n.toFixed(digits)) === 0 ? `${(0).toFixed(digits)}%` : `${sign(n)}${Math.abs(n).toFixed(digits)}%`;
}

export const num2 = (n: number): string => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export type Tone = "up" | "down" | "flat";
export const toneOf = (n: number): Tone => (Math.round(n * 100) === 0 ? "flat" : n > 0 ? "up" : "down");

/** Entrance-animation order (`--i`), consumed by `.zf-in`. */
export const stagger = (i: number): CSSProperties => ({ "--i": i }) as CSSProperties;
