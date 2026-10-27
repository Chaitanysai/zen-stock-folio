# Zen Stock Folio

A Vite + React + TypeScript stock portfolio app for Indian markets, with AI
portfolio analysis.

## Tech stack

- Vite, React, TypeScript
- Tailwind CSS + shadcn/ui
- **Backend:** Firebase Auth + Firestore for every user-owned document, with
  Cloudflare Pages Functions in `functions/` for the `/api/*` endpoints

There is one backend. Firebase Auth is the only authentication provider and
Firestore is the only portfolio/profile store; a build with missing Firebase
configuration, or with a stale provider switch in the environment, fails
instead of falling back to anything. See `docs/migration/architecture.md`.

## Local development

```sh
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `VITE_API_PROXY_TARGET`
(default `http://localhost:3000`). The endpoints are Cloudflare Pages Functions,
so the realistic local setup is:

```sh
wrangler pages dev dist --port 8788      # or `wrangler pages dev` for live reload
VITE_API_PROXY_TARGET=http://localhost:8788 npm run dev
```

Without an API the dashboard still renders, but live prices, F&O quotes, news,
and AI analysis are unavailable.

## Build

```sh
npm run build
```

The build fails on incomplete Firebase configuration rather than shipping a
login screen that cannot authenticate.

## Configuration

Copy `.env.example` to `.env.local` and fill in the values. The template
documents every variable the app and the Functions read, grouped by:

- Firebase web-app config (browser-public)
- Cloudflare Functions secrets (server-only)

Never put a server credential behind a `VITE_` prefix: those values are
compiled into the browser bundle.

### Backend selection

None. `VITE_AUTH_PROVIDER` and `VITE_DATA_PROVIDER` were removed with the
Supabase adapters. If either variable is still present in an environment, the
build fails with a message naming it — a leftover switch must not look like a
working rollback build.

## Verification

```sh
npm run test          # unit + contract suites
npm run test:rules    # Firestore security rules (local emulator)
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm run build
```

`npm run test:migration` still exercises the historical Supabase-dump importer.
That tooling is retained for audit purposes only: the source data was
single-user and is being abandoned, so nothing is imported.

## Migration documentation

- `docs/migration/architecture.md` — target architecture and backend routing
- `docs/migration/route-inventory.md` — every API route, its auth model, fate
- `docs/migration/configuration.md` — environment, Firebase console, Cloudflare
- `docs/migration/data-migration.md` — closed decision (no import) plus the retained importer reference
- `docs/migration/cutover-checklist.md` — controlled production cutover
- `docs/migration/phase0-verification.md`, `phase4-regression.md` — audit history
- `docs/migration/firebase-setup.md`, `cloudflare-api.md`, `upstox-reauth.md`
