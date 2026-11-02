# UI/UX Refinement Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the six approved UI/UX refinements (chart axis fix, accent picker, sector meter, skeletons, Groww/Zerodha tiles, per-stock close charts) on a preview deployment without touching production.

**Architecture:** Mostly in-place refinements of existing dashboard components. Two new pure modules (chart time axis, accent tokens) and two new hooks (`useAccent`, `useCandleHistory`) keep logic testable. New UI is composed from existing Radix/Tailwind/Lightweight-Charts primitives; no new runtime dependencies.

**Tech Stack:** React 18.3, TypeScript, Vite 5.4, Tailwind 3.4, shadcn/Radix, lightweight-charts 5.1, Recharts, next-themes, Vitest 3, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-ui-ux-refinement-batch-1-design.md`

## Global Constraints

- Do **not** stage, commit, push, merge, or deploy to production. Preview deployment only, after local validation.
- Preserve the 63 existing uncommitted entries in the worktree; never reset/clean the repo.
- Do not modify authentication internals, Firebase config, Firestore rules/indexes, Cloudflare secrets, broker encryption/registration, portfolio calculations unrelated to visualization, or market-data provider architecture.
- No new runtime dependencies. Reuse existing `ui/popover`, `ui/slider`, `ui/skeleton`, `ui/tooltip`.
- All user-facing times use `Asia/Kolkata`; all financial values use existing `inr`/`compact` helpers.
- Respect `prefers-reduced-motion`; no layout shift between skeleton and content; dark and light themes both required.
- Every step's command must actually be run; report real output. Authenticated views are unverified unless a real session is available.
- Work only in `E:\Projects\Zen-Stock-Folio\worktrees\obsidian` (branch `feat/obsidian-dashboard`). The brief's `E:\Projects\Stock-Tracker\obsidian` path is an empty stub.
- Leave the `ui-ux`, `app`, `api-integration` and `indmoney-obsidian` worktrees untouched.

---

### Task 1: Chart axis alignment (Modification 1)

**Files:**
- Create: `src/lib/charts/timeAxis.ts`
- Test: `src/lib/charts/timeAxis.test.ts`
- Modify: `src/components/MarketCandlestick.tsx` (options init ~88-95, fetch effect ~122-151)
- Modify: `src/components/PortfolioCharts.tsx` (options ~74-87, observer ~97-106)

**Interfaces:**
- Produces: `isIntradayResolution(resolution: CandleResolution): boolean`, `formatIstTick(timeSeconds: number, resolution: CandleResolution): string`, `chartTimeAxisOptions(resolution: CandleResolution): { timeScale: {...}; localization: {...} }`.
- Consumes: `CandleResolution` from `@/lib/market-data/types`; `RANGE_PRESETS` from `@/lib/market-data/freshness`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/charts/timeAxis.test.ts
import { describe, expect, it } from "vitest";
import { chartTimeAxisOptions, formatIstTick, isIntradayResolution } from "./timeAxis";

// 2024-11-01T03:45:00Z === 09:15 IST on 01 Nov
const T = 1730432700;

describe("chart time axis", () => {
  it("classifies intraday resolutions", () => {
    expect(isIntradayResolution("1m")).toBe(true);
    expect(isIntradayResolution("5m")).toBe(true);
    expect(isIntradayResolution("15m")).toBe(true);
    expect(isIntradayResolution("1d")).toBe(false);
  });

  it("formats intraday ticks in IST, not UTC", () => {
    expect(formatIstTick(T, "5m")).toBe("09:15");
  });

  it("formats daily ticks with the IST date", () => {
    expect(formatIstTick(T, "1d")).toBe("01 Nov");
  });

  it("shows time only for intraday series", () => {
    expect(chartTimeAxisOptions("5m").timeScale.timeVisible).toBe(true);
    expect(chartTimeAxisOptions("1d").timeScale.timeVisible).toBe(false);
    expect(chartTimeAxisOptions("1d").timeScale.secondsVisible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/charts/timeAxis.test.ts`
Expected: FAIL — cannot resolve `./timeAxis`.

- [ ] **Step 3: Implement the pure module**

```ts
// src/lib/charts/timeAxis.ts
import type { CandleResolution } from "@/lib/market-data/types";

const INTRADAY: CandleResolution[] = ["1m", "5m", "15m"];

export const isIntradayResolution = (resolution: CandleResolution): boolean =>
  INTRADAY.includes(resolution);

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
});

export function formatIstTick(timeSeconds: number, resolution: CandleResolution): string {
  const date = new Date(timeSeconds * 1000);
  return isIntradayResolution(resolution) ? TIME_FMT.format(date) : DATE_FMT.format(date);
}

export function chartTimeAxisOptions(resolution: CandleResolution) {
  return {
    timeScale: {
      timeVisible: isIntradayResolution(resolution),
      secondsVisible: false,
      tickMarkFormatter: (time: number) => formatIstTick(time, resolution),
    },
    localization: {
      timeFormatter: (time: number) => formatIstTick(time, resolution),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/charts/timeAxis.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Wire both chart components**

In `MarketCandlestick.tsx`:
1. Initial options: replace the fixed `timeScale` block with `...chartTimeAxisOptions(RANGE_PRESETS[range].resolution)`.
2. After `const envelope = await fetchCandles(...)` (inside the success path, before `setData`), call:
```ts
chart.applyOptions(chartTimeAxisOptions(envelope.resolution));
```
3. Keep `chart.applyOptions({ layout: {...chartThemeOptions(colors)} })` behaviour.
4. Verify `range` is in the fetch effect's dependency list; do not add it to the chart-creation effect.

In `PortfolioCharts.tsx`:
1. Replace `timeVisible: range === "1d"` with `...chartTimeAxisOptions(RANGE_PRESETS[range].resolution)`.
2. After data resolves, call `chart.applyOptions(chartTimeAxisOptions(envelope.resolution))`.
3. Fix the leak: declare `let observer: ResizeObserver | null = null;` inside the effect; return `() => { observer?.disconnect(); chart.remove(); }` from the effect itself, not from the async IIFE.

- [ ] **Step 6: Verify chart suite and typecheck**

Run: `npx vitest run src/components/MarketCandlestick.test.tsx src/pages/Index.test.tsx && npx tsc -p tsconfig.app.json --noEmit`
Expected: all pass, no type errors. If the lightweight-charts mock lacks `applyOptions`, add `applyOptions: vi.fn()` to the mock.

Do not commit.

---

### Task 2: Accent token engine (Modification 2, part A)

**Files:**
- Create: `src/lib/theme/accent.ts`
- Test: `src/lib/theme/accent.test.ts`
- Create: `src/hooks/useAccent.ts`
- Modify: `index.html` (pre-paint script after the existing theme script)
- Modify: `src/hooks/useChartTheme.ts` (observer attribute filter)

**Interfaces:**
- Produces:
  - `interface Accent { h: number; s: number; l: number }`
  - `DEFAULT_ACCENT`, `ACCENT_STORAGE_KEY`, `ACCENT_TOKENS` (readonly string[])
  - `parseAccent(raw: string | null): Accent | null`
  - `hexToAccent(hex: string): Accent | null`, `accentToHex(a: Accent): string`
  - `formatHsl(a: Accent): string`, `formatRgb(a: Accent): string`
  - `accentTokens(a: Accent, theme: "light" | "dark"): Record<string, string>`
  - `useAccent(): { accent: Accent; setAccent(a: Accent): void; reset(): void }`
- Storage shape: `localStorage["zf-accent"] = JSON.stringify({ accent, light, dark })` where `light`/`dark` are the token maps.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/theme/accent.test.ts
import { describe, expect, it } from "vitest";
import {
  ACCENT_TOKENS, accentToHex, accentTokens, DEFAULT_ACCENT, hexToAccent, parseAccent,
} from "./accent";

describe("accent tokens", () => {
  it("parses only valid objects", () => {
    expect(parseAccent(JSON.stringify({ h: 210, s: 80, l: 50 }))).toEqual({ h: 210, s: 80, l: 50 });
    expect(parseAccent("not json")).toBeNull();
    expect(parseAccent(JSON.stringify({ h: 400, s: 80, l: 50 }))).toBeNull();
  });

  it("round-trips hex", () => {
    expect(accentToHex({ h: 0, s: 100, l: 50 })).toBe("#ff0000");
    const back = hexToAccent("#ff0000");
    expect(back?.h).toBe(0);
    expect(back?.s).toBe(100);
    expect(back?.l).toBe(50);
  });

  it("derives every registered token and never touches profit/loss", () => {
    const light = accentTokens({ h: 210, s: 80, l: 50 }, "light");
    for (const token of ACCENT_TOKENS) expect(light[token]).toBeTruthy();
    expect(light["--profit"]).toBeUndefined();
    expect(light["--loss"]).toBeUndefined();
    expect(light["--brand"]).toBe("210 80% 50%");
    expect(light["--chart-1"]).toBe("210 80% 50%");
  });

  it("chooses a readable foreground for light and dark accents", () => {
    expect(accentTokens({ h: 50, s: 95, l: 62 }, "light")["--brand-foreground"]).toBe("24 14% 10%");
    expect(accentTokens({ h: 220, s: 85, l: 35 }, "light")["--brand-foreground"]).toBe("0 0% 100%");
  });

  it("keeps the default brand close to today's orange", () => {
    expect(DEFAULT_ACCENT).toEqual({ h: 16, s: 88, l: 59 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/theme/accent.test.ts`
