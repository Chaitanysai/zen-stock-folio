# UI/UX Refinement Batch 1 — Design

**Date:** 2026-11-02
**Baseline:** `feat/obsidian-dashboard` @ `ac602db` plus the worktree's uncommitted changes (this exact tree is what production serves).
**Production:** https://zenfolio-7jd.pages.dev — 18 files deployed 2026-11-02; assets `index-Df1xst-O.js` / `index-BU4ODfGz.css`.
**Scope:** six UI/UX modifications, preview deployment only, no production change without approval.

## Decisions taken

| Topic | Decision |
|---|---|
| Color picker | Build a new scoped accent system plus picker; none exists today. |
| Per-stock charts | Holdings only (8 visible, Show all expands); watchlist stays chart-free (no tickers). |
| Skeleton trigger | After credentials submit / Google sign-in, not on the landing Sign In link. |
| Broker logos | Download official Groww/Zerodha marks; brand-colour wordmark fallback. |

## 1. Chart alignment

`src/components/MarketCandlestick.tsx`, `src/components/PortfolioCharts.tsx`, new `src/lib/charts/timeAxis.ts`.

- Root cause: lightweight-charts defaults `timeVisible` to false. `1d` (5-minute bars) therefore renders every tick as day-of-month, producing repeated "2" labels. `5d` (15-minute bars) is also intraday but date-only in `PortfolioCharts`. No IST formatter exists, so fixed labels would show UTC.
- Add pure helpers `formatIstTick(timeSeconds, resolution)` and `isIntradayResolution(resolution)`; intraday → `HH:mm`, daily → `dd MMM`, always `Asia/Kolkata`.
- `timeVisible`/`secondsVisible` derive from the fetched envelope's resolution and are re-applied with `chart.applyOptions` when the range changes. Same rule in `PortfolioCharts`.
- Fix the `ResizeObserver` disconnect that currently returns from an async IIFE instead of the effect cleanup.
- No changes to candle fetching, sorting, dedup or interpolation.

## 2. Accent color system and picker

New `src/lib/theme/accent.ts` (pure derivation), `src/hooks/useAccent.ts`, `src/components/AccentPicker.tsx`; modify `src/index.css`, `src/components/dashboard/Shell.tsx`, `src/hooks/useChartTheme.ts`, `index.html`, `src/styles/dashboard.css`.

- Accent is `{ h, s, l }` persisted at `localStorage["zf-accent"]`. Default is the current Ember brand, so first run is visually unchanged.
- Derivation produces light and dark values for `--brand`, `--brand-strong`, `--brand-ink`, `--brand-foreground`, `--on-brand`, `--ring`, `--accent`, `--accent-foreground`, `--shadow-brand`, `--grad-brand`, `--glass-sheen`, `--atmosphere`, `--chart-1`. `--primary` stays near-black so primary buttons keep their current contrast; the accent colours brand surfaces, focus rings and chart series 1. Foreground contrast is chosen from relative luminance. `--profit`/`--loss` are never derived from the accent.
- Pre-paint script in `index.html` applies the saved accent before React mounts; `html[data-accent]` is set as a change signal.
- Picker: palette button in the rail beside the theme toggle (and in the mobile sheet), opening a Radix popover with six presets, a native color well, validated hex input, RGB/HSL readouts and a preview chip. Keyboard accessible; Escape closes; sliders are labelled.
- `useChartTheme` observes `data-accent` in addition to the theme class so lightweight-charts recolors.
- Persistence is per-device localStorage; no Firestore or profile schema change.
- Accessibility check: derived foreground must reach 4.5:1 against the accent surface; presets are curated to satisfy it.

## 3. Sector concentration meter

`src/components/dashboard/Sections.tsx`, `src/components/SectorDiversification.tsx`, `src/styles/dashboard.css`; new `src/lib/portfolio/sectorMeter.ts` for pure geometry and formatting.

- Keep `getSectorAllocation` unchanged: cost basis (`entryPrice × quantity`), active holdings, `SECTOR_MAP`/explicit sector, otherwise "Other". Cash and F&O remain excluded; no cash bucket is invented.
- Pure helper maps slices to segments: `{ id, label, pct, widthPct, colorIndex, isOther }`; `widthPct` is the true percentage, rendering enforces a 2px minimum hit/visual width without altering labels.
- Overview card: one segmented meter track, total invested value, legend with name and `toFixed(1)`%, "Other" labelled. Sector tab: larger meter plus per-sector rows; the donut is replaced. A "Concentrated" badge appears when the top sector ≥ 40%.
- Each segment is a `<span>` with `role="img"` and an `aria-label` of `Sector, percentage`; the legend is a real list.
- Empty portfolio and single-sector states are explicit. Percentages shown are the existing unrounded values formatted at render, so they reconcile with today's numbers.

## 4. Skeleton loading

New `src/components/ui/skeleton.tsx`, `src/components/dashboard/DashboardSkeleton.tsx`; modify `src/pages/Login.tsx`, `src/App.tsx`, `src/pages/Index.tsx`, `src/styles/dashboard.css`.

