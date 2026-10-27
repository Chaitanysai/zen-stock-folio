# Cloudflare Pages Functions â€” API Design (Phase 3)

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


Status: **implemented locally, nothing deployed, no resource created.** The
resource plan below requires explicit approval before anything is created.

## Endpoint migration matrix

| Endpoint (Vercel, frozen in `api/`) | Pages Function | Auth | Rate limit (per user/min) | Body cap | Disposition |
|---|---|---|---|---|---|
| `POST /api/prices` | `functions/api/prices.ts` | Firebase ID token (required) | 120 (1 s poll budget) | 4 KB | **Migrated** â€” Upstox â†’ Yahoo â†’ KV EOD cache; `asOf` on every entry; `stale` flag; cache back-fill additive |
| `POST /api/fno-prices` | `functions/api/fno-prices.ts` | Firebase ID token | 20 | 16 KB | **Migrated** â€” Upstox NFO â†’ Yahoo spot (FUT only); schema-validated; no cache (position-specific) |
| `POST /api/ai` | `functions/api/ai.ts` | Firebase ID token | 10 | 32 KB | **Migrated** â€” finite chain Groq (2 models) â†’ OpenRouter (2 models) â†’ 503; bounded inputs |
| `POST /api/news` | `functions/api/news.ts` | Firebase ID token | 10 | 4 KB | **Migrated + corrected** â€” NewsAPI â†’ Finnhub â†’ honest 503; the fabricated-headlines Groq fallback was removed |
| `GET/POST /api/sync` | â€” | â€” | â€” | â€” | **Removed** (dead: no frontend caller; snapshots live in Firestore now). Historical note in `upstox-reauth.md` |
| `GET /api/auth/callback` | `functions/api/ops/upstox-callback.ts` | **Ops secret** (`UPSTOX_OPS_KEY`, constant-time compare; 404 otherwise) | n/a | n/a | **Redesigned** â€” no token rendering without the ops secret |
| `GET /api/refresh-token` | â€” | â€” | â€” | â€” | **Removed** â€” Upstox v2 has no access-token-as-code refresh; it leaked tokens in unauthenticated JSON |

Auth policy note: all four data/ML endpoints require a Firebase ID token.
This was evaluated against the product, not applied blindly â€” every caller
(`useLivePrices`, `FnOTable`, `AIInsights`, `StockNewsFeed`,
`AddTransactionDialog`) sits behind login in the dashboard; no public page
consumes the API (the landing page uses client-side sample data). With auth
on all four, the anonymous attack surface is zero and rate limits key on
the user id. Same-origin SPA calls need no CORS headers; cross-origin calls
must be in `ALLOWED_ORIGINS` or receive no CORS grant.

Identity is also gated on **email verification**: `requireVerifiedIdentity`
(applied to all four handlers) returns 403 when the ID token's `emailVerified`
is false, matching Supabase's behaviour where no session exists before
confirmation. `requireIdentity` remains available for endpoints that only need
a signature.

## Identity boundary

`functions/api/_lib/auth.ts` is the single verification point: Firebase
ID tokens are verified via Google's Identity Toolkit `accounts:lookup` REST
endpoint (Workers-compatible; no Admin SDK, no Node crypto), with a 5-minute
per-isolate lookup cache and a 1000-entry cap. It fails closed everywhere:
missing token â†’ 401, server misconfiguration â†’ 503, verification outage â†’
503. Swapping to local JWT verification later touches only this file.

## Resource plan (awaiting approval â€” nothing created)

