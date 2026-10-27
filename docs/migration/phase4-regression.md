# Phase 4 â€” Regression & API Contract Verification

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


> **Update (integration pass):** **[F2] is fixed** â€” `src/lib/api.ts` now injects
> `Authorization: Bearer <Firebase ID token>` in firebase mode via
> `withAuthHeaders`/`apiFetch`, and all former raw-`fetch` call sites route
> through it; supabase mode still sends no token. [F1] and [F3] remain open,
> pre-existing, and are tracked below. See `architecture.md` and
> `cloudflare-api.md`.

**Status: PASS with 3 coordination/cutover findings (none block local verification; two must land before staging).**
**Mode:** local verification only. No Cloudflare resources created, nothing deployed, no providers enabled, `api/` (Vercel rollback path) untouched, nothing committed. The parallel worktree `E:/Projects/Stock-Tracker/api-integration` (branch `feat/api-provider-integration`, same HEAD) was not modified.

---

## 1. Starting state (verified, not assumed)

- Branch `feat/firebase-cloudflare-migration` @ `a2d56a9â€¦`; 9 modified tracked files (Phases 1â€“3), stash intact, backups checksum-identical (`e170c605â€¦`, `76cdb2baâ€¦`), both still gitignored.
- Phase 3 claims re-verified against code: all four handlers call `requireIdentity` (`functions/api/prices.ts:131`, `fno-prices.ts:156`, `ai.ts:107`, `news.ts:131`); zero `Access-Control-Allow-Origin: *` in `functions/`; zero Groq references in `functions/api/news.ts`; docs `cloudflare-api.md` + `upstox-reauth.md` present and consistent with the implementation.
- Parallel workstream confirmed via `git worktree list`.

## 2. Frontend/API contract audit (all five call sites traced)

| Caller | Request | Response consumption | Verdict against Pages Function |
|---|---|---|---|
| `src/hooks/useLivePrices.ts:88-101` | `{tickers}` (rel. path, 2 retries, 800 ms throttle) | `{prices, fetchedAt, source}` merge-not-replace; `!res.ok` â†’ `data.error` (+optional `data.hint`) into UI state, non-throwing | âœ… Compatible. `asOf`/`stale` additive. **[F1]** `source` vocabulary mismatch (pre-existing) â€” see Â§6 |
| `src/components/FnOTable.tsx:684-714` | `{trades:[{id,symbol,instrumentType,strike,expiry,lotSize,lots}]}` | `ltpMap` (ltp/change/iv/delta), `source`; **silently ignores any `!res.ok`** | âœ… Compatible (503/429 handled by silent-skip, matching the provider-failure UX) |
| `src/components/AIInsights.tsx:209-260` | `{type:"analysis"\|"chat", portfolioContext, messages}` via `fetchApi` | `{response?, insights?}`; thrown server `error` message surfaced in UI (incl. âš ï¸ chat bubble) | âœ… Compatible â€” `{error}` envelope matches `fetchApi` extraction (`src/lib/api.ts:68-82`) |
| `src/components/StockNewsFeed.tsx:263-279` | `{tickers}` + `AbortSignal.timeout(8000)` | `res.ok â†’ items`; **any failure â†’ `getMockNews` + visible "mock data" badge** | âœ… Fully compatible with the honest-503 design: no `items` in the 503 body â†’ mock path taken, nothing fabricated |
| `src/components/AddTransactionDialog.tsx:52-62` | `{tickers:[userTyped]}` | `data?.prices?.[val]` with `p.price > 0` guard; failure â†’ CMP falls back to entry price | âœ… Compatible (400 for an invalid ticker yields the same fallback as the old 503) |

**Backward compatibility of new fields:** `asOf` and `stale` are additive and unconsumed by any caller â€” no behavioral change. `source="kv-cache"` is stored but not branched on in the UI.

**[F2 â€” cutover-blocking, must land before staging] Authorization headers are missing on every caller.** `src/lib/api.ts` sends no `Authorization`; neither do the three raw-`fetch` call sites. Against the new handlers (by design) every request would be 401. Required cutover change (Phase 5, not implemented in this verification phase): inject `Authorization: Bearer <getIdToken()>` centrally â€” extend `fetchApi` with an auth hook and migrate the three raw-`fetch` call sites (`FnOTable.tsx:684`, `StockNewsFeed.tsx:263`, `AddTransactionDialog.tsx:52`) onto it, enabled only when `VITE_AUTH_PROVIDER=firebase`.

**[F3 â€” pre-existing, not a regression] Client/server timeout mismatch:** `StockNewsFeed` aborts at 8 s while the provider chain allows 8 s + 8 s. Same mismatch exists in production today (it also had a third provider); the client abort â†’ mock state. Recorded for the integration workstream (options: parallel providers or shorter first-provider timeout).

## 3. Authentication & isolation findings

- Missing token â†’ 401; invalid token â†’ 401; verification outage â†’ 503; missing `FIREBASE_API_KEY` â†’ 503 (fail-closed) â€” verified in `functions/api/_lib/lib.test.ts` and re-checked in code.
- **No handler trusts a client-supplied UID:** grep-verified â€” the only uid source in all four handlers is `auth.identity.uid` (from the verified token); rate-limit keys and any future data access derive from it. No request body field can assert identity.
- Rate limits enforced as documented (120/20/10/10 per user-minute) â€” asserted in handler tests including the 121st-prices-request 429 with `Retry-After`.
- CORS: allowlist-only reflection; disallowed origins get 403 preflight and no CORS headers on JSON responses (tested).
- Firestore isolation: rules suite 7/7 (owner-only, payload-uid `WITH CHECK`, cross-user denied, unauthenticated denied).

