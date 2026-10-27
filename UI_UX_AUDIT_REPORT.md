# Stock-Tracker UI/UX Audit Report

**Audit date:** 2026-10-27
**Audit type:** Read-only source review (no browser run, no visual testing)
**Worktree:** `E:\Projects\Stock-Tracker\ui-ux`
**Branch:** `feat/ui-ux-refinement`
**Base commit:** `a2d56a9f98d8c5ad1ca6f5b9c2932e2ac777e94c`

> **Evidence standard used in this report**
> - **Verified** = directly observed in source, Git state, or computed from declared design tokens.
> - **Recommendation** = design/engineering proposal, not yet implemented or validated.
> - **Assumption** = stated where behavior depends on runtime, backend, or environment not exercised in this audit.
> - Contrast ratios below are **computed from the HSL values declared in CSS**, not measured in a browser or with a colorimeter.
> - No dependencies were installed, no dev server was started, and no screen was visually inspected.

---

## 1. Worktree setup and Git verification

### 1.1 Verified state

| Item | Expected | Observed | Status |
|---|---|---|---|
| UI/UX worktree path | `E:\Projects\Stock-Tracker\ui-ux` | exists, valid linked worktree | PASS |
| Branch | `feat/ui-ux-refinement` | `feat/ui-ux-refinement` | PASS |
| HEAD | `a2d56a9` | `a2d56a9f98d8c5ad1ca6f5b9c2932e2ac777e94c` | PASS |
| Working tree | replicated dirty state | 24 entries (9 modified, 15 untracked) | PASS |
| Staged changes | none | `git diff --cached --name-only` → 0 | PASS |
| Main repo | unchanged | `feat/firebase-cloudflare-migration` @ `a2d56a9`, 34 entries | PASS |
| API worktree | unchanged | `feat/api-provider-integration` @ `a2d56a9`, 51 entries | PASS |
| Audit report pre-existing | none | none found | PASS (created by this audit) |

All three worktrees resolve to the same base commit `a2d56a9`, on their intended branches. The UI/UX worktree contains only the replicated modifications/untracked files; **no application code was changed during this audit**.

### 1.2 Repository hygiene observations (verified)

- The UI/UX worktree carries 24 dirty entries copied from the main repo. Until they are committed, every future rebase/merge against the migrating main branch will carry conflict risk. This is a process risk, not a UI defect.
- `.env`-style files and secrets were not copied; safe example configuration was preserved (per setup constraint).
- `core.autocrlf=true` produced LF→CRLF warnings during setup; byte-level comparisons confirmed content identity, so no action is needed.

---

## 2. Scope and method

### 2.1 Reviewed

All first-party screens, routes, shared components, hooks, design tokens, and the HTML shell were read in source. Specifically:

**Application shell / routing**
`src/App.tsx`, `src/main.tsx`, `src/pages/Index.tsx`, `src/pages/NotFound.tsx`, `src/components/ProtectedRoute.tsx`, `index.html`, `src/index.css`.

**Authentication**
`src/components/Login.tsx`, `src/components/AuthModal.tsx`, `src/components/ThemeToggle.tsx`, `src/components/LoginHeroVisuals.tsx`, `src/contexts/AuthContext.tsx`, `src/lib/auth/*`.

**Portfolio / trading**
`src/components/WatchlistTable.tsx`, `PortfolioTable.tsx`, `AddTransactionDialog.tsx`, `EditTransactionDialog.tsx`, `ImportTradesDialog.tsx`, `ExportPortfolio.tsx`, `TradeHistory.tsx`, `TradeAnalytics.tsx`, `TradeStrategyTable.tsx`, `TradeJournal.tsx`, `RiskAnalysis.tsx`, `SectorDiversification.tsx`, `PriceAlerts.tsx`.

**Market data / charts / content**
`src/components/PortfolioCharts.tsx`, `StockNewsFeed.tsx`, `AIInsights.tsx`, `FnOTable.tsx`, `src/hooks/useLivePrices.ts`, `useMarketStatus.ts`, `usePortfolioSync.ts`, `src/lib/api.ts`, `src/data/sampleData.ts`.

**Design system surface**
CSS custom properties in `src/index.css`, Tailwind/shadcn primitives under `src/components/ui/*`, per-component inline palettes (Index, AIInsights, StockNewsFeed, FnOTable, Login, SectorDiversification).

### 2.2 Not reviewed / not exercised

- No runtime rendering, no interaction testing, no screen-reader testing, no zoom/reflow testing in a browser.
- Backend behavior (`functions/`, Firestore rules, Cloudflare functions) was not modified or executed; only client call sites were reviewed.
- The API integration worktree was inspected only for isolation status, never modified.

---

## 3. Findings

Severity key:

- **P0** — release-blocking: data loss, broken core flow, or a false-state safety issue.
- **P1** — major: significant usability, accessibility, or correctness defect with a clear workaround or contained blast radius.
- **P2** — moderate: degraded quality, inconsistency, missing states, or maintainability drag.
- **P3** — polish: refinements that improve perceived quality without changing task success.

### 3.1 P0 — Release-blocking

#### P0-1. Trade journal notes are silently lost on the next persisted action or reload — **Verified**