| # | Resource | Purpose | Cost | Exists today | Required permission |
|---|---|---|---|---|---|
| 1 | Pages project (proposed name `zenfolio`) | Hosts the SPA + Functions from `functions/` | Free tier | No (`wrangler pages project list` is empty) | `pages (write)` âœ… held |
| 2 | KV namespace (proposed binding `PRICE_CACHE`) | EOD price cache only (30 h TTL entries) | Free tier (â‰ˆ100 k reads/day, 1 k writes/day; design keeps writes â‰ˆ tickers Ã— 2/day) | No (`wrangler kv namespace list` is empty) | `workers_kv (write)` âœ… held |
| 3 | Project secrets (env) | `FIREBASE_API_KEY`, `UPSTOX_ACCESS_TOKEN`, `NEWS_API_KEY`, `FINNHUB_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_OPS_KEY` | Free | n/a | `wrangler pages secret put` (user action â€” values come from the Vercel dashboard) |
| 4 | WAF rate-limiting rule (optional, Phase 5) | Hard global cap complementing the per-user in-isolate limiter | Free tier includes 1 rule | No | Dashboard/rule config |
| â€” | Durable Objects / R2 / Queues / new Workers | **Not needed** â€” explicitly rejected | â€” | â€” | â€” |

No resource from this table has been created. `wrangler.toml` carries the
KV binding as a commented template pending approval.

## Cache design (`functions/api/_lib/kvPriceCache.ts`)

- **Key design:** one key per ticker, `eod:{TICKER}`; value = last settled
  quote `{price, weekHigh52, weekLow52, changePercent, change, asOf, source}`.
- **TTL tiers:** the 30 h TTL applies to **EOD entries only**. Intraday
  quotes are never served from KV as fresh â€” during the session the cache is
  a fallback and every entry exposes its original `asOf`. (Cross-request
  intraday softening comes free from Upstox/Yahoo; a 60 s edge-cache tier is
  a documented future option, not a Phase 3 need at this scale.)
- **Write policy:** writes happen **only while the market is closed**
  (server-side IST check, weekends closed; unknown holidays fail open â€” the
  safe direction for caching), amortised: an entry is rewritten only when
  the new quote is â‰¥30 min newer. Resulting volume â‰ˆ tickers Ã— 2/day â€” far
  under the free-tier 1 k writes/day quota.
- **Freshness rules:** provider errors are never cached (only structurally
  valid quotes reach the cache); cache-served data is labelled
  `source="kv-cache"` + `stale:true` and never merged over a live result;
  `asOf` always reflects the upstream fetch time.
- **Degraded mode:** without the binding (local dev/tests/pre-approval)
  every cache call is a no-op and endpoints behave live-only.

## Contract compatibility

All four handlers keep the exact paths, methods, request/response shapes of
the Vercel endpoints. Additive fields only: `prices` entries gain `asOf`,
responses gain `stale` (prices) â€” `source` values are preserved with one
addition (`kv-cache` joins `upstox-live | yahoo-chart`); news may now
return 503 where it previously returned fabricated items (the client
already renders its "mock data" badge on any failure).

**[F2] is fixed.** `src/lib/api.ts` now owns authorization through
`withAuthHeaders`/`apiFetch`, and the former raw-`fetch` call sites
(`useLivePrices.ts`, `AddTransactionDialog.tsx`, `FnOTable.tsx`,
`StockNewsFeed.tsx`) all route through it. `src/lib/auth/token.ts` supplies
`Authorization: Bearer <Firebase ID token>` only when the auth provider is
firebase; in supabase mode it returns `null`, so call sites carry no provider
branch and the rollback path keeps its exact previous behaviour. Remaining
coordination items are [F1] (shared `source` vocabulary) and [F3] (client
abort vs provider-chain timeout), both pre-existing and tracked in
`phase4-regression.md`.

## Security remediations carried into the functions

1. All four endpoints require ID tokens (was: none).
2. Per-user rate limits sized to real polling budgets.
3. Restrictive CORS (allowlist, default deny) replaces `Access-Control-Allow-Origin: *`.
4. Zod schemas + hard byte caps replace unvalidated bodies.
5. Bounded timeouts everywhere (5â€“20 s); finite provider chains.
6. No secrets, upstream error bodies, or provider tokens in any response (tested).
7. No fabricated market prices (tested: 503 when sources fail) and no fabricated news.
8. Ops endpoints can no longer hand tokens to unauthenticated callers (tested: 404 without the secret).