Expected: FAIL — cannot resolve `./accent`.

- [ ] **Step 3: Implement the pure module**

```ts
// src/lib/theme/accent.ts
export interface Accent { h: number; s: number; l: number }
export type AccentTheme = "light" | "dark";

export const ACCENT_STORAGE_KEY = "zf-accent";
export const DEFAULT_ACCENT: Accent = { h: 16, s: 88, l: 59 };

export const ACCENT_PRESETS: { id: string; label: string; accent: Accent }[] = [
  { id: "ember", label: "Ember", accent: DEFAULT_ACCENT },
  { id: "teal", label: "Teal", accent: { h: 174, s: 72, l: 38 } },
  { id: "emerald", label: "Emerald", accent: { h: 152, s: 62, l: 36 } },
  { id: "blue", label: "Blue", accent: { h: 214, s: 78, l: 48 } },
  { id: "violet", label: "Violet", accent: { h: 262, s: 68, l: 52 } },
  { id: "rose", label: "Rose", accent: { h: 344, s: 74, l: 50 } },
];

export const ACCENT_TOKENS = [
  "--brand", "--brand-strong", "--brand-ink", "--brand-foreground", "--on-brand",
  "--ring", "--accent", "--accent-foreground", "--shadow-brand", "--grad-brand",
  "--glass-sheen", "--atmosphere", "--chart-1",
] as const;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n);

export function parseAccent(raw: string | null): Accent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Accent>;
    if (typeof value.h !== "number" || typeof value.s !== "number" || typeof value.l !== "number") return null;
    if (value.h < 0 || value.h > 360 || value.s < 0 || value.s > 100 || value.l < 0 || value.l > 100) return null;
    return { h: round(value.h), s: round(value.s), l: round(value.l) };
  } catch { return null; }
}

export function accentToHex({ h, s, l }: Accent): string {
  const sat = s / 100, light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (n: number) => round(f(n) * 255).toString(16).padStart(2, "0");
  return `#${to(0)}${to(8)}${to(4)}`;
}

export function hexToAccent(hex: string): Accent | null {
  const value = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: round((h + 360) % 360), s: round(s * 100), l: round(l * 100) };
}

export const formatHsl = (a: Accent) => `hsl(${a.h} ${a.s}% ${a.l}%)`;
export const formatRgb = (a: Accent) => {
  const hex = accentToHex(a);
  return `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
};

function luminanceAccent(a: Accent): number {
  const hex = accentToHex(a);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const darkInk = "24 14% 10%";
const lightInk = "0 0% 100%";

export function accentTokens(a: Accent, theme: AccentTheme): Record<string, string> {
  const h = clamp(a.h, 0, 360);
  const s = clamp(a.s, 0, 100);
  const l = theme === "light" ? clamp(a.l, 34, 62) : clamp(a.l, 46, 70);
  const strongL = theme === "light" ? Math.max(30, l - 17) : Math.max(34, Math.min(l, 48));
  const inkL = theme === "light" ? Math.max(22, l - 24) : Math.min(80, l + 12);
  const ringL = theme === "light" ? Math.max(28, l - 13) : Math.min(78, l + 4);
  const foreground = luminanceAccent({ h, s, l }) > 0.42 ? darkInk : lightInk;
  const tintL = theme === "light" ? 95 : 16;
  return {
    "--brand": `${h} ${s}% ${l}%`,
    "--brand-strong": `${h} ${s}% ${strongL}%`,
    "--brand-ink": `${h} ${s}% ${inkL}%`,
    "--brand-foreground": foreground,
    "--on-brand": foreground,
    "--ring": `${h} ${s}% ${ringL}%`,
    "--accent": `${h} ${Math.round(s * 0.55)}% ${tintL}%`,
    "--accent-foreground": `${h} ${s}% ${inkL}%`,
    "--shadow-brand": `0 22px 40px -22px hsl(${h} ${s}% ${strongL}% / .65)`,
    "--grad-brand": `linear-gradient(135deg, hsl(${h} ${s}% ${Math.max(24, l - 16)}%) 0%, hsl(${(h + 356) % 360} ${s}% ${Math.max(20, l - 23)}%) 100%)`,
    "--glass-sheen": `radial-gradient(120% 90% at 0% 0%, hsl(${h} ${s}% ${l}% / .20), transparent 60%), linear-gradient(160deg, hsl(0 0% 100% / .65), hsl(${h} 80% 96% / 0) 55%)`,
    "--atmosphere": `radial-gradient(46rem 28rem at 88% -6%, hsl(${h} ${s}% ${l}% / .14), transparent 62%), radial-gradient(40rem 26rem at -4% 4%, hsl(${h} 80% ${theme === "light" ? 78 : 30}% / .16), transparent 60%), radial-gradient(36rem 24rem at 50% 112%, hsl(${h} ${s}% ${l}% / .06), transparent 62%)`,
    "--chart-1": `${h} ${s}% ${l}%`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/theme/accent.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Implement `useAccent` and pre-paint**

`src/hooks/useAccent.ts`:
```ts
import { useCallback, useEffect, useState } from "react";
import {
  ACCENT_STORAGE_KEY, ACCENT_TOKENS, DEFAULT_ACCENT, accentTokens, parseAccent, type Accent,
} from "@/lib/theme/accent";

interface StoredAccent { accent: Accent; light: Record<string, string>; dark: Record<string, string> }

const readStored = (): Accent => {
  try { return parseAccent(JSON.parse(localStorage.getItem(ACCENT_STORAGE_KEY) ?? "null")?.accent ? JSON.stringify(JSON.parse(localStorage.getItem(ACCENT_STORAGE_KEY)!).accent) : null) ?? DEFAULT_ACCENT; }
  catch { return DEFAULT_ACCENT; }
};

const apply = (tokens: Record<string, string>) => {
  const root = document.documentElement;
  for (const name of ACCENT_TOKENS) {
    const value = tokens[name];
    if (value) root.style.setProperty(name, value); else root.style.removeProperty(name);
  }
  root.dataset.accent = "custom";
};

export function useAccent() {
  const [accent, setAccentState] = useState<Accent>(readStored);

  const persist = useCallback((next: Accent) => {
    const stored: StoredAccent = { accent: next, light: accentTokens(next, "light"), dark: accentTokens(next, "dark") };
    localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify(stored));
    setAccentState(next);
    apply(document.documentElement.classList.contains("dark") ? stored.dark : stored.light);
    window.dispatchEvent(new Event("zf-accent"));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(ACCENT_STORAGE_KEY);
    for (const name of ACCENT_TOKENS) document.documentElement.style.removeProperty(name);
    document.documentElement.removeAttribute("data-accent");
    setAccentState(DEFAULT_ACCENT);
    window.dispatchEvent(new Event("zf-accent"));
  }, []);

  useEffect(() => {
    const sync = () => setAccentState(readStored());
    window.addEventListener("storage", sync);
    window.addEventListener("zf-accent", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("zf-accent", sync); };
  }, []);

  useEffect(() => {
    apply(document.documentElement.classList.contains("dark") ? accentTokens(accent, "dark") : accentTokens(accent, "light"));
  }, [accent]);

  return { accent, setAccent: persist, reset };
}
```

`index.html`: after the existing theme boot script add this script (single line block):
```html
<script>
  try {
    var raw = localStorage.getItem("zf-accent");
    if (raw) {
      var s = JSON.parse(raw);
      var map = document.documentElement.classList.contains("dark") ? s.dark : s.light;
      if (map) {
        for (var k in map) document.documentElement.style.setProperty(k, map[k]);
        document.documentElement.setAttribute("data-accent", "custom");
      }
    }
  } catch (e) {}
