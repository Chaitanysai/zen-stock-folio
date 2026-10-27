# Upstox Re-Authorization Runbook (secure redesign)

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


## What replaced what

| Legacy endpoint (Vercel, frozen) | Disposition | Replacement |
|---|---|---|
| `GET /api/refresh-token` | **Removed** â€” Upstox v2 has no refresh flow that reuses an access token as an authorization code (the old endpoint passed `UPSTOX_ACCESS_TOKEN` as `code`), and it returned a fresh access token in an **unauthenticated JSON response** (`api/refresh-token.ts:39-43`). Nothing of value is lost by removing it. | none â€” the daily flow below replaces it |
| `GET /api/auth/callback` | **Redesigned** as `functions/api/ops/upstox-callback.ts` â€” requires the long random `key` query parameter to match the `UPSTOX_OPS_KEY` secret (constant-time compare, 404 to everyone else) before it will exchange a code or render anything. The legacy version rendered access tokens in HTML for anyone holding the OAuth redirect. | the same daily flow, gated by the ops secret |
| `api/sync.ts` (Upstash Redis snapshot API) | **Removed** â€” verified dead: no caller anywhere in `src/` (Phase 0 audit). Snapshots live in `portfolio_snapshots` via `usePortfolioSync`, moving to Firestore. | none â€” historical note: Upstash Redis keys `zen-stock-folio:sync:user:{supabaseUid}` may still exist in the Upstash account; they are superseded and can be deleted during decommissioning |

## Daily re-authorization flow (manual, secure)

Upstox access tokens expire daily (3:30 AM IST). There is no server-side
refresh in Upstox v2; the token must be regenerated each day.

1. One-time setup (staging/production):
   - Generate a long random secret: `openssl rand -hex 32`.
   - `wrangler pages secret put UPSTOX_OPS_KEY` with that value.
   - In the Upstox developer app, register the redirect URL
     `<origin>/api/ops/upstox-callback` (e.g. `https://zenfolio.pages.dev/api/ops/upstox-callback`).
   - `wrangler pages secret put UPSTOX_API_KEY` / `UPSTOX_API_SECRET`.
2. Each trading day:
   - Open `https://<origin>/api/ops/upstox-callback?key=<UPSTOX_OPS_KEY>` â€”
     without `code` it shows a short start page (Upstox OAuth is initiated
     from the Upstox developer app's login URL for the day's authorization
     code, which redirects back to this endpoint with `?code=â€¦&key=â€¦`).
   - Approve the Upstox consent screen. The callback exchanges the code and
     shows the new access token once, to the operator holding the key only.
   - `wrangler pages secret put UPSTOX_ACCESS_TOKEN` with the new value and
     redeploy/restart so the new token is picked up.

## Security properties

- The callback is unfindable without the ops key (404, not a login page) and
  the comparison is constant-time.
- The token is rendered once to the operator; it is never logged, never
  stored by the function, and never returned in JSON.
- No trading/order endpoints exist or are planned; the token is used
  read-only for market quotes.
- Until the app migrates off Upstox for quotes, this manual daily step
  remains an accepted operational cost (same as the current Vercel flow).