## 4. Portfolio migration & local-first behavior

- Snapshot parsing/mapping/dry-run/idempotency/conflicts/emulator-guard: covered by `importPlan.test.ts` (unit) + `firestoreImport.emulator.test.ts` (emulator) â€” all green, including "second apply creates nothing" and "create-only no-overwrite".
- **No real data touched:** production Firestore remains empty (importer refuses without `FIRESTORE_EMULATOR_HOST` â€” refusal re-verified in Phase 2 and unchanged).
- **Local-first keys preserved:** `smart-stock-tracker-data` prefix, guest/per-user/legacy key rules untouched in `src/hooks/usePortfolioSync.ts` (verified by reading the file; the 12 cache-scoping tests pass unchanged).
- Supabase remains the active provider: `VITE_AUTH_PROVIDER` / `VITE_DATA_PROVIDER` default to `supabase` (`.env.example` + `src/lib/auth/index.ts`, `src/lib/data/index.ts`); production Vercel behavior unchanged.

## 5. Market-data & news regression findings

- Valid quotes (Upstox and Yahoo shapes), provider auth failure, provider 5xx/timeout, fallback order (Upstox â†’ Yahoo â†’ cache), F&O instrument-key construction (`NFO_OPT|SYMBOL|ISO|STRIKE|CE` verified in the called URL), schema rejection of invalid symbols/types, oversized (413) and malformed (400) bodies â€” all asserted in the handler tests (45/45 green).
- Cache freshness: EOD entries carry their original `asOf`; cache-served responses are `source="kv-cache", stale:true` and never merge over live results; writes occur only while the market is closed and amortised â‰¥30 min (tested). Cache-disabled execution (no binding) is a full no-op (tested).
- No fabricated prices: total provider failure â†’ 503 with **no `prices` key** (tested). No fabricated news: providers failed â†’ 503, no `items`, Groq provably never called (tested).
- No credential/token leakage: responses asserted free of the Upstox token and Firebase key; `Authorization` never reflected; ops callback renders tokens only behind the ops key (tested) and never on failure.

## 6. Items for the API integration workstream (`feat/api-provider-integration`)

**[F1] `source` vocabulary divergence (pre-existing):** the frontend's `PriceSource` union (`upstox-live | yahoo-v8-eod | yahoo-v7-eod | stooq-eod | memory-cache`, `useLivePrices.ts:8-15`) matches neither the frozen Vercel handler (`upstox-live | yahoo-chart | db-cache`) nor the Pages port (`upstox-live | yahoo-chart | kv-cache`). The frontend blind-casts, so nothing breaks today, but the single source vocabulary needs one owner. The Pages contract stands ready to adopt whatever vocabulary the integration workstream standardises on (mapping is mechanical: `kv-cache` â‰ˆ `memory-cache`/`db-cache`).
**Missing contracts recorded (not implemented, per instructions):**
1. **Candles/history:** the dashboard fetches OHLC **browser-direct from Yahoo** (`PortfolioCharts.tsx:148-150`, `Index.tsx:1861`) â€” there is no `/api/candles`. If the workstream wants chart data on the authenticated API surface, it needs a new endpoint contract (symbol, range, interval; Yahoo is unauthenticated upstream).
2. **Ticker search/quote autofill:** `AddTransactionDialog` reuses `/api/prices` for single-ticker quotes; a dedicated search endpoint does not exist.
3. **Timeout policy:** see [F3] â€” one shared decision for provider chains vs the client's 8 s abort.

## 7. Complete verification suite â€” actual results

| Command | Result |
|---|---|
| `npm run test` | **145 passed, 0 failed**, 12 skipped (emulator-gated suites skip by design; 19 files passed, 3 skipped-file) |
| `npm run test:rules` | 7 passed, 0 failed |
| `npm run test:migration` | 4 passed, 1 intentionally skipped (documented auth-emulator limitation), 0 failed |
| `npx tsc -p tsconfig.app.json --noEmit` / `-p tsconfig.node.json --noEmit` | both clean |
| `npm run lint` | **68 problems (55 errors, 13 warnings) â€” exactly the pre-existing baseline**, zero new |
| `npm run build` | success (~30 s) |
| Browser smoke (`vite preview` @ :4173 + `scripts/verify-preview.mjs`) | HTTP 200; title "ZenFolio â€” Indian Stock Portfolio Tracker"; **0 console errors, 0 failed requests**; no blank-page crash (a2d56a9 regression holds); renders login/landing gracefully with the unreachable Supabase backend (auth cannot be exercised locally without providers â€” by design this phase) |

No test was removed, weakened, or skipped to manufacture this result. Baseline comparison: identical to the Phase 3 baseline on every axis.

## 8. New defects

None found in the migration code during this phase. The three findings ([F1] vocabulary divergence, [F2] missing frontend auth headers, [F3] timeout mismatch) are coordination/cutover items, not regressions introduced by the migration â€” [F1]/[F3] pre-date this branch's API work.

## 9. Remaining prerequisites for staging (each awaiting its approval gate)

1. Resource-plan approval â†’ create Pages project + KV namespace (free tier).
2. [F2] implementation: frontend Authorization-header injection at cutover (small, behind `VITE_AUTH_PROVIDER=firebase`).
3. Owner re-enters provider secrets into Cloudflare (from the Vercel dashboard).
4. Firebase auth providers enablement (email/password + Google) + the synthetic-account bcrypt `importUsers` round-trip verification that the auth emulator could not perform.
5. Upstox redirect registration (`<origin>/api/ops/upstox-callback`) + `UPSTOX_OPS_KEY` per the runbook.
6. Coordination sync with `feat/api-provider-integration` on the `source` vocabulary and any new endpoint contracts before both branches converge.