</script>
```

`useChartTheme.ts:69`: `observer.observe(root, { attributes: true, attributeFilter: ["class", "data-accent"] });`

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/theme/accent.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: pass.

Do not commit.

---

### Task 3: Accent picker UI (Modification 2, part B)

**Files:**
- Create: `src/components/AccentPicker.tsx`
- Modify: `src/components/dashboard/Shell.tsx` (rail theme group ~113-123; mobile sheet ~360-370)
- Modify: `src/styles/dashboard.css` (picker styles)

**Interfaces:**
- Consumes: `useAccent`, `ACCENT_PRESETS`, `accentToHex`, `formatHsl`, `formatRgb`, `hexToAccent`, `parseAccent`-validated input.
- Produces: `<AccentPicker />` self-contained; syncs across instances via the `zf-accent` window event.

- [ ] **Step 1: Build the component**

Markup contract:
- Trigger: `button.zf-rbtn` with `Palette` lucide icon, `aria-label="Accent colour"`, `aria-haspopup="dialog"`.
- `PopoverContent` (align end, width 280) with:
  - Header "Accent colour" and a Reset text button.
  - Preset grid: `ACCENT_PRESETS.map` → button with `aria-label={label}`, `aria-pressed`, 24px swatch styled `background: hsl(h s% l%)`.
  - Custom row: `<input type="color">` (aria-label "Pick a colour") + text input for hex with `pattern="#?[0-9a-fA-F]{6}"`, maxLength 7; on change, if `hexToAccent` returns non-null call `setAccent`.
  - Readouts: `formatHsl(accent)`, `formatRgb(accent)` in monospace.
  - Preview chip showing `Aa` on `hsl(var(--brand))` with `color: hsl(var(--brand-foreground))`.
- Keyboard: Radix popover handles Escape/focus return; inputs have labels. No opacity control (accent fills must stay opaque).
- Invalid hex: keep the typed text, show `aria-invalid="true"` and a small "Use #RRGGBB" hint; do not change the applied accent.

Render `<AccentPicker />`:
- In `Rail`, inside `.zf-theme` after the Moon button.
- In the mobile `Sheet` theme block, after the theme control.

- [ ] **Step 2: Write the component test**

```tsx
// src/components/AccentPicker.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import AccentPicker from "./AccentPicker";
import { ACCENT_STORAGE_KEY } from "@/lib/theme/accent";

describe("AccentPicker", () => {
  beforeEach(() => localStorage.clear());

  it("applies a preset and persists it", () => {
    render(<AccentPicker />);
    fireEvent.click(screen.getByLabelText("Accent colour"));
    fireEvent.click(screen.getByLabelText("Teal"));
    const stored = JSON.parse(localStorage.getItem(ACCENT_STORAGE_KEY) ?? "null");
    expect(stored.accent).toEqual({ h: 174, s: 72, l: 38 });
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("174 72% 38%");
  });
});
```

- [ ] **Step 3: Run test (expect fail), implement, re-run**

Run: `npx vitest run src/components/AccentPicker.test.tsx`
Expected first: FAIL (module missing). After implementation: PASS.

- [ ] **Step 4: Add CSS**

```css
.zf-accent-pop { width: 280px; }
.zf-accent-presets { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.zf-accent-swatch { width: 28px; height: 28px; border-radius: 999px; border: 2px solid transparent; cursor: pointer; }
.zf-accent-swatch[aria-pressed="true"] { border-color: hsl(var(--foreground)); box-shadow: 0 0 0 2px hsl(var(--card)); }
.zf-accent-custom { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
.zf-accent-custom input[type="color"] { width: 34px; height: 34px; padding: 0; border: 0; background: none; }
.zf-accent-readout { font: 500 11px var(--ff-mono); color: hsl(var(--muted-foreground)); }
.zf-accent-preview { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 30px;
  border-radius: 8px; background: hsl(var(--brand)); color: hsl(var(--brand-foreground)); font: 700 13px var(--ff-body); }
```

- [ ] **Step 5: Verify picker + theme persistence**

Run: `npx vitest run src/components/AccentPicker.test.tsx src/pages/Index.test.tsx`
Expected: pass; the existing `localStorage.theme` assertion is untouched.

Do not commit.

---

### Task 4: Sector concentration meter (Modification 3)

**Files:**
- Create: `src/lib/portfolio/sectorMeter.ts`
- Test: `src/lib/portfolio/sectorMeter.test.ts`
- Modify: `src/components/dashboard/Sections.tsx` `SectorCard` (lines 15-67)
- Rewrite: `src/components/SectorDiversification.tsx` (remove Recharts donut)
- Modify: `src/styles/dashboard.css` (meter)

**Interfaces:**
- Consumes: `SectorSlice { sector: string; value: number; percentage: number }` (keep it exported from `Sections.tsx`; the helper uses a structural subset `Pick<SectorSlice, "sector" | "value" | "percentage">`).
- Produces: `SectorMeterSegment { id: string; label: string; pct: number; widthPct: number; colorIndex: number; color: string; isOther: boolean }`, `buildSectorSegments(slices, minPct?: number): SectorMeterSegment[]`, `CONCENTRATION_PCT = 40`, `isConcentrated(slices): boolean`, `SECTOR_COLORS` (6 CSS var strings).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portfolio/sectorMeter.test.ts
import { describe, expect, it } from "vitest";
import { buildSectorSegments, isConcentrated } from "./sectorMeter";

const slices = [
  { sector: "Financials", value: 50000, percentage: 50 },
  { sector: "IT", value: 30000, percentage: 30 },
  { sector: "Other", value: 20000, percentage: 20 },
];

describe("sector meter", () => {
  it("keeps true percentage widths and order", () => {
    const segments = buildSectorSegments(slices);
    expect(segments.map((s) => s.widthPct)).toEqual([50, 30, 20]);
    expect(segments.map((s) => s.label)).toEqual(["Financials", "IT", "Other"]);
    expect(segments[2].isOther).toBe(true);
  });

  it("marks tiny slices without changing their percentage", () => {
    const segments = buildSectorSegments([
      { sector: "A", value: 99, percentage: 99.4 },
      { sector: "B", value: 1, percentage: 0.6 },
    ]);
    expect(segments[1].pct).toBe(0.6);
    expect(segments[1].widthPct).toBe(0.6);
    expect(segments[1].colorIndex).toBe(1);
  });

  it("flags concentration at 40% or more", () => {
    expect(isConcentrated(slices)).toBe(true);
    expect(isConcentrated([{ sector: "A", value: 39, percentage: 39 }, { sector: "B", value: 61, percentage: 61 }])).toBe(false);
    expect(isConcentrated([])).toBe(false);
  });

  it("returns no segments for an empty portfolio", () => {
    expect(buildSectorSegments([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (expect fail), implement**

```ts
// src/lib/portfolio/sectorMeter.ts
export const SECTOR_COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted-foreground))",
] as const;