**Evidence:** [src/pages/Index.tsx:1739](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L1739)

```tsx
{tab === "journal" && <TradeJournal stocks={stocks} onUpdateNotes={(ticker, notes) => setStocks(prev => prev.map(s => s.ticker === ticker ? { ...s, notes } : s))} />}
```

This writes through `setStocks` directly and bypasses `applySnapshot` ([Index.tsx:932](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L932)–948), which is the only path that updates `snapshotRef` and calls `persistSnapshot`. Consequences:

1. `snapshotRef.current` still holds the pre-edit stocks.
2. The next persisted action (add/edit/delete trade, alert, etc.) merges a stale `stocks` array, overwriting the notes.
3. A reload without any further action also loses the notes because they were never persisted.

**Impact:** user-authored data loss with no warning. Highest-severity finding in the audit.

**Recommendation:** route journal updates through `applySnapshot({ stocks: next }, "Journal note updated")`; add a regression test that edits a note, performs another mutation, reloads, and asserts the note survives.

---

#### P0-2. Watchlist has no add-instrument flow and no empty state — **Verified**

**Evidence:** [src/components/WatchlistTable.tsx:13](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/WatchlistTable.tsx#L13)–19

```tsx
interface WatchlistTableProps {
  watchlist: WatchlistItem[];
  onEdit: (item: WatchlistItem) => void;
  onDelete: (ticker: string) => void;
}
```

The component receives only `onEdit` and `onDelete`. The header ([WatchlistTable.tsx:80](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/WatchlistTable.tsx#L80)–90) contains no add action, and no empty-state branch exists. A new user (or a user who deletes the last item) sees a table with no rows and no path forward.

**Impact:** the primary create action for a core object is missing. This is a functional gap, not styling.

**Recommendation:** add `onAdd` to the table contract, render an "Add symbol" primary action in the header and in the empty state, and wire it to a symbol-search dialog that validates duplicates and unknown tickers.

---

#### P0-3. Price alerts are presented as active but can never trigger — **Verified**

**Evidence:** [src/components/PriceAlerts.tsx:35](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PriceAlerts.tsx#L35) sets `triggered: false` on creation; the only other write is also `false` at [Index.tsx:976](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L976). No evaluation against live prices exists in the client or in the reviewed call sites.

**Impact:** a user sets a price alert, believes they will be notified, and receives nothing. This is a false-state safety issue (worse than an absent feature), because the UI implies monitoring.

**Recommendation:** until server-side or market-hours evaluation exists, either (a) implement evaluation in the existing price pipeline with a persisted `triggeredAt`, or (b) label the feature explicitly as "Saved alert — not evaluated yet" and disable the "active" affordance. Do not ship a silent no-op.

---

### 3.2 P1 — Major

#### P1-1. Navigation is state-only: no URLs, no history, no deep links — **Verified**

**Evidence:** 13 tab values are driven by a single `tab` state ([Index.tsx:784](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L784)); `NAV_GROUPS` is defined at [Index.tsx:48](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L48)–76. No route consumes the tab.

**Impacts (verified by source structure):** browser back/forward does not move between sections; refresh always returns to the default tab; sections cannot be bookmarked, shared, or linked from notifications; the 404 and `/login` redirect paths cannot return a user to the exact screen they left.

**Recommendation:** promote the tab enum into React Router routes (`/dashboard`, `/watchlist`, `/portfolio`, `/charts`, `/fno`, `/news`, `/insights`, `/journal`, `/alerts`, `/history`), keep `Index` as the shell layout with `<Outlet />`, and preserve redirect-back behavior in `ProtectedRoute`.

#### P1-2. Sidebar navigation is not keyboard-operable and exposes no semantics — **Verified**

**Evidence:** [Index.tsx:1157](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L1157)–1162

```tsx
<div className="zf-nav-item" onClick={...}>
```

No `role`, `tabIndex`, `aria-current`, or `onKeyDown`. These are the only navigation affordances in the app shell.

**Impact:** keyboard-only users cannot change sections; screen readers announce generic text, not navigation.

**Recommendation:** render `<nav aria-label="Primary">` with `<button>` or route `<Link>` elements, `aria-current="page"` for the active item, and a visible focus ring.

#### P1-3. The header search is dead UI and disappears on small screens — **Verified**

**Evidence:** `searchQ` is declared at [Index.tsx:851](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L851) and bound to an input at [Index.tsx:1185](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L1185), but is never read anywhere else. The search is hidden at ≤900px ([Index.tsx:611](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L611)).

**Impact:** the most prominent global affordance does nothing, and vanishes on mobile with no replacement.

**Recommendation:** implement it (route to Watchlist/Portfolio with a `q` param and filter) or remove it. Do not leave a non-functional input in the header.

#### P1-4. Two competing theme systems cause inconsistent appearance and flashes — **Verified**

**Evidence:** `ThemeProvider defaultTheme="dark"` in [src/App.tsx:16](file:///E:/Projects/Stock-Tracker/ui-ux/src/App.tsx#L16); a separate `darkMode` state toggles `document.documentElement.classList` at [Index.tsx:786](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L786)–793; `ThemeToggle` is used only on Login. The auth loading screen is hardcoded light at [Index.tsx:1055](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L1055)–1063.

**Impact:** dark-only class toggling fights `next-themes`; the loading screen flashes light before the dashboard renders; theme is not user-controllable from the app shell.

**Recommendation:** single source of truth (`next-themes` + tokens), expose `ThemeToggle` in the shell, remove the local `darkMode` state, and make the loading screen token-based.

#### P1-5. Mobile shell has no navigation pattern — **Verified**

**Evidence:** responsive rules at [Index.tsx:608](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L608)–612: at ≤1200px the sidebar collapses to a 64px icon rail; at ≤900px search hides; at ≤640px KPI grid drops to 2 columns. There is no drawer, no bottom navigation, and no off-canvas menu. `.bottom-nav-glass` exists at [src/index.css:245](file:///E:/Projects/Stock-Tracker/ui-ux/src/index.css#L245) but is unused.

**Assumption:** at 360–430px width, a 64px rail plus 13 destinations is not usable even if icons remain visible; icon-only rails also lack accessible names unless each item has a label/tooltip.

**Recommendation:** introduce one mobile pattern — bottom navigation with 4–5 primary destinations plus a "More" sheet, or an off-canvas drawer. Reuse the existing glass token rather than adding new styles.

#### P1-6. Zoom is disabled in the viewport meta — **Verified**

**Evidence:** [index.html:7](file:///E:/Projects/Stock-Tracker/ui-ux/index.html#L7) contains `maximum-scale=1.0`.

**Impact:** WCAG 2.2 SC 1.4.4 (Resize Text) failure on mobile; low-vision users cannot zoom. This is a compliance issue if accessibility conformance is claimed.

**Recommendation:** remove `maximum-scale=1.0` (and `user-scalable=no` if present). Verify reflow at 200% zoom on the tables and dialogs.

#### P1-7. Text contrast fails for primary, muted, and small-label tokens on light surfaces — **Verified by computation from declared HSL**

| Token / usage | Foreground | Background | Computed ratio | Required | Result |
|---|---|---|---|---|---|
| `--primary` (amber) | declared primary | white | **2.33:1** | 4.5:1 (text), 3:1 (UI) | FAIL both |
| `--tx-400` 9–10px labels | declared `--tx-400` | light background | **3.03:1** | 4.5:1 | FAIL |
| `--muted-foreground` body/small | declared muted | light background | **4.01:1** | 4.5:1 | FAIL |
| `--profit` | declared profit | white | **3.91:1** | 4.5:1 | FAIL |
| `--loss` | declared loss | white | **4.29:1** | 4.5:1 | FAIL |
| dark card vs `--profit` | profit | dark card | 7.90:1 | 4.5:1 | PASS |
| dark background vs `--muted-foreground` | muted | dark background | 4.68:1 | 4.5:1 | PASS |
| sidebar foreground | sidebar fg | sidebar bg | 10.23:1 | 4.5:1 | PASS |

**Impact:** light mode fails for body-adjacent text, tabular labels, P&L values, and amber primary text. Dark mode is broadly acceptable. Because the default theme is dark, the worst failures may be latent — but Login and several hardcoded light surfaces (FnO modal, AIInsights) render light regardless of theme.

**Recommendation:** do not reuse `--primary` as a text color on light backgrounds; introduce `--primary-text` (darker amber/brown) and `--profit-text`/`--loss-text` pairs that meet 4.5:1, and reserve bright amber for fills, borders, and focus rings (3:1 against adjacent colors). Enforce with a token-level contrast test.

#### P1-8. Custom F&O modal lacks dialog semantics, focus management, and Escape handling — **Verified**

**Evidence:** [src/components/FnOTable.tsx:489](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/FnOTable.tsx#L489)–493 is a plain `<div>` overlay. No `role="dialog"`, `aria-modal`, focus trap, initial focus, or Escape handler. Delete uses native `confirm()` at [FnOTable.tsx:735](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/FnOTable.tsx#L735).

**Impact:** screen readers do not announce a dialog, focus can tab into the page behind it, Escape does nothing, and native `confirm()` blocks styling and is inconsistent with the Radix dialogs used elsewhere.

**Recommendation:** replace with the existing shadcn/Radix `Dialog` and `AlertDialog` primitives already used by `TradeStrategyTable`.

#### P1-9. Icon-only destructive and row actions lack accessible names — **Verified**

**Evidence:**
- [WatchlistTable.tsx:123](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/WatchlistTable.tsx#L123)–125 (row menu trigger)
- [PortfolioTable.tsx:191](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PortfolioTable.tsx#L191)–193 (row menu trigger)
- [PortfolioTable.tsx:144](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PortfolioTable.tsx#L144)–147 (header checkbox without an accessible name)
- [PriceAlerts.tsx:117](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PriceAlerts.tsx#L117), [140](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PriceAlerts.tsx#L140) (dismiss/delete)
- [FnOTable.tsx:938](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/FnOTable.tsx#L938)–946 (edit/delete)
- [AIInsights.tsx:545](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/AIInsights.tsx#L545) (send)

**Impact:** screen-reader users hear "button" with no purpose, especially dangerous for delete controls.

**Recommendation:** add `aria-label` or visually hidden text including the row identity (e.g., "Delete price alert for RELIANCE"), and mark destructive actions consistently.

#### P1-10. Trade History period filter silently drops valid trades — **Verified**

**Evidence:** [src/components/TradeHistory.tsx:19](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/TradeHistory.tsx#L19)–22

```tsx
const parseDate = (d: string) => {
  const parts = d.split("-");
  return new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
};
```

This assumes `DD-MM-YYYY`. Actual sources produce:
- `<input type="date">` → `YYYY-MM-DD` (EditTransactionDialog)
- `toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })` → `"27 Oct 2026"` (AddTransactionDialog default)
- sample data → `DD-MMM-YYYY` (`"16-Feb-2026"`)

For ISO and long-month formats, `new Date(...)` yields `Invalid Date`, so the 7-day and 30-day filters exclude legitimate rows. `sampleData.calcHoldingDays` ([src/data/sampleData.ts:160](file:///E:/Projects/Stock-Tracker/ui-ux/src/data/sampleData.ts#L160)–180) already handles multiple formats robustly but is not used here.

**Impact:** "7 Days" / "30 Days" can show "No completed trades" while matching trades exist. Silent, trust-eroding.

**Recommendation:** one shared date parser (or store ISO dates) used by both `calcHoldingDays` and `TradeHistory`; add unit tests for all four input formats.

#### P1-11. Market charts bypass the app's API layer and have no retry — **Verified**

**Evidence:** direct browser fetch to Yahoo in [PortfolioCharts.tsx:148](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PortfolioCharts.tsx#L148)–150 and [Index.tsx:1861](file:///E:/Projects/Stock-Tracker/ui-ux/src/pages/Index.tsx#L1861). Error UI at [PortfolioCharts.tsx:190](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PortfolioCharts.tsx#L190)–207 offers no retry. `useLivePrices` **does** retry and speaks to `/api/prices`.

**Assumption:** Yahoo endpoints are subject to CORS/reliability changes; direct browser calls may work today but are not covered by the app's server-side fallbacks and logging.

**Impact:** inconsistent data paths, duplicated logic, no observability, and dead-end error states.

**Recommendation:** route chart history through the `/api/prices` (or a dedicated `/api/history`) contract so provider fallbacks and retries apply uniformly; add a retry action to the chart error state.

#### P1-12. Duplicate price polling from multiple hook instances — **Verified**

**Evidence:** `useLivePrices` is instantiated independently in `Index`, `PortfolioTable` ([PortfolioTable.tsx:73](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PortfolioTable.tsx#L73)), and `PortfolioCharts` ([PortfolioCharts.tsx:240](file:///E:/Projects/Stock-Tracker/ui-ux/src/components/PortfolioCharts.tsx#L240)). Each instance has its own timer ([useLivePrices.ts:119](file:///E:/Projects/Stock-Tracker/ui-ux/src/hooks/useLivePrices.ts#L119)–142) and its own 800 ms throttle ([useLivePrices.ts:79](file:///E:/Projects/Stock-Tracker/ui-ux/src/hooks/useLivePrices.ts#L79)–82).

**Impact:** up to three pollers for overlapping tickers; wasted requests and rate-limit exposure; inconsistent refresh timing across components.

**Recommendation:** lift prices to TanStack Query (already present) with a shared query key and a single `refetchInterval`, or make `useLivePrices` a subscriber to one module-level scheduler (the pattern `useMarketStatus` already uses).

---

### 3.3 P2 — Moderate

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| P2-1 | Dialog form labels are visually present but not programmatically associated in several dialogs | `WatchlistTable.tsx:173–221`, `AddTransactionDialog.tsx:132–272`, `EditTransactionDialog.tsx`, `TradeStrategyTable.tsx:202–231`, `PriceAlerts.tsx` | Add `htmlFor`/`id` or wrap inputs in `<label>`; add `aria-describedby` for help text and `aria-invalid` for errors |
| P2-2 | Validation is toast-only and does not annotate fields | `AddTransactionDialog.tsx:77` | Inline field errors, `aria-invalid`, focus the first invalid field on submit |
| P2-3 | Edit dialog accepts free-text dates and editable CMP; 52W low is absent | `EditTransactionDialog.tsx:110,138` | Use `type="date"` with ISO storage; make derived fields read-only or clearly explained |
| P2-4 | CSV export does not quote fields | `ExportPortfolio.tsx:39` (`join(",")`) | Quote and escape per RFC 4180; prefix formula-leading cells (`=`, `+`, `-`, `@`) to prevent spreadsheet injection |
| P2-5 | No empty states in Watchlist and Portfolio tables | `WatchlistTable.tsx` (none), `PortfolioTable.tsx` (none) | Purpose-built empty states with a primary action and one line of guidance |
| P2-6 | Import drop zone is mouse-only | `ImportTradesDialog.tsx:216` | Use `<button>` or add `role="button"`, `tabIndex=0`, Enter/Space, and real drag handlers |
| P2-7 | Import does not detect duplicate tickers | `ImportTradesDialog.tsx` | Pre-flight duplicate summary with merge/replace/skip choice |
| P2-8 | Native `confirm()` for delete; no confirmation for alert deletion | `FnOTable.tsx:735`, `PriceAlerts.tsx:140` | Standardize on Radix `AlertDialog`; include entity name in the body |
| P2-9 | AI Insights and F&O carry hardcoded light palettes; FnO modal uses inline light colors | `AIInsights.tsx:22,401`, `FnOTable.tsx:884,914` | Replace with semantic tokens; verify both themes |
| P2-10 | News feed relies on dozens of `.dark !important` overrides | `StockNewsFeed.tsx:346+` | Move to semantic tokens; delete override block after migration |
| P2-11 | Unlabeled chart/assistant controls | `PortfolioCharts.tsx:301–311` (`<select>`), `AIInsights.tsx:526` (textarea) | Visible or sr-only labels |
| P2-12 | Charts have no text/table alternative | `SectorDiversification.tsx`, `PortfolioCharts.tsx` | Provide an accessible summary table or data list; announce updates politely |
| P2-13 | Four+ visual systems coexist | Inline CSS from `Index.tsx:96` (DM Sans, green accent at `:107`), global amber/Geist tokens, AIInsights palette, News/FnO palettes | Consolidate into one token layer; one accent family; one type ramp |
| P2-14 | Auth loading screen is hardcoded light | `Index.tsx:1055–1063` | Token-based loading UI matching resolved theme |
| P2-15 | Dead/unreachable UI remains in the bundle | `Index.tsx:1065–1129` marketing landing and `AuthModal`; `RiskAnalysis` imported at `:22` but never rendered; `StockLineChartWidget` at `:1899`; unused `.bottom-nav-glass` | Delete or wire up; avoid shipping dead branches |
| P2-16 | Table density and column count | `PortfolioTable.tsx` (15 columns), `WatchlistTable.tsx` (13) | Prioritize columns by task; move secondary data into row expansion or detail panel; sticky first column and header |
| P2-17 | `TradeAnalytics` zero-state is not explanatory | `TradeAnalytics.tsx` | Show "Close your first trade to unlock analytics" instead of eight zero cards |
| P2-18 | `TradeHistory` uses `DD-MMM-YYYY` sample dates while inputs produce other formats | `sampleData.ts`, `TradeHistory.tsx` | Normalize on ISO at the data boundary |
| P2-19 | 404 page causes a full reload | `NotFound.tsx:16` (`<a href="/">`) | Use router `<Link>` |
| P2-20 | No global reduced-motion handling | `src/index.css` (no `prefers-reduced-motion`; global transitions at `:358–365`) | Add a global reduced-motion block; keep the Login-local handling and generalize it |
| P2-21 | Auth page uses a hardcoded cream/navy palette, not tokens | `Login.tsx` | Tokenize while preserving brand intent; keep the existing strong label/alert work |
| P2-22 | Live-price merge can retain stale tickers after removal | `useLivePrices.ts` merge semantics | Prune keys not in the requested ticker set, or derive visible values from the current list |

---

### 3.4 P3 — Polish

| # | Finding | Recommendation |
|---|---|---|
| P3-1 | KPI/stat typography mixes several sizes and monospace weights across tabs | Adopt a single numeric scale (display / metric / table / caption) with tabular numerals |
| P3-2 | Spacing is ad hoc in places (mixed 0.5/1/1.5/2.5 steps with custom pixels) | 4/8px spacing scale with a small set of approved exceptions |
| P3-3 | Focus styling is global but inconsistent with custom controls | Use the global `:focus-visible` token everywhere; never remove outlines on `div` controls |
| P3-4 | Empty/loading/error states vary in voice and structure | One state component family: empty, loading (skeleton), error (retry), success (toast) |
| P3-5 | Table sorting/filtering is inconsistent across Watchlist/Portfolio/History | Shared table toolbar with search, sort, and column visibility |
| P3-6 | Micro-interactions (row hover, tab change) have no motion budget | 120–180 ms ease-out; disable under reduced motion |
| P3-7 | Price freshness is communicated but not visually prioritized | Put "as of" + source label next to the price column header, not only in a toolbar |
| P3-8 | Auth hero visuals are illustrative and randomly generated once per mount | Keep the "Illustrative" label; seed deterministically to avoid visual jitter between sessions |

---

## 4. Design system recommendation

### 4.1 Principles

1. **One system, one accent.** The app currently mixes amber (global), green (Index inline), navy/cream (Login), and per-feature palettes. Pick one accent family and use it for action, selection, and focus only.
2. **Numbers are the product.** Use tabular numerals, right-aligned numeric columns, and a fixed numeric scale. Color communicates direction, not decoration.
3. **Every state is designed.** Empty, loading, error, partial, stale, and success are first-class, not afterthoughts.
4. **Density with breathing room.** A trading terminal benefits from compact rows, but hierarchy must come from type weight, spacing, and grouping — not from more borders.
5. **Accessible by default.** Contrast, focus, labels, and reduced motion are token-level guarantees, not per-screen patches.

### 4.2 Token architecture

Three layers, matching the existing CSS-variable approach:

- **Primitive:** raw palette (amber 50–900, navy 50–950, profit/loss ramps, neutral 0–1000).
- **Semantic:** `--bg`, `--surface`, `--surface-raised`, `--border`, `--text`, `--text-muted`, `--text-subtle`, `--primary`, `--primary-text`, `--profit`, `--profit-text`, `--loss`, `--loss-text`, `--warning`, `--focus-ring`.
- **Component:** `--table-header-bg`, `--table-row-hover`, `--nav-active-bg`, `--chart-grid`, `--chart-axis`, `--dialog-overlay`.

Rules:
- Bright accent (`--primary`) is for fills, indicators, and focus; text uses `--primary-text`.
- `--profit`/`--loss` are for fills and large numerals; small text uses paired `*-text` tokens that pass 4.5:1.
- No component may declare a hex color. Chart palettes are tokens, not arrays in component files.
- Both themes are generated from the same semantic names; no `.dark !important` overrides.

### 4.3 Typography

- **UI:** Geist (already loaded) for labels, navigation, and body.
- **Numerics:** Geist Mono or a tabular-figure variant for prices, quantities, P&L.
- **Scale:** display 28/32, heading 20/28, subheading 16/24, body 14/20, caption 12/16, micro 11/14 (minimum for essential text; avoid 9–10px for anything actionable).
- **Weights:** 400 body, 500 emphasized, 600 headings and metrics. Avoid 700+ except display numerals.

### 4.4 Spacing, radius, elevation

- 4/8 px spacing scale; 12/16 px card padding; 24 px section gaps.
- Radius: 8 px controls, 12 px cards, 16 px dialogs. One radius family.
- Elevation: 1px border for structure, one shadow level for overlays only. Avoid glow.

### 4.5 Component primitives to standardize

- `AppShell` (sidebar/rail + mobile drawer or bottom nav + header)
- `PageHeader` (title, subtitle, primary action, freshness)
- `StatCard` (label, value, delta, context)
- `DataTable` (sort, filter, empty, loading skeleton, sticky header, column priority)
- `FormField` (label, help, error, required marker)
- `Dialog`/`AlertDialog` (Radix, focus trap, Escape, destructive variant)
- `EmptyState`, `ErrorState` (with retry), `LoadingState` (skeleton)
- `ChartFrame` (title, source label, legend, accessible table toggle)

### 4.6 Data visualization

- Semantic chart tokens: grid, axis, tooltip, series 1–8 (colorblind-safe ordering).
- Always pair color with a second channel (label, pattern, or direct annotation) for profit/loss.
- Provide a "View as table" toggle for donut and line charts.
- Show source and timestamp next to every chart.

### 4.7 Motion

- 120–180 ms ease-out for state changes; 200–240 ms for overlays.
- No parallax or continuous animation in data surfaces.
- Global `@media (prefers-reduced-motion: reduce)` disabling transforms and non-essential transitions.

---

## 5. Screen-by-screen recommendations

### 5.1 App shell and navigation

- Convert tabs to routes and render the shell via nested routes.
- Replace `div` nav items with semantic links/buttons, `aria-current`, and visible focus.
- Add a real global search (symbol + page search) or remove the field.
- Single theme source with a shell-level toggle.
- Mobile: bottom navigation (Dashboard, Watchlist, Portfolio, More) or a drawer; keep the freshest KPI visible above the fold.

### 5.2 Dashboard

- Lead with portfolio value, day P&L, and total P&L as one primary block; demote secondary counts.
- Make the market-status/freshness label explicit and adjacent to prices.
- Give each tab a one-line purpose subtitle.
- Remove dead branches (marketing landing, unused chart widget) or implement them.

### 5.3 Watchlist

- Add the missing add/edit flow and empty state (P0-2).
- Reduce to essential columns (symbol, price, change, 52W range, alert) with row expansion for the rest.
- Accessible row actions with entity-specific labels.
- Persist column and sort preferences.

### 5.4 Portfolio

- Split into "Positions" and "Closed" with shared toolbar.
- 15 columns is too many at once: prioritize, hide secondary columns, and offer column visibility.
- Sticky symbol column and header; horizontal scroll confined to the table.
- Empty, loading skeleton, and error-with-retry states.

### 5.5 Add / Edit / Import dialogs

- Associate every label; add inline validation and `aria-invalid`.
- ISO dates everywhere; no free-text dates.
- Import: keyboard-accessible drop zone, duplicate pre-flight, and a preview step.
- Destructive confirmations via `AlertDialog` with entity names.

### 5.6 Charts and sector

- Route history through the API layer with retry.
- Add accessible table alternatives and source/freshness labels.
- Single chart palette from tokens; consistent axis/grid styling.
- Empty state when there are no holdings.

### 5.7 F&O

- Replace the custom overlay with Radix `Dialog`; replace `confirm()` with `AlertDialog`.
- Tokenize the light-only colors.
- Normalize date handling through the shared parser.
- Add empty and error states for option-chain data.

### 5.8 News

- Replace the override block with semantic tokens.
- Keep the existing skeleton/error/retry structure — it is the best state handling in the app.
- Add source, timestamp, and a clear "mock data" indicator when fallback content is shown.

### 5.9 AI Insights

- Tokenize the palette; remove fixed `minHeight`.
- Label the textarea; add `aria-live="polite"` for streaming responses.
- Add suggested prompts, a clear disabled state, and error recovery.

### 5.10 Trade journal, history, analytics

- Fix note persistence (P0-1).
- Fix date filtering with a shared parser (P1-10).
- Journal: autosave indicator ("Saved just now"), search, and tag/filter support.
- Analytics: explanatory zero-state and definitions via tooltips.
- History: consistent ISO storage; result column uses icon + text, not emoji.

### 5.11 Price alerts

- Implement evaluation or label the feature honestly (P0-3).
- Add delete confirmation, entity-specific labels, and a clear triggered/active/paused status model.
- Show last-checked timestamp.

### 5.12 Authentication

- Keep the strong label, `autoComplete`, alert, and reduced-motion work in `Login`.
- Tokenize the cream/navy palette or explicitly document it as a brand island.
- Add `aria-invalid` and `aria-describedby` for field errors.
- Ensure the post-login redirect returns to the attempted route (depends on routing work).
- Remove or route the unreachable `AuthModal`.

### 5.13 404 and global states

- Router `<Link>` instead of full reload.
- Add a consistent illustration/empty-state family.

### 5.14 Responsive targets

Validate at 360, 390, 768, 1024, 1280, 1440, and 1920 widths:

- No horizontal body scroll.
- Navigation reachable at every width.
- Tables scroll only inside their container.
- Dialogs fit with the on-screen keyboard open (mobile).
- 200% zoom reflow without loss of content or function.

### 5.15 Accessibility targets

- WCAG 2.2 AA for contrast, focus, labels, and reflow.
- Full keyboard path: login → navigate → open dialog → edit → save → delete confirmation.
- Screen-reader announcements for async price loads, AI responses, and toasts.
- No motion without a reduced-motion alternative.

---

## 6. Functional dependencies

| Area | Dependency | Why it matters |
|---|---|---|
| Routing migration | React Router already installed; `ProtectedRoute` exists | Tab state must map to routes without breaking auth redirects |
| Persistence fix | `applySnapshot`/`persistSnapshot`, `usePortfolioSync` | Journal fix must use the same pipeline; tests must cover provider abstraction |
| Alerts | Server-side or market-hours evaluation + persisted trigger state | Client polling is insufficient for reliable alerts |
| Charts | `/api/prices` contract (or new `/api/history`) with provider fallbacks | Removes direct Yahoo calls and CORS risk |
| News/AI | Existing `/api/news` and AI endpoint availability | State handling depends on real error shapes |
| Theme | `next-themes` already installed | Remove the competing `darkMode` class toggle |
| Auth | Firebase provider behind `src/lib/auth` | Redirect-back behavior must remain provider-neutral |
| Market clock | `getMarketStatus` / `useMarketStatus` | Refresh cadence and freshness labels depend on it |
| Design tokens | Existing CSS variables + Tailwind config | Consolidation can be incremental, not a rewrite |

---

## 7. Risks

1. **Persistence refactor risk.** Touching `applySnapshot` can regress every mutation. Mitigate with characterization tests before changing behavior.
2. **Routing migration risk.** Deep links and auth redirects are easy to break; add route-level tests and manual back/forward checks.
3. **Theme migration risk.** Removing `.dark !important` overrides may expose contrast regressions in News/FnO/AI. Migrate one component at a time with visual checks.
4. **Backend dependency risk.** Alerts and chart history may require API work owned by the API integration worktree. UI must not assume endpoints that do not exist.
5. **Cross-worktree merge risk.** Three dirty worktrees share base `a2d56a9`; overlapping files (Index, UI components) will conflict if all three evolve independently. Sequence merges deliberately.
6. **Brand risk.** Darkening `--primary` for text changes visual identity. Decide whether brand amber is a fill-only color before enforcing token changes.
7. **Scope risk.** The audit spans correctness, accessibility, and visual redesign. Treat P0/P1 correctness as a separate phase from visual refinement.
8. **Verification gap.** No browser testing was performed; contrast and layout findings are source-derived and must be confirmed in-browser before final acceptance.

---

## 8. Acceptance criteria

### P0 correctness
- Editing a journal note, then adding/editing a trade, then reloading preserves the note.
- Watchlist supports add, edit, delete, and shows a purposeful empty state; new items persist.
- Price alerts either evaluate and display a real trigger state, or are explicitly labeled as non-evaluating with the "active" affordance removed.

### Routing and shell
- Every section has a URL; refresh restores the section; back/forward moves between sections.
- `ProtectedRoute` returns the user to the attempted section after login.
- Sidebar is operable with Tab/Enter/Space, exposes `aria-current`, and has a visible focus ring.

### Accessibility
- No zoom lock; 200% zoom reflows without loss.
- Body text ≥ 4.5:1, large text ≥ 3:1, UI boundaries ≥ 3:1 in both themes.
- All dialogs trap focus, close on Escape, restore focus, and have `role="dialog"`.
- All inputs have programmatic labels; errors are announced and associated.
- All icon-only actions have accessible names including entity context.
- Automated axe checks pass on login, dashboard, watchlist, portfolio, F&O, news, and journal.

### Responsive
- 360–1920 px: no body-level horizontal scroll; navigation always reachable; tables scroll internally; dialogs usable on mobile keyboards.

### Data integrity
- Dates are stored as ISO and parsed by one shared function; History filters include/exclude correctly for all input formats.
- CSV export quotes fields and neutralizes formula-leading cells.
- No duplicate price pollers for overlapping tickers.

### States
- Every data surface has empty, loading, error-with-retry, and stale/freshness states.
- No dead controls (search, unused widgets, native `confirm`).

---

## 9. Recommended implementation order and tests

### Phase 0 — Guardrails (before UI changes)
1. Commit or snapshot the current worktree state so changes are reviewable.
2. Add characterization tests for `applySnapshot`/`persistSnapshot` and `usePortfolioSync`.
3. Add a token contrast unit test that parses CSS variables and asserts AA pairs.
4. Add axe to a minimal component test harness.

**Exit:** baseline tests green; no behavioral change.

### Phase 1 — P0 correctness
1. Journal notes through `applySnapshot`.
2. Watchlist add flow + empty state.
3. Alert evaluation or honest labeling.

**Tests:** persistence round-trip; watchlist add/edit/delete; alert state transitions; reload assertions.

### Phase 2 — Navigation and shell
1. Tab-state → routes, nested layout, redirect-back.
2. Semantic, keyboard-operable navigation.
3. Single theme source; shell toggle; token-based loading screen.
4. Real search or removal.

**Tests:** route rendering, back/forward, auth redirect, keyboard navigation, theme persistence.

### Phase 3 — Responsive and accessibility
1. Remove zoom lock; add reduced-motion globally.
2. Mobile navigation pattern.
3. Dialog/AlertDialog standardization; labels, errors, `aria-invalid`.
4. Accessible names for icon-only actions; chart/table alternatives.
5. Contrast token fixes for light mode.

**Tests:** Playwright keyboard smoke, viewport matrix, axe on key routes, reduced-motion emulation, zoom/reflow manual check.

### Phase 4 — Data integrity and states
1. Shared date parser + ISO storage; History filter fix.
2. CSV escaping and injection guard.
3. Single price scheduler (TanStack Query or module subscriber).
4. Chart history through the API layer with retry.
5. Empty/loading/error states across tables, charts, analytics.

**Tests:** date-format matrix, filter boundary cases, CSV fixtures (commas/quotes/newlines/leading `=`), request-count assertions for polling, chart retry behavior.

### Phase 5 — Design system consolidation and polish
1. Token migration for AI/News/FnO/Login; delete overrides.
2. Typography and spacing scale; table density and column priority.
3. Motion budget; state component family; 404 via router.
4. Visual QA in both themes at all breakpoints.

**Tests:** visual regression snapshots for key screens in light/dark and 3 widths; token lint (no raw hex in components); final axe + manual screen-reader pass.

### Suggested test pyramid

- **Unit (Vitest):** parsers, reducers, persistence, CSV, token contrast.
- **Component (Testing Library):** forms, dialogs, tables, filters, navigation.
- **Integration:** auth redirect, mutation → persist → reload.
- **E2E (Playwright, if adopted):** login, dashboard, add trade, edit journal, export, delete confirmation, mobile nav.
- **Manual:** screen reader (NVDA/VoiceOver), 200% zoom, keyboard-only, both themes, 360–1920 px.

---

## 10. Verified facts vs. assumptions (summary)

**Verified from source/Git:**
- All worktree, branch, HEAD, and status facts in §1.
- Every finding marked **Verified** in §3, with the cited file and line.
- Contrast ratios in §3 P1-7 are computed from declared HSL tokens.
- No application code was modified during this audit; the only new file is this report.

**Assumptions / unverified:**
- Actual rendered layout, overflow, and focus order at each breakpoint.
- Runtime behavior of Yahoo endpoints, `/api/news`, AI endpoints, and Firebase auth in this environment.
- Whether brightness/darkness of brand amber is negotiable.
- Whether alert evaluation will be implemented server-side or explicitly deferred.
- Screen-reader announcements in practice (source semantics suggest failures, but no AT session was run).

---

## 11. Reproduce the verification

```bash
# Worktree identity
git -C "E:/Projects/Stock-Tracker/ui-ux" rev-parse --abbrev-ref HEAD
git -C "E:/Projects/Stock-Tracker/ui-ux" rev-parse HEAD
git -C "E:/Projects/Stock-Tracker/ui-ux" status --short
git -C "E:/Projects/Stock-Tracker/ui-ux" diff --cached --name-only   # must be empty

# Isolation of the other two worktrees
git -C "E:/Projects/zen-stock-folio" rev-parse --abbrev-ref HEAD
git -C "E:/Projects/zen-stock-folio" rev-parse --short HEAD
git -C "E:/Projects/Stock-Tracker/api-integration" rev-parse --abbrev-ref HEAD
git -C "E:/Projects/Stock-Tracker/api-integration" rev-parse --short HEAD
git worktree list
```

**Current expected output:** UI/UX `feat/ui-ux-refinement` @ `a2d56a9…`, 24 dirty entries, 0 staged; main `feat/firebase-cloudflare-migration` @ `a2d56a9`, 34 entries; API `feat/api-provider-integration` @ `a2d56a9`, 51 entries.

---

**Status:** Audit complete. No application code changed. Awaiting approval before implementing any finding.
