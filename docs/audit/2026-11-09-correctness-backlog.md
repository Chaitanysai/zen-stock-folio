# Correctness backlog (carried from the 2026-10-27 UI/UX audit)

> **Status: evidence-only, not scheduled.** Produced during the UI/UX refinement
> initiative (Pass 1). The 2026-10-27 audit
> (`worktrees/ui-ux/UI_UX_AUDIT_REPORT.md`) was written against a codebase that
> has since been substantially restructured; its findings were re-verified
> against `origin/main` @ `c5d4d22` before being carried over.
>
> The UI/UX redesign explicitly does **not** change financial calculations,
> persistence or business logic. Anything in this file is a separate,
> independently-triaged workstream.

## Method

Each audit finding was checked against `origin/main` by reading the current
implementation. Findings are classified:

- **RESOLVED** — the current code already does the right thing.
- **CONFIRMED** — the defect is still present.
- **SUPERSEDED** — the code the finding described no longer exists in that form.

Verification was source-level. Runtime reproduction is noted per item where it
was actually performed.

---

## P0 — release-blocking candidates

### P0-1. Trade-journal notes persistence — **RESOLVED**

Audit claimed `Index.tsx` wrote journal notes through `setStocks`, bypassing the
snapshot pipeline, so the next persisted action would overwrite them.

Current code (`origin/main:src/pages/Index.tsx:522`):

```tsx
const handleJournalNotesUpdate = useCallback((ticker, notes) => {
  void applySnapshot(journalNotesPatch(snapshotRef.current, ticker, notes), "Journal update");
}, [applySnapshot]);
```

Notes now go through `applySnapshot` via a dedicated `journalNotesPatch` helper,
which is exactly the audit's recommendation. **No action.**

### P0-2. Watchlist add flow and empty state — **RESOLVED**

Audit claimed `WatchlistTable` received only `onEdit`/`onDelete`.

Current code (`origin/main:src/components/WatchlistTable.tsx:16,37,116`):
the props contract now includes `onAdd: (stock: WatchlistStock) => void`, and
`Index.tsx:928` wires `onAdd={handleWatchlistAdd}`. An add flow exists.
**Empty-state rendering was not verified in this pass** — a separate visual
check is required if an empty state is still absent. **No action in Pass 1.**

### P0-3. Price alerts presented as active but never evaluated — **RESOLVED**

Audit claimed alerts were created with `triggered: false` and never evaluated.

Current code:
- `src/lib/alerts/evaluator.ts` — a pure, unit-tested evaluator with explicit
  provenance rules (only `realtime`/`delayed`, non-stale, non-cached quotes may
  fire).
- `src/pages/Index.tsx:51` imports `evaluateAlerts`; `Index.tsx:545` calls it and
  consumes `{ alerts: nextAlerts, newlyTriggered }`.

Alert evaluation is implemented. **No action.**

---

## P1 — major

| Ref | Audit finding | Status on `origin/main` @ `c5d4d22` | Evidence |
|---|---|---|---|
| P1-1 | Tabs are state-only; no URLs, no history, no deep links | **CONFIRMED** | `src/App.tsx` declares only `/`, `/login`, `/signup`, `*`. The 13 dashboard sections are `tab` state inside `Index.tsx`. Back/forward and refresh do not preserve a section. |
| P1-2 | Sidebar nav not keyboard-operable, no semantics | **RESOLVED** | `dashboard/Shell.tsx:127` `<nav aria-label="Sections">`, `:284` `<nav aria-label="Primary">`, `:429` `<nav aria-label="All sections">`; `aria-current="page"` at `:138,298,436`. |
| P1-3 | Header search is dead UI | **PARTIALLY RESOLVED** | A functional search now exists (`handleSearchSelect` at `Index.tsx:659` navigates to a chart). Whether the *header* input is bound was not verified in this pass. |
| P1-4 | Two competing theme systems | **RESOLVED** | `App.tsx` uses `next-themes` `ThemeProvider` only; `src/lib/theme/accent.ts` + `useAccent.ts` + `AccentPicker.tsx` are the single source. |
| P1-5 | Mobile shell has no navigation pattern | **RESOLVED** | `dashboard/Shell.tsx` provides a rail, a pill nav, and a sheet nav (`aria-label="All sections"`). |
| P1-6 | Zoom disabled in viewport meta | **RESOLVED** | `index.html`: `width=device-width, initial-scale=1.0, viewport-fit=cover` — no `maximum-scale`, no `user-scalable=no`. |
| P1-7 | Light-mode contrast failures (amber primary 2.33:1 etc.) | **RESOLVED (re-verify visually)** | The amber `--primary` the audit measured is gone. `index.css` now documents `--brand` / `--brand-strong` / `--brand-ink` with intended usage and a near-black `--primary`. Ratios were not re-measured in this pass. |
| P1-8 | F&O modal lacks dialog semantics | **PARTIALLY RESOLVED** | `ui/dialog.tsx` and `ui/alert-dialog.tsx` are Radix-backed and available. Whether `FnOTable` still renders a custom `<div>` overlay was not verified in this pass. |
| P1-9 | Icon-only actions lack accessible names | **NOT VERIFIED** | Requires a component-by-component pass. |
| P1-10 | Trade History period filter silently drops trades | **NOT VERIFIED** | `src/lib/events/dateUtils.ts` exists but is festival-scoped. The trade-date parsing path was not traced. |
| P1-11 | Charts bypass the API layer | **NOT VERIFIED** | `useCandleHistory` now exists; the call path was not traced. |
| P1-12 | Duplicate price pollers | **NOT VERIFIED** | `useLivePrices` is still instantiated in more than one place per the file listing; not instrumented. |

## P2 / P3

The 2026-10-27 report's P2/P3 tables remain a useful checklist but were not
individually re-verified. Notable items superseded by the restructure:

- **P2-13 "four visual systems coexist"** — largely superseded; `index.css` is
  now a documented single token layer with a layer map in its header comment.
- **P2-20 "no global reduced-motion handling"** — superseded; `index.css` now
  carries a global `@media (prefers-reduced-motion: reduce)` block.
- **P2-15 "dead UI in bundle"** — partially superseded; the marketing landing was
  extracted to `src/pages/Landing.tsx`. `RiskAnalysis.tsx` still exists and was
  not confirmed as rendered.

---

## Recommended triage

1. **P1-1 (routing)** is the highest-value confirmed item and is architectural —
   it should be its own change with route-level tests, not a rider on a visual
   redesign.
2. **P1-9, P1-10, P1-11, P1-12** need a focused verification pass before they can
   be sized. Each has a concrete, cheap runtime reproduction.
3. **P0-2's empty state** and **P1-8's F&O dialog** are two small verifications
   that pair naturally with the Pass 2 visual work; they were left open here to
   avoid mixing correctness into a visual PR.

## Excluded from the UI/UX redesign by instruction

Journal persistence, watchlist add, alert evaluation, routing, navigation
semantics and zoom lock were audited here but **not modified**. No financial
calculation, persistence, or business logic was touched by Pass 1.