export const CONCENTRATION_PCT = 40;

type Slice = { sector: string; value: number; percentage: number };
export interface SectorMeterSegment {
  id: string; label: string; pct: number; widthPct: number;
  colorIndex: number; color: string; isOther: boolean;
}

export function buildSectorSegments(slices: Slice[]): SectorMeterSegment[] {
  return slices.map((slice, index) => ({
    id: slice.sector,
    label: slice.sector,
    pct: slice.percentage,
    widthPct: slice.percentage,
    colorIndex: index,
    color: SECTOR_COLORS[index % SECTOR_COLORS.length],
    isOther: slice.sector === "Other",
  }));
}

export function isConcentrated(slices: Slice[]): boolean {
  const top = slices[0];
  return Boolean(top && top.percentage >= CONCENTRATION_PCT);
}
```

Run: `npx vitest run src/lib/portfolio/sectorMeter.test.ts` → 4 passed.

- [ ] **Step 3: Rebuild `SectorCard` overview**

Replace the single progress bar + top-5 bars with:
```tsx
<p className="zf-label">Invested across {sectors.length} sectors</p>
<div className="zf-meter" role="img" aria-label={`Sector allocation: ${segments.map(s => `${s.label} ${s.pct.toFixed(1)}%`).join(", ")}`}>
  {segments.map((s) => (
    <span key={s.id} className="zf-meter-seg" data-other={s.isOther || undefined}
      style={{ width: `max(2px, ${s.widthPct}%)`, background: s.color }}
      title={`${s.label} · ${s.pct.toFixed(1)}%`} />
  ))}
</div>
<ul className="zf-sector-legend" aria-label="Sector allocation">
  {segments.map((s) => (
    <li key={s.id}><span className="zf-legend-dot" style={{ background: s.color }} aria-hidden="true" />
      <span className="zf-sector-name">{s.label}</span>
      <span className="zf-sector-pct">{s.pct.toFixed(1)}%</span></li>
  ))}
</ul>
{isConcentrated(sectors) && <p className="zf-conc-badge">Concentrated · {sectors[0].sector} {sectors[0].percentage.toFixed(0)}%</p>}
<p className="zf-prog-meta"><span>{compact(totalInvested)} invested</span><span>100% of active holdings</span></p>
```
`totalInvested = sectors.reduce((sum, s) => sum + s.value, 0)`. Keep the "Sector details" link and loading/empty states. Keep `stagger(6)`.

- [ ] **Step 4: Rebuild `SectorDiversification`**

Delete the Recharts imports and donut. Render a larger `.zf-meter.zf-meter-lg` (height 18px, rounded), the same legend list with values in `₹` via `toLocaleString("en-IN")` and percentages, and the concentration badge. Keep the empty state and title. Add `aria-label` per segment (`Sector, x% of invested value`).

- [ ] **Step 5: CSS**

```css
.zf-meter { display: flex; width: 100%; height: 12px; border-radius: 999px; overflow: hidden; background: hsl(var(--surface-3)); }
.zf-meter-lg { height: 18px; }
.zf-meter-seg { height: 100%; min-width: 2px; }
.zf-meter-seg[data-other] { opacity: .55; }
.zf-sector-legend { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 6px; }
.zf-sector-legend li { display: flex; align-items: center; gap: 8px; }
.zf-legend-dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.zf-conc-badge { display: inline-flex; margin: 10px 0 0; padding: 3px 10px; border-radius: 999px;
  font: 600 11px var(--ff-body); color: hsl(var(--warning)); background: hsl(var(--warning) / .10);
  border: 1px solid hsl(var(--warning) / .28); }
```

- [ ] **Step 6: Verify**

Run: `npx vitest run src/lib/portfolio/sectorMeter.test.ts src/lib/portfolio/calculations.test.ts src/pages/Index.test.tsx`
Expected: pass. No Recharts import remains in `SectorDiversification.tsx` (`grep -n "recharts" src/components/SectorDiversification.tsx` → no output).

Do not commit.

---

### Task 5: Skeleton primitives and dashboard skeleton (Modification 4, part A)

**Files:**
- Rewrite: `src/components/ui/skeleton.tsx`
- Create: `src/components/dashboard/DashboardSkeleton.tsx`
- Modify: `src/styles/dashboard.css`

**Interfaces:**
- Produces:
  - `<Skeleton className width height radius />` and `<SkeletonText lines widths />`
  - `<DashboardSkeleton label="Loading your dashboard" />`
- All primitives are `aria-hidden` except the wrapper, which carries `role="status"` and a visually hidden label.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/DashboardSkeleton.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardSkeleton } from "./DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("announces loading once and hides decorative blocks", () => {
    const { container } = render(<DashboardSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your dashboard");
    expect(container.querySelectorAll(".zf-skeleton-block").length).toBeGreaterThan(8);
    for (const node of container.querySelectorAll(".zf-skeleton-block")) {
      expect(node.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

Run: `npx vitest run src/components/dashboard/DashboardSkeleton.test.tsx`
Expected: FAIL — missing module.

- [ ] **Step 3: Implement**

`ui/skeleton.tsx`:
```tsx
import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

export function Skeleton({ className, width, height, radius, style, ...props }:
  React.HTMLAttributes<HTMLDivElement> & { width?: string | number; height?: string | number; radius?: string | number }) {
  const merged: CSSProperties = { width, height, borderRadius: radius, ...style };
  return <div aria-hidden="true" className={cn("zf-skeleton-block", className)} style={merged} {...props} />;
}

