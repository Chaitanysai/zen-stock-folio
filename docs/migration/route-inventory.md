# Route and data inventory

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


Everything the application exposes, where it goes now, and where it goes after
cutover. Use this to check that no caller was missed when a provider is
retired.

## SPA routes (`src/App.tsx`)

| Path | Component | Auth | Data sources |
|---|---|---|---|
| `/login` | `Login` | public | Firebase Auth (firebase mode) / Supabase Auth (supabase mode) |
| `/signup` | `Login` | public | same |
| `/` | `Index` | protected â€” redirects to `/login` when no session | Firestore `portfolios/{uid}`, `users/{uid}`; `/api/prices`, `/api/news`, `/api/ai`, `/api/fno-prices` |
| `*` | `NotFound` | public | none |

No other page calls a backend. The landing/marketing surface uses client-side
sample data.

## HTTP API

Two implementations exist side by side. `functions/api/**` is the target;
`api/**` (Vercel) is the frozen rollback path.

| Method + path | Pages handler | Vercel rollback | Auth | Rate limit / min | Body cap |
|---|---|---|---|---|---|
| `POST /api/prices` | `functions/api/prices.ts` | `api/prices.ts` | Firebase ID token + verified email | 120 | 4 KB |
| `POST /api/fno-prices` | `functions/api/fno-prices.ts` | `api/fno-prices.ts` | same | 20 | 16 KB |
| `POST /api/ai` | `functions/api/ai.ts` | `api/ai.ts` | same | 10 | 32 KB |
| `POST /api/news` | `functions/api/news.ts` | `api/news.ts` | same | 10 | 4 KB |
| `GET /api/ops/upstox-callback` | `functions/api/ops/upstox-callback.ts` | `api/auth/callback.ts` | ops secret (`UPSTOX_OPS_KEY`, constant-time compare; 404 otherwise) | n/a | n/a |

Removed and not replaced:

| Path | Why |
|---|---|
| `GET/POST /api/sync` | Dead â€” no frontend caller; snapshots live in Firestore |
| `GET /api/refresh-token` | Upstox v2 has no access-token-as-code refresh; it leaked tokens in unauthenticated JSON |

Client call sites (all behind login): `src/hooks/useLivePrices.ts`,
`src/components/AddTransactionDialog.tsx`, `src/components/FnOTable.tsx`,
`src/components/StockNewsFeed.tsx`, plus AI insights. All go through
`src/lib/api.ts`, which is the only place that attaches the bearer token.

## Client-side backend touchpoints

| Touchpoint | Supabase path | Firebase path |
|---|---|---|
| Session / user | `@supabase/supabase-js` auth | `firebase/auth` via `src/lib/firebase/auth.ts` |
| Portfolio snapshot | `portfolio_snapshots` table | `portfolios/{uid}` document |
| Profile name | `profiles` table | `users/{uid}` document |
| API authorization | Supabase session cookie/token (server unused) | `getIdToken()` â†’ `Authorization: Bearer` |
| EOD prices | n/a | `/api/prices` â†’ Cloudflare KV |

## Data migration matrix

| Supabase | Firebase / target | Rows in backup | Action |
|---|---|---|---|
| `auth.users` | Firebase Auth users | 1 | Re-create identity (email preserved; password cannot be exported â€” user resets) |
| `public.profiles` | `users/{uid}` | 0 | Nothing to copy |
| `public.portfolio_snapshots` | `portfolios/{uid}` | 0 | Nothing to copy |
| `public.eod_price_cache` | Cloudflare KV `PRICE_CACHE` | 13 | **Do not migrate** â€” disposable; regenerates on demand |
| RLS policies | `firestore.rules` | n/a | Re-expressed as owner-only document rules |

The practical result: production data migration is **identity only**. The
importer still supports snapshots and profiles so the path is proven and works
if the counts change before cutover.

## Endpoints that must not survive cutover

- Any Supabase client import in an active path (`src/lib/supabase.ts` stays
  only while the rollback path is retained).
- The Vercel `api/` directory and `vercel.json` â€” removed in Phase G, after
  verification, with explicit approval.
