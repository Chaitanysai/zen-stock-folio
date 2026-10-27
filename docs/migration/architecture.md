# Target architecture (Firebase + Cloudflare)

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


Status: **implemented in the working tree, not deployed.** Nothing in this
document has been created in Cloudflare or migrated in Firebase. Cutover
requires the approvals listed in `cutover-checklist.md`.

## Shape

```
Browser â€” Vite SPA (src/), served as static assets
  |
  |-- Firebase Auth        identity, email verification, ID tokens
  |-- Firestore            portfolios/{uid}, users/{uid}   (owner-only rules)
  |-- /api/*               same-origin fetch, Bearer <Firebase ID token>
        |
        '-- Cloudflare Pages Functions (functions/api/*.ts)
              |-- Identity Toolkit accounts:lookup   (token verification)
              |-- Upstox / Yahoo                     (prices, F&O)
              |-- NewsAPI / Finnhub                  (news)
              |-- Groq / OpenRouter                  (AI)
              '-- KV: PRICE_CACHE                    (EOD cache, optional)
```

Two independent provider switches select the stack at build time:

| Switch | Values | Where read |
|---|---|---|
| `VITE_AUTH_PROVIDER` | `supabase` (default) \| `firebase` | `src/lib/auth/` provider selection |
| `VITE_DATA_PROVIDER` | `supabase` (default) \| `firestore` | `src/lib/data/` provider selection |

They must be switched **together**. Authenticating against one backend while
persisting to the other splits a user's identity from their data.

## Layering and ownership

Each boundary has exactly one owner, so a future change touches one file.

| Concern | Owner | Notes |
|---|---|---|
| Snapshot read/write contract | `src/lib/data/types.ts` | `LoadSnapshotResult` distinguishes "no data" (`{status:"ok", snapshot:null}`) from "read failed" (`{status:"error"}`) |
| Cloud persistence | `src/lib/data/supabasePortfolioStore.ts`, `firestorePortfolioStore.ts` | Same interface; adapters never leak provider errors as "no data" |
| Sync lifecycle / hydration gate | `src/hooks/usePortfolioSync.ts` | `SyncStatus = idle\|loading\|ready\|degraded`; writes are blocked until the current scope completed a successful cloud read |
| Profile read/write | data-store abstraction (`loadDisplayNameFromServer` / `saveDisplayNameToServer`) | `src/pages/Index.tsx` no longer imports Supabase |
| Client API calls | `src/lib/api.ts` (`withAuthHeaders` / `apiFetch`) | Attaches `Authorization: Bearer <token>` in firebase mode, returns `null` token in supabase mode so call sites stay branch-free |
| Token acquisition | `src/lib/auth/token.ts` | Dynamic Firebase import; never bundles Firebase into the Supabase path |
| Server identity boundary | `functions/api/_lib/auth.ts` | Single verification point; `requireIdentity` + `requireVerifiedIdentity`; fails closed |
| Price cache | `functions/api/_lib/kvPriceCache.ts` | Disposable cache; no-op without the KV binding |
| Firestore authorization | `firestore.rules` | Owner-only, no wildcard matches, payload `uid` must equal document ID |

## Invariants

1. **No cross-provider hydration.** A save never happens before a successful
   cloud read in the same scope. This prevents a Firebase-mode client from
   overwriting existing data with an empty local snapshot after a failed read.
2. **Failed reads are never reported as empty.** `{status:"error"}` surfaces
   as `degraded` plus `CLOUD_UNAVAILABLE_MESSAGE`, and the UI tells the user
   persistence is unavailable rather than silently discarding.
3. **Identity is verified twice.** Browser session (Firebase Auth) and server
   token check (`accounts:lookup`) are independent; a client cannot talk to
   `/api/*` with a forged or unverified identity.
4. **Email verification gates data access** on both sides, matching the
   Supabase behaviour where no session exists before confirmation.
5. **Rollback stays warm.** The Supabase adapters, `api/` Vercel Functions,
   and `vercel.json` are untouched and functional until Phase G is explicitly
   authorized. Deleting them is the last, irreversible step.

## Data model

```
portfolios/{uid}   { uid, snapshot, updatedAt }   one whole-portfolio snapshot
users/{uid}        { uid, displayName, updatedAt } profile metadata
```

The document ID is the owner's auth uid. Rules require
`request.auth.uid == uid` for reads and writes, and `request.resource.data.uid == uid`
plus `resource.data.uid == uid` on create/update, so an owner cannot re-point a
document at another account.

Supabase tables map as follows (see `route-inventory.md` for the full matrix):

| Supabase | Firebase | Disposition |
|---|---|---|
| `portfolio_snapshots` | `portfolios/{uid}` | **Not migrated** â€” owner decision 2026-10-28; users start fresh (backup held 0 rows) |
| `profiles` | `users/{uid}` | **Not migrated** â€” owner decision; created on first profile save (0 rows) |
| `auth.users` | Firebase Auth users | Identity-only, re-created; passwords cannot be exported |
| `eod_price_cache` | KV `PRICE_CACHE` | **Not migrated** â€” disposable cache, regenerates |

## Failure modes and direction of failure

| Failure | Behaviour |
|---|---|
| Firestore read fails | `degraded`; saves blocked; user told cloud is unavailable |
| Firestore read succeeds with no doc | `ok` + `snapshot:null`; first save creates the document |
| No Firebase session | `getApiAuthToken` returns `null`; server returns 401 |
| Unverified email | Server returns 403 (verification required) |
| Identity Toolkit outage | 503, fail closed â€” never treat as authenticated |
| KV binding absent | Cache no-ops; endpoints serve live data only |
| All price providers fail | 503 with no fabricated prices |
| All news providers fail | 503; client shows its existing "mock data" badge |

## Why not alternatives

- **Firebase Admin SDK in Functions** â€” requires Node crypto and a bundled
  service account; not Workers-compatible. The Identity Toolkit REST lookup is
  the supported path and isolates the swap if local JWT verification is added.
- **Firestore for price caching** â€” would add read/write cost and rules
  surface for data that is already disposable. KV is server-side and free at
  this volume.
- **Keeping both backends live and syncing** â€” dual-write across two identity
  systems has no correct merge semantics for a whole-snapshot document. One
  provider at a time, switch together.