export function SkeletonText({ lines = 3, widths = ["100%", "92%", "64%"] }:
  { lines?: number; widths?: string[] }) {
  return <div aria-hidden="true" className="zf-skeleton-text">
    {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={12} width={widths[i % widths.length]} radius={4} />)}
  </div>;
}
```

`DashboardSkeleton.tsx`: a `role="status"` wrapper with `<span className="zf-sr-only">Loading your dashboard</span>` and this grid:
- `.zf-shell-skel` → 64px rail column (three 40px circles) + top bar (brand block, three pill blocks, one circle).
- `.zf-main-skel` → page-head title blocks (320×40, 220×16), a 4-card summary row, a wide holdings card with 6 rows of 56px, and a right column with 3 stacked cards. Use `Skeleton` for every block; every block has class `zf-skeleton-block` so the test counts them.

- [ ] **Step 4: CSS**

```css
.zf-skeleton-block { position: relative; overflow: hidden; border-radius: 8px; background: hsl(var(--surface-3)); }
.zf-skeleton-block::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, hsl(var(--card) / .55), transparent);
  animation: zf-shimmer 1.5s ease-in-out infinite;
}
.zf-skeleton-text { display: flex; flex-direction: column; gap: 8px; }
@keyframes zf-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .zf-skeleton-block::after { animation: none; opacity: 0; } }
.zf-shell-skel { display: grid; grid-template-columns: 64px 1fr; gap: 16px; padding: 16px; }
.zf-main-skel { display: flex; flex-direction: column; gap: 16px; }
.zf-skel-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 900px) { .zf-skel-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/components/dashboard/DashboardSkeleton.test.tsx`
Expected: pass.

Do not commit.

---

### Task 6: Sign-in transition and dashboard skeletons (Modification 4, part B)

**Files:**
- Modify: `src/pages/Login.tsx` (submit + Google handlers, render branch)
- Modify: `src/App.tsx` (lazy fallback)
- Modify: `src/pages/Index.tsx` (initial-data skeletons for summary/holdings/market strip/sector/brokers)
- Modify: `src/components/MarketIndexStrip.tsx` (loading block)
- Modify: `src/components/dashboard/Summary.tsx`, `Holdings.tsx`, `Brokers.tsx` (only their loading visuals)

**Interfaces:**
- Consumes: `DashboardSkeleton`, `Skeleton`, `SkeletonText`.
- Login view state: `type AuthPhase = "idle" | "submitting" | "google"`; `const [phase, setPhase] = useState<AuthPhase>("idle")`; `transitioning = phase !== "idle"`.
- No changes to `AuthContext`, `signIn`, `signInWithGoogle`, redirect targets, or error strings.

- [ ] **Step 1: Login transition**

In `handleSubmit`, after client validation and before `await signIn(...)`, call `setPhase("submitting")`. In `handleGoogle`, call `setPhase("google")` before the popup call. In `catch`, `setPhase("idle")` then keep the existing `setError(friendlyError(error))`. On success the existing `navigate(from)` runs.

Render branch: if `transitioning` and there is no inline error, return `<DashboardSkeleton label="Signing you in" />` instead of the form card. Keep the page background/brand chrome. Do not render the old "Please wait..." button state while the skeleton is visible; the skeleton replaces the form entirely.

- [ ] **Step 2: App fallback**

`App.tsx`: replace the `<Suspense fallback={<SessionLoading />}>` around `<Index />` with `<Suspense fallback={<DashboardSkeleton />}>`. Leave `SessionLoading` in place for `ProtectedRoute` and other routes (it still covers non-dashboard auth checks).

- [ ] **Step 3: Dashboard initial-data skeletons**

- Summary cards: when `loading`, render `SkeletonText` at the final text heights plus a 32px value block; keep card dimensions.
- Holdings: when `loading`, render 6 rows each with a 36px circle, a 40% line, a 20% line and a right-aligned number block.
- Market strip: when state is `loading`, render three `Skeleton` pills at 96px × 14px.
- Sector card: already has `Skel`; switch to `Skeleton` for the meter track and two legend rows.
- Broker tiles: when fetching connections, render two tile-shaped skeletons (logo 40px, two lines, button 96px × 32px).

Do not replace the background refresh indicators (`zf-price-clock`, TopBar refresh) — those keep existing content.

- [ ] **Step 4: Add a test for the transition**

```tsx
// src/pages/Login.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Login from "./Login";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ signIn: vi.fn(() => new Promise(() => {})), signInWithGoogle: vi.fn(), isLoading: false, user: null, isAuthenticated: false }),
}));

vi.mock("@/components/RouteTransition", () => ({ RouteLink: ({ children }: any) => children }));

