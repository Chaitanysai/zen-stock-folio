# Configuration reference

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


Three separate configuration surfaces. They never share values implicitly, and
no secret ever carries a `VITE_` prefix â€” that prefix is bundled into the
browser.

## 1. Browser bundle (`VITE_*`, from `.env.local`)

Copy `.env.example` to `.env.local`. Never commit real values.

| Variable | Required | Purpose |
|---|---|---|
| ~~`VITE_AUTH_PROVIDER`~~ | removed | Supabase adapter deleted; the build rejects the variable if it is still set |
| ~~`VITE_DATA_PROVIDER`~~ | removed | Same; Firestore is the only store |
| `VITE_FIREBASE_API_KEY` | firebase mode | Web app key; public, not a secret |
| `VITE_FIREBASE_AUTH_DOMAIN` | firebase mode | Auth domain from Firebase console |
| `VITE_FIREBASE_PROJECT_ID` | firebase mode | Project id |
| `VITE_FIREBASE_STORAGE_BUCKET` | firebase mode | Storage bucket id |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | firebase mode | Sender id |
| `VITE_FIREBASE_APP_ID` | firebase mode | App id |
| ~~`VITE_SUPABASE_URL`~~ | removed | Supabase is no longer a backend (rollback path deleted) |
| ~~`VITE_SUPABASE_PUBLISHABLE_KEY`~~ | removed | Same |
| `VITE_API_PROXY_TARGET` | optional | Local dev proxy: `http://localhost:3000` (`vercel dev`) or `http://localhost:8788` (`wrangler pages dev`) |

Access to data is enforced by Firebase Auth plus `firestore.rules`, never by
key secrecy. The web config is public by design.

## 2. Cloudflare Pages Functions (server-only)

Set with `wrangler pages secret put <NAME>`. Locally, copy
`.dev.vars.example` to `.dev.vars` (gitignored).

| Variable | Purpose |
|---|---|
| `FIREBASE_API_KEY` | Same public web API key as `VITE_FIREBASE_API_KEY`; used for the Identity Toolkit `accounts:lookup` token check |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. Empty = same-origin only (default, and correct for a Pages-hosted SPA) |
| `UPSTOX_ACCESS_TOKEN` | Market data |
| `UPSTOX_API_KEY`, `UPSTOX_API_SECRET` | Upstox OAuth client (ops callback) |
| `UPSTOX_OPS_KEY` | Operator secret for the callback endpoint |
| `NEWS_API_KEY`, `FINNHUB_API_KEY` | News providers |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY` | AI providers |

Non-secret vars (`ALLOWED_ORIGINS` if static) live in `wrangler.toml` under
`[vars]`. The KV binding `PRICE_CACHE` is a commented template; until it is
uncommented and given a real id, the cache layer is a full no-op and the API
serves live data only. Each Pages project needs its own namespace.

## 3. Firebase project

| File | Purpose |
|---|---|
| `.firebaserc` | Project alias used by the Firebase CLI |
| `firebase.json` | Firestore rules/indexes paths; emulator ports (auth 9099, Firestore 8080, UI 4000) |
| `firestore.rules` | Owner-only authorization â€” deploy with `firebase deploy --only firestore:rules` |
| `firestore.indexes.json` | Composite indexes (currently none required by the two document paths) |

## 4. Migration tooling (local only)

| Variable | Purpose |
|---|---|
| `MIGRATION_ALLOW_PRODUCTION` | Must be `1` for any non-emulator import; the guard also requires an explicit approval file. Leave unset for normal work |

Migration scripts live in `scripts/migration/` and read a gitignored
`*.backup.gz` dump. They never read `.env` secrets, never print row contents,
and refuse to run against a real project without the guard above.

## Environment matrix

| Variable group | Local dev | Emulator tests | Preview / staging | Production |
|---|---|---|---|---|
| `VITE_*` | `.env.local` | stubbed in provider-selection tests | Pages build env | Pages build env |
| Functions secrets | `.dev.vars` | not needed | `wrangler pages secret put` | same |
| `PRICE_CACHE` KV | absent (no-op) | absent | per-project namespace | per-project namespace |
| `MIGRATION_ALLOW_PRODUCTION` | unset | unset | unset | set only for the one approved run |

## Rules that must not regress

1. A secret never appears in a `VITE_*` variable.
2. Neither `VITE_AUTH_PROVIDER` nor `VITE_DATA_PROVIDER` is set: both were removed with the Supabase adapters, and the build fails if either is present.
3. `ALLOWED_ORIGINS` defaults to deny. Adding `*` is a security regression.
4. `MIGRATION_ALLOW_PRODUCTION` is set for a single approved execution, then
   unset.
5. `.env*` (except `.env.example`), `.dev.vars*`, `.migration/`, and
   `*.backup.gz` stay gitignored.
