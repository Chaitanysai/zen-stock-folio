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

### INDmoney sync (optional)

The portfolio card can import NSE holdings and the trade book from an
INDmoney/INDstocks account. It is read-only at the broker and preview-then-apply:
nothing is written until the user confirms the diff.

Until `docs/api-integration/indmoney-probe.md` is complete, keep
`INDSTOCKS_BASE_URL` unset in every environment. Both broker routes then answer
`503 BROKER_DISABLED` and no unverified mapping is reachable. Full setup,
disable/rollback, limits, and response codes live in
`docs/operations/broker-sync.md`.

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

These commands are not a checklist you are trusted to remember: they run in CI on
every push and pull request (`.github/workflows/ci.yml`), and on `main` a green
run also deploys `firestore.rules` and `firestore.indexes.json` — so the deployed
rules cannot drift from the repository copy.

## Operations

- `docs/operations/deploy.md` — how the Pages deployment builds, the 2026-11-08
  build-step failure and its fix
- `docs/operations/observability.md` — what is logged, where to read it, and the
  alerts that must exist in the Cloudflare dashboard
- `docs/operations/rate-limiting.md` — the in-code budgets and the one WAF rule
  that provides the hard cap
- `docs/operations/rollback.md` — how to return to a previous deployment, and
  the backup gap that is still open
- `docs/operations/broker-sync.md` — INDmoney configuration, rollout gate,
  disable/rollback, and the local smoke test
- `docs/operations/market-calendar.md` — NSE holiday coverage, the 2026
  provisional gap, and the dated 2027 gate

## Package manager

`npm` is canonical: every script in `package.json` shells out to `npm`/`npx`, and
CI installs with `npm ci` from `package-lock.json`. The stray `bun.lockb` is a
leftover from an earlier experiment and should be deleted — two lockfiles resolve
two different dependency trees, and only one of them is tested.

## Migration documentation

- `docs/migration/architecture.md` — target architecture and backend routing
- `docs/migration/route-inventory.md` — every API route, its auth model, fate
- `docs/migration/configuration.md` — environment, Firebase console, Cloudflare
- `docs/migration/data-migration.md` — closed decision (no import) plus the retained importer reference
- `docs/migration/cutover-checklist.md` — controlled production cutover
- `docs/migration/phase0-verification.md`, `phase4-regression.md` — audit history
- `docs/migration/firebase-setup.md`, `cloudflare-api.md`, `upstox-reauth.md`