describe("Login skeleton transition", () => {
  it("shows the dashboard skeleton immediately on submit", async () => {
    render(<Login />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Signing you in"));
  });
});
```

Run: `npx vitest run src/pages/Login.test.tsx` → pass. Adjust label queries to the page's actual labels if they differ; do not weaken the assertion.

- [ ] **Step 5: Full skeleton verification**

Run: `npx vitest run src/pages/Login.test.tsx src/pages/Index.test.tsx src/components/dashboard/DashboardSkeleton.test.tsx`
Expected: pass; no auth test changes.

Do not commit.

---

### Task 7: Groww and Zerodha tiles (Modification 5)

**Files:**
- Create: `src/lib/brokers/branding.ts`
- Test: `src/lib/brokers/branding.test.ts`
- Create: `src/components/dashboard/BrokerTile.tsx`
- Test: `src/components/dashboard/BrokerTile.test.tsx`
- Modify: `src/components/dashboard/Brokers.tsx` (supported-brokers grid; reuse existing handlers)
- Modify: `src/styles/dashboard.css`
- Create assets: `public/brand/zerodha.svg`, `public/brand/groww.svg` (or verified PNG)

**Interfaces:**
- Produces:
  - `interface BrokerBrand { displayName: string; tagline: string; brandColor: string; logo: string | null; logoAlt: string }`
  - `BROKER_BRANDING: Record<BrokerProviderId, BrokerBrand>`
  - `BrokerTileState = "setup" | "connect" | "connecting" | "connected" | "attention"`
  - `brokerTileState(provider: BrokerProviderPublic, connection: BrokerConnectionPublic | null): BrokerTileState`
  - `<BrokerTile provider connection onAction />` where `onAction: (state: BrokerTileState) => void`.

- [ ] **Step 1: Obtain authentic assets**

Run these checks and keep only files that return real brand artwork:
```bash
curl -fsSL -o public/brand/zerodha.svg https://zerodha.com/static/images/logo.svg && head -c 200 public/brand/zerodha.svg
curl -fsSL -o public/brand/groww.svg https://groww.in/images/logo.svg && head -c 200 public/brand/groww.svg
```
If a URL 404s or returns HTML, use `ImageSearch` for the provider's official logo and download the original from the provider's own domain only. If no authentic source is confirmed, set `logo: null` for that provider and render the wordmark; never approximate the mark.

- [ ] **Step 2: Write branding tests**

```ts
// src/lib/brokers/branding.test.ts
import { describe, expect, it } from "vitest";
import { BROKER_BRANDING, brokerTileState } from "./branding";

const provider = { id: "groww", enabled: true, setupIssues: [] } as any;
const connection = (status: string) => ({ status, updatedAt: "2026-11-01T00:00:00Z" }) as any;

describe("broker branding", () => {
  it("brands Groww and Zerodha", () => {
    expect(BROKER_BRANDING.groww.displayName).toBe("Groww");
    expect(BROKER_BRANDING.zerodha.displayName).toBe("Zerodha");
    expect(BROKER_BRANDING.groww.brandColor).toMatch(/^#/);
  });

  it("maps real states without inventing connection", () => {
    expect(brokerTileState(provider, null)).toBe("connect");
    expect(brokerTileState({ ...provider, enabled: false } as any, null)).toBe("setup");
    expect(brokerTileState(provider, connection("pending_authorization"))).toBe("connecting");
    expect(brokerTileState(provider, connection("connected"))).toBe("connected");
    expect(brokerTileState(provider, connection("error"))).toBe("attention");
  });
});
```

- [ ] **Step 3: Run test (expect fail), implement branding**

```ts
import type { BrokerConnectionPublic, BrokerProviderId, BrokerProviderPublic } from "./contracts";

export interface BrokerBrand { displayName: string; tagline: string; brandColor: string; logo: string | null; logoAlt: string }
export const BROKER_BRANDING: Record<BrokerProviderId, BrokerBrand> = {
  zerodha: { displayName: "Zerodha", tagline: "Kite Connect · own app credentials", brandColor: "#387ED1", logo: "/brand/zerodha.svg", logoAlt: "Zerodha" },
  groww: { displayName: "Groww", tagline: "Groww Trading API · API key and secret", brandColor: "#00D09C", logo: "/brand/groww.svg", logoAlt: "Groww" },
  upstox: { displayName: "Upstox", tagline: "Upstox API v2 · OAuth", brandColor: "#5B2EFF", logo: null, logoAlt: "Upstox" },
};

export type BrokerTileState = "setup" | "connect" | "connecting" | "connected" | "attention";

export function brokerTileState(provider: BrokerProviderPublic, connection: BrokerConnectionPublic | null): BrokerTileState {
  if (!provider.enabled || provider.setupIssues.length > 0) return "setup";
  if (!connection) return "connect";
  switch (connection.status) {
    case "pending_credentials":
    case "pending_authorization":
    case "syncing": return "connecting";
    case "connected":
    case "disconnected": return "connected";
    default: return "attention";
  }
}
```
If an asset fails to download, set that provider's `logo` to `null` in this map and keep the wordmark.

- [ ] **Step 4: Implement `BrokerTile`**

Markup:
```tsx
<article className="zf-broker-tile" data-state={state}>
  <div className="zf-broker-id">
    <span className="zf-broker-logo" style={{ background: `${brand.brandColor}14`, color: brand.brandColor }}>
      {brand.logo ? <img src={brand.logo} alt={brand.logoAlt} width={28} height={28} loading="lazy" /> : brand.displayName}
    </span>
    <div><p className="zf-broker-name">{brand.displayName}</p><p className="zf-broker-sub">{brand.tagline}</p></div>
  </div>
  <p className="zf-broker-status" data-state={state}>{STATUS_LABEL[state]}</p>
  <button type="button" className="zf-btn zf-btn-outline" disabled={state === "setup" || state === "connecting"} onClick={() => onAction(state)}>
    {state === "connected" ? "Manage" : state === "connecting" ? "Connecting…" : state === "setup" ? "Setup required" : state === "attention" ? "Review" : "Connect"}
  </button>
</article>
```
`STATUS_LABEL = { setup: "Not available in this deployment", connect: "Not connected", connecting: "Waiting for authorization", connected: "Connected", attention: "Needs attention" }`. Include an `aria-live="polite"` on the status paragraph.

- [ ] **Step 5: Integrate in `Brokers.tsx`**

Replace the "Supported brokers" `ProviderCard` grid with `BROKER_PROVIDERS`-ordered tiles, one per provider (choose connection = connected record, else most recently updated record). Wire:
- `connect` → existing `openCreate(provider)` (the credential dialog).
- `connected` → existing manage/edit action for that connection (open edit dialog or test/sync/reauth as today).
- `attention` → open the existing connection management dialog.
- `setup` → no action; show the provider's `setupIssues`/`unavailableReason` as the tile hint.
Do not add new API calls or initiate authorization. Keep the "Your connections" section, dialogs and notices.

- [ ] **Step 6: Tile test**

Render `BrokerTile` for `connect`, `connected` and `setup`; assert:
- `getByText("Not connected")`, button "Connect".
- connected: "Connected", button "Manage".
- setup: button disabled with "Setup required".
- no secret values rendered (assert `container.textContent` does not match `/secret|api[-_ ]?key/i`).

Run: `npx vitest run src/lib/brokers/branding.test.ts src/components/dashboard/BrokerTile.test.tsx` → pass.

- [ ] **Step 7: CSS**

```css
.zf-broker-tile { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: var(--radius-card);
  border: 1px solid hsl(var(--border)); background: hsl(var(--card)); }
.zf-broker-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
.zf-broker-logo { width: 44px; height: 44px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center;
  font: 700 11px var(--ff-body); overflow: hidden; flex-shrink: 0; }
.zf-broker-logo img { width: 28px; height: 28px; object-fit: contain; }
.zf-broker-name { margin: 0; font: 700 14px var(--ff-body); }
.zf-broker-sub { margin: 2px 0 0; font-size: 11px; color: hsl(var(--muted-foreground)); }
.zf-broker-status { margin: 0; font: 600 11px var(--ff-body); color: hsl(var(--muted-foreground)); }
.zf-broker-status[data-state="connected"] { color: hsl(var(--profit)); }
.zf-broker-status[data-state="attention"], .zf-broker-status[data-state="setup"] { color: hsl(var(--warning)); }
.zf-broker-tile .zf-btn { align-self: flex-start; }
@media (max-width: 640px) { .zf-broker-tile { padding: 14px; } }
```

- [ ] **Step 8: Verify**

Run: `npx vitest run src/lib/brokers/branding.test.ts src/components/dashboard/BrokerTile.test.tsx src/lib/brokers/client.test.ts && npx tsc -p tsconfig.app.json --noEmit`
Expected: pass. Confirm no broker route/registry diffs beyond the Brokers UI: `git diff --stat functions/api/brokers src/lib/brokers/contracts.ts src/lib/brokers/registry.ts` shows only pre-existing changes, none introduced by this task.

Do not commit.

---

### Task 8: Candle history data path (Modification 6, part A)

**Files:**
- Modify: `src/lib/market-data/types.ts` (`CandleRange` add `"6mo"`)
- Modify: `src/lib/market-data/freshness.ts` (`RANGE_PRESETS` add `6mo`)
- Test: `src/lib/market-data/freshness.test.ts` (extend)
- Create: `src/lib/charts/closeBars.ts`
- Test: `src/lib/charts/closeBars.test.ts`
- Create: `src/hooks/useCandleHistory.ts`
- Test: `src/hooks/useCandleHistory.test.ts`

**Interfaces:**
- `type CandleRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "1y"`
- `buildCloseBars(candles: Candle[]): { time: number; value: number; up: boolean }[]` — chronological, `up` = close ≥ previous close (first bar `up` by close ≥ open).
- `closeBarBase(candles: Candle[]): number` — min close × 0.98, rounded to 2 decimals; 0 for empty.
- `useCandleHistory(symbol: string | null, range: CandleRange): { status: "idle" | "loading" | "ready" | "error"; envelope: CandlesEnvelope | null; error: string | null; retry(): void }`.

- [ ] **Step 1: Extend the preset test**

```ts
// append to src/lib/market-data/freshness.test.ts
it("offers daily closing ranges including six months", () => {
  expect(RANGE_PRESETS["1mo"].resolution).toBe("1d");
  expect(RANGE_PRESETS["3mo"].resolution).toBe("1d");
  expect(RANGE_PRESETS["6mo"]).toEqual({ resolution: "1d", yahooRange: "6mo", yahooInterval: "1d", maxAgeDays: 200 });
  expect(RANGE_PRESETS["1y"].resolution).toBe("1d");
  expect(isCandleRange("6mo")).toBe(true);
});
```
Run red, then add `"6mo"` to the union and the preset object shown above.

- [ ] **Step 2: Close-bar helper test**

```ts
// src/lib/charts/closeBars.test.ts
import { describe, expect, it } from "vitest";
import { buildCloseBars, closeBarBase } from "./closeBars";

const candles = [
  { time: 100, open: 10, high: 12, low: 9, close: 10, volume: null },
  { time: 200, open: 10, high: 14, low: 10, close: 13, volume: null },
  { time: 300, open: 13, high: 13, low: 8, close: 9, volume: null },
];

describe("close bars", () => {
  it("uses close values in chronological order", () => {
    expect(buildCloseBars(candles)).toEqual([
      { time: 100, value: 10, up: true },
      { time: 200, value: 13, up: true },
      { time: 300, value: 9, up: false },
    ]);
  });
  it("never uses volume and pads the baseline below the minimum close", () => {
    expect(closeBarBase(candles)).toBe(8.82);
    expect(closeBarBase([])).toBe(0);
  });
});
```
`8.82` = round(9 × 0.98, 2). Run red, then:
```ts
import type { Candle } from "@/lib/market-data/types";
export function buildCloseBars(candles: Candle[]) {
  return candles.map((candle, index) => ({
    time: candle.time,
    value: candle.close,
    up: index === 0 ? candle.close >= candle.open : candle.close >= candles[index - 1].close,
  }));
}
export function closeBarBase(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  return Math.round(Math.min(...candles.map((c) => c.close)) * 0.98 * 100) / 100;
}
```

- [ ] **Step 3: Implement `useCandleHistory`**

```ts
import { useCallback, useEffect, useState } from "react";
import { fetchCandles } from "@/lib/market-data/client";
import type { CandleRange, CandlesEnvelope } from "@/lib/market-data/types";

const cache = new Map<string, CandlesEnvelope>();
const MAX_CONCURRENT = 3;
let active = 0;
const waiters: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try { return await task(); }
  finally { active -= 1; waiters.shift()?.(); }
}

export function useCandleHistory(symbol: string | null, range: CandleRange) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; envelope: CandlesEnvelope | null; error: string | null }>(
    { status: symbol ? "loading" : "idle", envelope: null, error: null },
  );
  const [nonce, setNonce] = useState(0);
  const key = symbol ? `${symbol}:${range}` : "";

  useEffect(() => {
    if (!symbol) return;
    const cached = cache.get(key);
    if (cached) { setState({ status: "ready", envelope: cached, error: null }); return; }
    let cancelled = false;
    setState({ status: "loading", envelope: null, error: null });
    withSlot(() => fetchCandles(symbol, range))
      .then((envelope) => { if (cancelled) return; cache.set(key, envelope); setState({ status: "ready", envelope, error: null }); })
      .catch((error: unknown) => { if (cancelled) return; setState({ status: "error", envelope: null, error: error instanceof Error ? error.message : "Chart unavailable" }); });
    return () => { cancelled = true; };
  }, [symbol, range, key, nonce]);

  const retry = useCallback(() => { if (key) cache.delete(key); setState((s) => ({ ...s, status: "loading", error: null })); setNonce((n) => n + 1); }, [key]);
  return { ...state, retry };
}
```

- [ ] **Step 4: Test the hook with a mocked client**

```ts
// src/hooks/useCandleHistory.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCandleHistory } from "./useCandleHistory";