- `Skeleton` primitives: `Skeleton` (rect/circle, width/height), shimmer via a shared class, `aria-hidden`, animation disabled under `prefers-reduced-motion`.
- `DashboardSkeleton` mirrors the shell: rail column, top bar, heading and the overview card grid at matching dimensions (no layout shift on replacement).
- `Login` gains a `transitioning` view state set synchronously on submit (and before the Google popup call resolves). It renders `DashboardSkeleton` instead of the form while auth runs. Success navigates as today; failure clears `transitioning` and shows the existing inline error. `signIn`/`signInWithGoogle` signatures and AuthContext are untouched.
- `App.tsx`'s lazy-route fallback for `/` becomes the same skeleton instead of `SessionLoading`; the signed-out landing path keeps its current treatment.
- Dashboard initial-data placeholders become content-shaped for: summary cards, holdings rows, market strip, sector meter and broker tiles. Background price refresh continues to show existing content; spinners that represent a background refresh are not replaced.
- Loading states stay separate: app boot (preloader), auth transition (`DashboardSkeleton`), navigation (route fallback), initial data (section skeletons), background refresh (existing badges/spinners), component-level (market strip/candles).

## 5. Groww and Zerodha broker tiles

`src/components/dashboard/Brokers.tsx`, new `src/components/dashboard/BrokerTile.tsx`, `src/lib/brokers/branding.ts`, `src/styles/dashboard.css`, `public/brand/*`.

- Branding map: provider id → `{ displayName, tagline, brandColor, logoSrc, logoAlt }` for zerodha, groww, upstox. Official assets downloaded into `public/brand/`; if a source is unavailable, `logoSrc` is null and the tile renders a brand-colour wordmark (no invented emblem).
- Tile maps existing connection records to one of: Setup required (provider disabled/unconfigured), Connect (no record), Connecting (pending credentials/authorization), Connected (manage + disconnect), Needs attention (error/reauthorization/permission/unavailable) with Retry. The tile never invents a state.
- Connect and Manage both open the existing `BrokerFormDialog`/disconnect flows; action disabled while pending. One tile per supported provider regardless of how many connection records exist; choose the active record (connected first, else most recent).
- Totally UI-level: registry, schemas, encryption, callbacks, API routes and state machine are unchanged. No real authorization is initiated during development or verification.

## 6. Per-stock daily closing-price charts

New `src/components/dashboard/CloseBarCard.tsx`, `src/hooks/useCandleHistory.ts`; modify `src/components/dashboard/Holdings.tsx` or `src/pages/Index.tsx` composition, `src/lib/market-data/freshness.ts`, `src/styles/dashboard.css`.

- One card per visible holdings row (first 8, then Show all). Each card shows symbol, company name, latest daily close, change vs previous close, range chips 1M/3M/6M/1Y, the bar chart, provenance/date, and a per-card skeleton/error/retry.
- Chart: lightweight-charts `HistogramSeries` with `base` set to the range's minimum close (2% padding below), bar top = actual daily close, color green/red vs previous close. Crosshair tooltip shows `dd MMM yyyy` and `₹close`; tap on mobile uses the same crosshair subscription. No volume, no interpolation.
- Data: existing `GET /api/candles` with daily presets. `RANGE_PRESETS` gains `6mo` (Yahoo `range=6mo&interval=1d`); `1w` is not offered as daily because the 5-day preset is intraday. No new endpoint, no provider change.
- `useCandleHistory(symbol, range)` wraps `fetchCandles` with abort, per-session `Map` cache and a global concurrency limit of 3. Cards mount only when intersecting the viewport (IntersectionObserver) and render the skeleton until then. Errors are card-local; the rest of the dashboard is unaffected.
- The existing single-symbol `PriceChartCard` remains and receives the M1 alignment fix.

## Cross-cutting

- No new runtime dependencies.
- New CSS lives in `src/styles/dashboard.css`; only token values change in `src/index.css`.
- Tests: pure helpers (IST tick formatting, accent derivation/contrast, sector meter geometry, close-bar series builder) via Vitest; component tests for accent picker persistence, sector meter ARIA, skeleton trigger, broker tile states and close-bar card states where jsdom permits; extend `RANGE_PRESETS`/candles tests for `6mo`.
- Validation: `npx tsc -p tsconfig.app.json --noEmit`, full `npx vitest run`, eslint on touched files, `git diff --check`, `npm run build`.
- Preview: deploy `dist` to Pages with a non-`main` branch name (e.g. `preview-ui-batch-1`); verify preview URL; do not promote to production.
- Git: no staging, commit, push or merge. Untracked official logo assets are part of the change set but must be reviewed before any commit.

## Risks and limits

- Authenticated dashboard views cannot be verified without a valid session. Verification will use an existing signed-in browser session if one is available; otherwise dashboard changes are test/code-verified and reported as such.
- The 30 requests/minute candles limit constrains how many cards can load at once; the concurrency limiter and session cache are the mitigation.
- Official logo availability/licensing: fallback is a wordmark, never a fabricated mark.
- Accent customization is new surface area: token derivation must be regression-checked in both themes, including chart canvases.
- Preview deployments are publicly reachable at the preview URL even though production is unchanged.
