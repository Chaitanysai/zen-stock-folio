/**
 * Theme colours for canvas charts (lightweight-charts), which cannot read CSS
 * variables. Values are resolved from the design tokens on <html> into concrete
 * `rgb()` strings, and `useChartColors` re-reads them whenever the theme class
 * on <html> changes, whoever changes it (next-themes, the pre-paint script).
 *
 * Recharts needs none of this: its SVG fills use `hsl(var(--token))` directly.
 */

import { useEffect, useState } from "react";
import type { ChartOptions, DeepPartial } from "lightweight-charts";

export interface ChartColors {
  up: string;
  down: string;
  text: string;
  grid: string;
  border: string;
  brand: string;
  ink: string;
}

const FALLBACK = {
  light: { profit: "156 70% 24%", loss: "356 70% 42%", muted: "28 8% 37%", grid: "24 14% 10% / .07", border: "36 14% 88%", brand: "16 88% 59%", ink: "24 14% 12%" },
  dark: { profit: "152 62% 56%", loss: "356 86% 68%", muted: "30 9% 66%", grid: "36 20% 100% / .07", border: "28 6% 19%", brand: "16 90% 62%", ink: "36 16% 84%" },
} as const;

function resolve(value: string, probe: HTMLElement): string {
  probe.style.color = "";
  probe.style.color = value;
  const resolved = getComputedStyle(probe).color;
  return resolved || value;
}

export function readChartColors(): ChartColors {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const fb = root.classList.contains("dark") ? FALLBACK.dark : FALLBACK.light;
  const probe = document.createElement("span");
  probe.style.display = "none";
  root.appendChild(probe);
  const token = (name: string, fallback: string) =>
    resolve(`hsl(${styles.getPropertyValue(name).trim() || fallback})`, probe);
  const colors: ChartColors = {
    up: token("--profit", fb.profit),
    down: token("--loss", fb.loss),
    text: token("--muted-foreground", fb.muted),
    grid: token("--chart-grid", fb.grid),
    border: token("--border", fb.border),
    brand: token("--brand", fb.brand),
    ink: token("--chart-ink", fb.ink),
  };
  probe.remove();
  return colors;
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readChartColors);

  useEffect(() => {
    const root = document.documentElement;
    const update = () =>
      setColors((previous) => {
        const next = readChartColors();
        return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
      });
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

/** Chart-level options that depend on the theme. Background stays transparent. */
export function chartThemeOptions(c: ChartColors): DeepPartial<ChartOptions> {
  return {
    layout: { textColor: c.text },
    grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
    rightPriceScale: { borderColor: c.border },
    timeScale: { borderColor: c.border },
  };
}

export function candleThemeOptions(c: ChartColors) {
  return {
    upColor: c.up, downColor: c.down,
    borderUpColor: c.up, borderDownColor: c.down,
    wickUpColor: c.up, wickDownColor: c.down,
  };
}