vi.mock("@/lib/market-data/client", () => ({ fetchCandles: vi.fn(async () => ({ symbol: "RELIANCE", range: "6mo", resolution: "1d", candles: [], provider: "yahoo", dataMode: "eod", fetchedAt: "", exchangeTimestamp: null, cached: false, cacheAgeMs: 0, stale: false, unavailable: [], warnings: [] })) }));

describe("useCandleHistory", () => {
  it("loads a symbol and caches it", async () => {
    const first = renderHook(() => useCandleHistory("RELIANCE", "6mo"));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    expect(first.result.current.envelope?.range).toBe("6mo");
  });
  it("does nothing without a symbol", () => {
    const { result } = renderHook(() => useCandleHistory(null, "1mo"));
    expect(result.current.status).toBe("idle");
  });
});
```

- [ ] **Step 5: Verify data path**

Run: `npx vitest run src/lib/market-data/freshness.test.ts src/lib/charts/closeBars.test.ts src/hooks/useCandleHistory.test.ts src/lib/market-data/client.test.ts`
Expected: pass. If `fetchCandles` has a different signature, adapt the call to the real one — do not add a new client function.

Do not commit.

---

### Task 9: Per-holding close chart cards (Modification 6, part B)

**Files:**
- Create: `src/components/dashboard/CloseBarCard.tsx`
- Create: `src/components/dashboard/HoldingCharts.tsx`
- Test: `src/components/dashboard/CloseBarCard.test.tsx`
- Modify: `src/pages/Index.tsx` (insert `<HoldingCharts ... />` after the holdings card in the overview)
- Modify: `src/styles/dashboard.css`

**Interfaces:**
- Consumes: `useCandleHistory`, `buildCloseBars`, `closeBarBase`, `useChartColors`, `RANGE_PRESETS`, `MarketSession`/market status only for the provenance label.
- `<CloseBarCard symbol name range onRangeChange />` and `<HoldingCharts holdings />` where `holdings: { symbol: string; name: string }[]`.

- [ ] **Step 1: Implement `CloseBarCard`**

Structure:
```tsx
<article className="zf-closecard" aria-labelledby={`zc-${symbol}`}>
  <header className="zf-closecard-head">
    <div><p className="zf-closecard-symbol" id={`zc-${symbol}`}>{symbol}</p><p className="zf-closecard-name">{name}</p></div>
    <div className="zf-closecard-price">{lastClose !== null ? inr(lastClose) : "—"}
      <span className={`zf-closecard-move ${up ? "up" : "down"}`}>{changePct}</span></div>
  </header>
  <div className="zf-closecard-ranges" role="group" aria-label={`${symbol} chart range`}>
    {(["1mo", "3mo", "6mo", "1y"] as const).map((r) => (
      <button key={r} type="button" aria-pressed={range === r} onClick={() => onRangeChange(r)}>{LABEL[r]}</button>
    ))}
  </div>
  <div className="zf-closecard-canvas" ref={hostRef}>
    {status === "loading" && <div className="zf-closecard-skel"><Skeleton height="100%" radius={12} /></div>}
    {status === "error" && <div className="zf-closecard-error" role="alert"><p>Chart unavailable</p><button className="zf-link" onClick={retry}>Retry</button></div>}
    {status === "ready" && envelope?.candles.length === 0 && <p className="zf-empty">No daily closes for this range.</p>}
  </div>
  {status === "ready" && <p className="zf-closecard-meta">Daily close · {envelope?.candles.length} sessions · {provenanceLabel}</p>}
