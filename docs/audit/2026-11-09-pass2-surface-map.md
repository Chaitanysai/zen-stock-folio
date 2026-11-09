# Pass 2 — dashboard-wide refinement: surface map

> Recon of `feat/ui-pass2-dashboard` @ `d3be9a5` (merged `main` incl. PR #11).
> Read-only mapping performed before any Pass 2 edit. Every claim was read from
> the working tree.

## Headline finding

**Pass 1 built `KpiStat`, `RangeMeter` and `TiltCard`, but nothing in the
application consumes them yet.** `grep` over `src/**/*.tsx` (excluding tests)
shows the only imports are inside the primitives' own files. Pass 2's core job
is therefore **adoption** — moving the dashboard onto the primitives and the
token scale — not building more primitives.

## Shell / navigation

`src/components/dashboard/Shell.tsx` (~20KB):

- `:112` `<aside className="zf-rail zf-glass" aria-label="Section rail">`
- `:127` `<nav className="zf-rail-mid" aria-label="Sections">` with a decorative
  sliding `zf-rail-pill` (`aria-hidden`), grouped by `zf-rail-group`
- `:138` `aria-current={tab === id ? "page" : undefined}` on each rail button
- `:284` `<nav className="zf-nav zf-pills zf-glass" aria-label="Primary">` — the
  horizontal pill nav, also `aria-current` per button
- `:275` mobile menu button (`aria-haspopup="dialog"`), `:315` an
  `aria-live="polite"` status region for refresh state
- Semantic layer is already correct (per Pass 1 backlog P1-2). **Pass 2 is
  visual only here** — spacing, motion, glass, the sliding indicator.

Tabs themselves are declared **inside `src/pages/Index.tsx`** as `ActiveTab`
state (`:99` `tab`, `:100` `renderedTab`, `:132` `goTo`). This is the confirmed
P1-1 (no URL routing) item and is **out of scope for Pass 2**.

## KPI tiles / summary

`src/components/dashboard/Summary.tsx` (~16KB):

- Top-line card is bespoke: `:41` `<article className="zf-card zf-balance zf-in">`,
  `:47` `zf-balance-val`, `:49` `zf-balance-delta`, `:96` `zf-inset` asset-mix
  group, `:102` `zf-tile` buttons.
- Animated figures: `:234` `<OdometerInr value={m.dayMove} />` and `:236`
  `<OdometerInr value={0} />` — **the odometer is used only for the day move**,
  not for portfolio value or the other KPIs.
- `OdometerInr` is defined in `src/components/dashboard/AnimatedNumber.tsx`
  (`:119`), rendering `:202` `<span className="zf-count zf-odometer">`.
- `Summary.tsx` hard-codes no colors except two `style={{ color: "var(--amber)" }}`
  notes at `:77` and `:82` (uses an `--amber` custom property, not the HSL token
  layer — worth aligning).

`src/components/dashboard/ui.tsx` (~2.6KB) — shared dashboard UI atoms.

## Charts / analytics

Libraries in use (no new dependency needed):

- **recharts** — `src/components/dashboard/PnlChart.tsx:1`,
  `src/components/dashboard/UnrealisedChart.tsx:2`,
  `src/components/PortfolioCharts.tsx:2` (pie), `src/components/ui/chart.tsx:2`
  (a shadcn-style wrapper around `RechartsPrimitive`).
- **lightweight-charts** — `src/components/MarketCandlestick.tsx:23`,
  `src/components/dashboard/CloseBarCard.tsx:17`.

`ui/chart.tsx` is the intended shared chart wrapper and itself carries 5
hard-coded hex colors — one of the token-drift sites.

## Holdings / tables

- `src/components/dashboard/PositionTable.tsx` (~32KB) — the large holdings table.
- `src/components/dashboard/Holdings.tsx` (~11KB),
  `src/components/dashboard/PortfolioDashboard.tsx` (~9KB).
- `src/components/PortfolioTable.tsx` (~17KB).

## Dialogs / forms / dropdowns

- Radix-backed and token-styled: `ui/dialog.tsx`, `ui/alert-dialog.tsx`,
  `ui/popover.tsx`, `ui/select.tsx` (all present).
- **The F&O modal is already Radix**: `src/components/FnOTable.tsx:22-28` imports
  `Dialog`/`AlertDialog`; `:375` renders `<Dialog>` → `<DialogContent className="fno-modal">`.
  The 2026-10-27 audit's P1-8 ("F&O modal lacks dialog semantics") is **stale**.
- `src/components/dashboard/BrokerFormDialog.tsx`, `src/components/AddTransactionDialog.tsx`
  (now using `DateField` from Pass 1), `EditTransactionDialog.tsx`,
  `ImportTradesDialog.tsx` (~31KB).

## Watchlist / trades / portfolio

| Component | Size | Notes |
|---|---|---|
| `WatchlistTable.tsx` | 27KB | largest of this group |
| `FnOTable.tsx` | 43KB | Radix dialogs confirmed |
| `AIInsights.tsx` | 24KB | |
| `TradeStrategyTable.tsx` | 16KB | |
| `StockNewsFeed.tsx` | 16KB | |
| `PriceAlerts.tsx` | 9KB | |
| `RiskAnalysis.tsx` | 9KB | |
| `HealthPanel.tsx` | 8KB | 4 `rgb(` hard-coded |
| `TradeJournal.tsx` | 8KB | |
| `TradeHistory.tsx` | 7KB | |
| `TradeAnalytics.tsx` | 4.5KB | |
| `SectorDiversification.tsx` | 3.5KB | |

## Theme / tokens

- `src/index.css` (34KB) is the single token source; header comment documents the
  layer map (page → surface 1/2/3 → glass, brand roles).
- `src/styles/dashboard.css` (110KB) — dashboard component styles.
- `src/styles/festival.css` (8.3KB), `src/styles/landing.css` (56KB).
- **Hard-coded colours (only 5 files):**
  - `src/components/events/FestivalGreeting.tsx` — 11 hex
  - `src/components/ui/chart.tsx` — 5 hex
  - `src/components/HealthPanel.tsx` — 4 `rgb(`
  - `src/components/dashboard/Brokers.tsx` — 1 hex
  - `src/components/landing/HeroScene.tsx` — 1 hex

## Festival integration

- `src/components/events/useActiveEvent.ts` — resolves once on mount, then again
  at the next **Asia/Kolkata midnight** (`nextMidnightInTimeZone`). Returns
  `null` until resolved, so no event ⇒ no extra DOM.
- `EventExperienceProvider.tsx`, `FestivalCanvas.tsx`, `FestivalWash.tsx`,
  `FestivalGreeting.tsx`, `engine/{palette,scene}.ts`.
- **No pause/close/dismiss controls exist** — `FestivalGreeting.tsx:5` documents
  the intent ("needs no pause or hide button"). Already compliant with the
  requirement that festival not be manually dismissible.
- `FestivalGreeting.tsx` carries 11 hard-coded hex colours — the main festival
  token-drift site. Must confirm decorations do not cover financial figures.

## Responsive

- `src/hooks/use-mobile.tsx` for JS breakpoint logic; otherwise media queries live
  in `index.css` / `dashboard.css` with `zf-` utility classes (`zf-hide-mobile`
  seen at `Shell.tsx:361`).

## Existing test baseline (regression surface to preserve)

Dashboard: `AnimatedNumber.test.tsx`, `BrokerTile.test.tsx`,
`CloseBarCard.test.tsx`, `DashboardSkeleton.test.tsx`, `DayGlow.test.tsx`,
`HomeAtmosphere.test.tsx`, `RefreshControl.test.tsx`, `Summary.test.tsx`,
`UnrealisedChart.test.tsx`.
Components: `AccentPicker`, `AIInsights`, `BrokerSyncCard`, `FnOTable`,
`ImportTradesDialog`, `integrationSurfaces`, `MarketCandlestick`,
`PortfolioCharts`, `PortfolioHistoryPanel`, `PortfolioTable`, `PriceAlerts`,
`StockNewsFeed`, `TradeStrategyTable`, `WatchlistTable`, plus Pass 1's
`date-field.test.ts` and `primitives.test.tsx`.
Events: `EventExperienceProvider.test.tsx`, `FestivalGreeting.test.tsx`,
`engine/scene.test.ts`.
Pages: `Index.test.tsx` (~16KB), `Landing.test.tsx`, `Login.test.tsx`.

## Highest-risk / largest files

1. `Index.tsx` 50KB — tab host; **routing change explicitly out of scope**.
2. `FnOTable.tsx` 43KB.
3. `dashboard.css` 110KB — editing carelessly risks cross-component regressions.
4. `PositionTable.tsx` 32KB.
5. `ImportTradesDialog.tsx` 31KB.
