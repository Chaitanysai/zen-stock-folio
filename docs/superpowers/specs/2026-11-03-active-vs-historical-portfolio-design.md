# Active Holdings vs Complete Portfolio and Historical P&L — Design

**Date:** 2026-11-03
**Status:** Approved for implementation
**Branch:** `feat/obsidian-dashboard`

## Goal

Separate the Home dashboard's data scope from the Portfolio's. Home answers
"what do I hold and how is it doing now?" using open quantities only. Portfolio
answers "what have I done, with which broker, and what did it earn, lose, or
leave unknown?" using the complete stored history.

## Non-negotiable safeguard

Missing information is never zero. A position is never inferred closed from the
age of a statement, the absence of a recent quote, or an old entry date.
Closure comes only from recorded sale quantities. A record whose cost, exit
price, date, currency or valuation is unavailable keeps that field explicitly
unavailable, is excluded from the affected totals, and is counted in the
disclosure the UI shows beside the total.

## Canonical model

`src/lib/portfolio/positions.ts` is a pure module over the stored lot rows
(`PortfolioStock`). It builds one **position** per `source:market:ticker` and
keeps the underlying rows as **lots** for expansion.

Per lot:

- `remaining` = stored quantity when the row is `Active`, otherwise `0`.
- `sold` = stored quantity when the row is closed (`Sold Profit`, `Sold Loss`,
  `Sold`), otherwise `0`.
- `realised` = `(exitPrice − entryPrice) × sold` when both are known; otherwise
  the broker's stored `statementPnl` when present; otherwise `null`.
- `unrealised` = `(price − entryPrice) × remaining` when cost and a usable price
  both exist; `0` when nothing remains; otherwise `null`.
- A closed lot is never valued at `cmp`. `cmp = 0` means "no market price".

Per position:

- `status`: `partial` when remaining > 0 and sold > 0; `active` when only
  remaining > 0; `unvalued` when nothing remains but at least one closed lot has
  no realised result; `closed` otherwise.
- Averages are quantity-weighted and become `null` when any contributing lot
  lacks the needed price.
- `marketValue` is `null` when any open lot is unpriced, never partially valued.
- `realised` and `unrealised` sum only known lots and expose completion flags;
  unknown lots are counted, never folded in as zero.
- Dates are the earliest known entry and latest known exit. Unknown stays absent.

## Totals (Portfolio dashboard)

Eight summary cards, all converted to INR through the existing FX layer:

1. **Total Invested Capital** — all-time cost of bought quantity, with open cost
   disclosed. Known lots only; unknown-cost lots counted.
2. **Current Market Value** — remaining quantity × usable price. Unpriced
   positions counted.
3. **Total Unrealised** — open quantity only, costed and priced only.
4. **Total Realised** — completed sales only, computed or broker-reported.
5. **Combined P&L** — eligible realised + eligible unrealised. The two sets are
   disjoint (sold units vs remaining units), so no share is counted twice.
   Excluded components are disclosed.
6. **Active Positions** — remaining > 0, split active/partial.
7. **Closed Positions** — remaining = 0, including historical-unvalued.
8. **Historical Transactions** — every stored lot, with imported count.

USD positions without a current rate are excluded from INR totals and counted,
never converted at an implied rate of 1.

## Charts

- Realised P&L by exit month (undated and unscoreable counted).
- Current unrealised P&L by position (Home uses the same derivation).
- Profit vs loss distribution over scored closed lots.
- Broker/source breakdown of invested, realised and unrealised.
- A combined composition view only, because unrealised history is not stored; no
  historical combined series is fabricated.

## Portfolio table

Position rows with expandable lots. Columns: name/ticker, ISIN when present,
broker/source, lifecycle status, bought/sold/remaining quantities, average buy
and sell, CMP, invested, market value, realised/unrealised/total P&L, entry and
exit dates. Search, sort, lifecycle and outcome filters, broker filter, date
range, pagination and CSV export. Unavailable values render as `—` with an
explanatory title, never `0`.

## Import safeguards

- Persist `isin` and the statement's own `statementPnl` on the mapped row.
- Preview shows lifecycle counts (active, partially sold, closed,
  historical-unvalued), unknown-cost lots, missing-date lots, unresolved symbols
  and the plan's added/replaced/retained counts.
- A standing notice states that Home uses open quantities only, so imported
  history cannot inflate its value, holding count or P&L.
- Statement-vs-computed P&L differences are surfaced as a discrepancy count; the
  calculated value stays canonical and the reported value is kept alongside.
- Replacement confirmation remains mandatory before a broker's rows are
  replaced; other sources are untouched.

## Explicit limitations

- Undated closed trades cannot be placed in a month; they are counted.
- Realised-only exports cannot supply unrealised valuation; those positions show
  unavailable.
- Cross-broker duplicate holdings are not merged (positions are broker-scoped).
- Broker charges may make stated P&L differ from price × quantity; differences
  are surfaced, not silently applied.
- INDmoney closed lots are symbol-aggregated by the sync plan.
- Historical unrealised P&L was never stored, so no combined history exists.

## Verification

Unit tests for every lifecycle and unknown-value rule, import mapping tests,
filter/sort tests, full suite, typecheck, build, and browser checks of Home,
Portfolio and the import preview at desktop, tablet and mobile widths.