</article>
```
Chart lifecycle inside `useEffect` when ready and the host intersects:
- `createChart(host, { width: host.clientWidth, height: 132, layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: colors.text }, grid: { horzLines: { color: colors.grid }, vertLines: { visible: false } }, rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, ...chartTimeAxisOptions("1d").timeScale }, localization: chartTimeAxisOptions("1d").localization, crosshair: { vertLine: { visible: true }, horzLine: { visible: false } } })`.
- `const series = chart.addSeries(HistogramSeries, { base: closeBarBase(envelope.candles), priceFormat: { type: "price", precision: 2, minMove: 0.01 }, lastValueVisible: false, priceLineVisible: false })`.
- `series.setData(buildCloseBars(candles).map((bar) => ({ time: bar.time as UTCTimestamp, value: bar.value, color: bar.up ? colors.up : colors.down })))`.
- Tooltip: an absolutely positioned div inside `.zf-closecard-canvas`; `chart.subscribeCrosshairMove((param) => { if (!param.time || !param.point) hide; else show date via DATE_FMT IST and close from a `Map<number, number>`; position with `Math.min(param.point.x + 12, host.clientWidth - 120)`; clamp top })`.
- `chart.timeScale().fitContent()`.
- ResizeObserver on host → `chart.applyOptions({ width: host.clientWidth })`.
- Cleanup: unsubscribe, observer.disconnect(), chart.remove().
- Lazy mount: `useEffect` with `IntersectionObserver` observing the host; render a `Skeleton` until `visible`. If `IntersectionObserver` is undefined (jsdom), set visible true immediately.

- [ ] **Step 2: Implement `HoldingCharts`**

```tsx
const VISIBLE = 8;
export function HoldingCharts({ holdings }: { holdings: { symbol: string; name: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? holdings : holdings.slice(0, VISIBLE);
  if (holdings.length === 0) return null;
  return (
    <section className="zf-chartgrid-wrap" aria-labelledby="zf-chartgrid-title">
      <div className="zf-card-head"><div><h2 className="zf-card-title" id="zf-chartgrid-title">Daily closes</h2>
        <p className="zf-card-sub">One bar per trading day · last close of each session</p></div></div>
      <div className="zf-chartgrid">{shown.map((h) => <CloseBarCard key={h.symbol} symbol={h.symbol} name={h.name} />)}</div>
      {holdings.length > VISIBLE && <button type="button" className="zf-btn zf-btn-outline" onClick={() => setExpanded((v) => !v)}>{expanded ? "Show fewer" : `Show all ${holdings.length} charts`}</button>}
    </section>
  );
}
```
`CloseBarCard` owns its range state (`useState<CandleRange>("1mo")`) so each card is independent; `HoldingCharts` does not manage ranges.

- [ ] **Step 3: Insert in `Index.tsx`**

Map `holdingRows` to `{ symbol: row.ticker, name: row.name ?? row.ticker }` (use the actual field names in `HoldingRow`; if `name` is absent, pass the symbol). Render `<HoldingCharts holdings={...} />` after the holdings card inside the overview section, before the watchlist when the layout is a single column. Do not change the holdings table itself.

- [ ] **Step 4: Card test**

Mock `lightweight-charts` (`createChart` returns `{ addSeries: () => ({ setData: vi.fn(), priceScale: () => ({ applyOptions: vi.fn() }) }), timeScale: () => ({ fitContent: vi.fn() }), applyOptions: vi.fn(), subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(), remove: vi.fn() }`), mock `useCandleHistory` to return a ready envelope with three candles, stub `ResizeObserver` and set `IntersectionObserver` undefined. Assert:
- symbol and formatted latest close are shown.
- four range buttons exist with 1M pressed.
- clicking 3M calls the range setter (assert via re-render or spy) — keep it simple: assert `aria-pressed` changes after click.
- error state shows "Chart unavailable" and a Retry button.
- loading state renders exactly one `.zf-skeleton-block` inside the canvas.

Run: `npx vitest run src/components/dashboard/CloseBarCard.test.tsx` → pass.

- [ ] **Step 5: CSS**

```css
.zf-chartgrid-wrap { display: flex; flex-direction: column; gap: 14px; }
.zf-chartgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.zf-closecard { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: var(--radius-card);
  border: 1px solid hsl(var(--border)); background: hsl(var(--card)); min-width: 0; }
.zf-closecard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.zf-closecard-symbol { margin: 0; font: 700 13px var(--ff-body); }
.zf-closecard-name { margin: 2px 0 0; font-size: 11px; color: hsl(var(--muted-foreground)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zf-closecard-price { text-align: right; font: 600 14px var(--ff-mono); }
.zf-closecard-move { display: block; font-size: 11px; }
.zf-closecard-move.up { color: hsl(var(--profit)); } .zf-closecard-move.down { color: hsl(var(--loss)); }
.zf-closecard-ranges { display: inline-flex; gap: 4px; }
.zf-closecard-ranges button { border: 0; background: transparent; border-radius: 999px; padding: 4px 9px;
  font: 600 11px var(--ff-body); color: hsl(var(--muted-foreground)); cursor: pointer; }
.zf-closecard-ranges button[aria-pressed="true"] { background: hsl(var(--surface-3)); color: hsl(var(--foreground)); }
.zf-closecard-canvas { position: relative; height: 132px; }
.zf-closecard-canvas > div { position: absolute; inset: 0; }
.zf-closecard-skel { padding: 0; }
.zf-closecard-error { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 6px; }
.zf-closecard-tip { position: absolute; z-index: 2; padding: 6px 9px; border-radius: 8px; pointer-events: none;
  background: hsl(var(--glass-elevated)); border: 1px solid hsl(var(--glass-border)); box-shadow: var(--shadow-1);
  font: 500 11px var(--ff-mono); color: hsl(var(--foreground)); white-space: nowrap; }
.zf-closecard-meta { margin: 0; font-size: 10.5px; color: hsl(var(--muted-foreground)); }
@media (max-width: 640px) { .zf-chartgrid { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Verify dashboard suite**

Run: `npx vitest run src/components/dashboard/CloseBarCard.test.tsx src/pages/Index.test.tsx src/components/MarketCandlestick.test.tsx`
Expected: pass. `Index.test.tsx` may need `IntersectionObserver` stubbed; add `vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })` beside the existing `ResizeObserver` stub.

Do not commit.

---

### Task 10: Cross-cutting verification and preview deployment

**Files:** none new; possibly test fixes.

- [ ] **Step 1: Static checks**

```bash
npx tsc -p tsconfig.app.json --noEmit
npx eslint src/lib/charts src/lib/theme src/lib/portfolio/sectorMeter.ts src/lib/brokers/branding.ts \
  src/hooks/useAccent.ts src/hooks/useCandleHistory.ts src/hooks/useChartTheme.ts \
  src/components/AccentPicker.tsx src/components/ui/skeleton.tsx src/components/dashboard/DashboardSkeleton.tsx \
  src/components/dashboard/BrokerTile.tsx src/components/dashboard/CloseBarCard.tsx src/components/dashboard/HoldingCharts.tsx \
  src/components/dashboard/Sections.tsx src/components/SectorDiversification.tsx src/components/dashboard/Brokers.tsx \
  src/components/dashboard/Summary.tsx src/components/dashboard/Holdings.tsx src/components/MarketIndexStrip.tsx \
  src/components/MarketCandlestick.tsx src/components/PortfolioCharts.tsx src/pages/Login.tsx src/pages/Index.tsx src/App.tsx
git diff --check
```
Expected: no type errors, no lint errors, no whitespace errors.

- [ ] **Step 2: Full tests**

Run: `npx vitest run`
Expected: all non-emulator tests pass; note skipped emulator suites. Report exact counts.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success; note new asset hashes from `dist/index.html`.

- [ ] **Step 4: Preview deployment**

Run:
```bash
npx wrangler pages deploy dist --project-name zenfolio --branch preview-ui-batch-1 --commit-dirty=true
```
Expected: a `preview-ui-batch-1.zenfolio-7jd.pages.dev`-style URL. **Do not use `--branch main`.** Verify the preview's asset hashes match `dist/index.html` and that `/api/prices` returns 200.

- [ ] **Step 5: Browser verification**

- Public landing at desktop/tablet/mobile: no regressions, hero intact, accent button visible on login/dashboard only.
- Login: submit → skeleton immediately; failure restores the form with the error.
- Authenticated dashboard: attempt with a real signed-in browser session if available (Browser Connector). Verify chart axes show IST times/dates, sector meter proportions, broker tiles, close charts, skeletons. If no session exists, document those as unverified.
- Dark and light themes; `prefers-reduced-motion` via Playwright `emulateMedia`.
- Capture screenshots of each modified area where accessible.

- [ ] **Step 6: Stop**

Report files changed, tests, build, preview URL, known limitations. Wait for explicit production approval. Do not promote, commit, or push.

---

## Self-review

- Spec coverage: M1 → Task 1; M2 → Tasks 2-3; M3 → Task 4; M4 → Tasks 5-6; M5 → Task 7; M6 → Tasks 8-9; preview/no-production → Task 10. Cross-cutting tests and accessibility are inside each task.
- No placeholders: every task names files, interfaces, commands and acceptance output.
- Type consistency: `CandleRange` includes `6mo`; `chartTimeAxisOptions` used by both chart components and `CloseBarCard`; `Accent` used by tokens, hook and picker; `SectorSlice` reused via a structural subset; `BrokerTileState` shared by branding and tile.
- Known deviation from the brainstorming template: no commit steps, because the task brief forbids automatic staging/commits.
