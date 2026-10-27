# Cutover checklist

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


Ordered, staged, and reversible. Nothing here has been executed. Each phase
names what must be true before moving on, and how to get back.

Legend: **[local]** can be done now Â· **[approval]** needs the owner to say yes
Â· **[user action]** needs credentials only the owner has.

## Phase 0 â€” Pre-flight (local, no side effects)

- [ ] `git rev-parse --abbrev-ref HEAD` = `feat/firebase-cloudflare-migration`
- [ ] `git status` reviewed; no user work discarded, no commits made
- [ ] `npx vitest run` â€” expect the full suite green (baseline was 145 passed / 12 skipped)
- [ ] `npx tsc -p tsconfig.app.json --noEmit` clean
- [ ] `npx tsc -p tsconfig.node.json --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] `npm run lint` â€” compare against the 68-problem baseline, no new errors
- [ ] `npm run test:rules` â€” Firestore rules suite green against the emulator
- [ ] `npm run test:migration` â€” migration suites green against the emulator
- [ ] `rg "@/lib/supabase" src` â€” only the rollback adapter and provider
      selection reference it; no active-path import

Exit gate: every command above passes. **No rollback needed â€” nothing changed
outside the working tree.**

## Phase 1 â€” Expand: create the target, change nothing live

- [ ] **[approval]** Create the Firebase project; enable Auth (email/password +
      Google) and Firestore in production mode
- [ ] **[user action]** Register the web app; copy the six `VITE_FIREBASE_*`
      values into `.env.local` (never commit)
- [ ] **[approval]** `firebase deploy --only firestore:rules,firestore:indexes`
      to the new project â€” verify the deployed rules match `firestore.rules`
- [ ] **[approval]** Create the Pages project `zenfolio` and its KV namespace
      `PRICE_CACHE`; uncomment the binding in `wrangler.toml` with the real id
- [ ] **[user action]** Set Functions secrets with `wrangler pages secret put`
      (`FIREBASE_API_KEY`, Upstox, news, AI, ops key)
- [ ] **[approval]** Deploy a preview build only (`wrangler pages deploy`),
      leaving the production domain on Vercel

Exit gate: preview URL serves the app; Firestore rules reject a cross-user
read; `/api/prices` returns 401 without a token. Rollback: delete the preview
deployment; nothing else references it.

## Phase 2 â€” Verify against real infrastructure (still no user traffic)

- [ ] Sign up a throwaway account in the preview build (firebase mode)
- [ ] Confirm the verification email arrives; confirm unverified access to
      `/api/*` returns 403
- [ ] Create a portfolio, reload, confirm persistence in `portfolios/{uid}`
- [ ] Rename the profile; confirm `users/{uid}.displayName`
- [ ] Read one document as a different uid via the emulator/admin and confirm
      the rules deny it
- [ ] Force a Firestore read failure (offline) and confirm the UI shows
      `CLOUD_UNAVAILABLE_MESSAGE` and blocks saves instead of overwriting
- [ ] Confirm prices, F&O, news, and AI all render in the preview build

Exit gate: all of the above pass. Rollback: delete the test account and its two
documents; the preview build is disposable.

## Phase 3 â€” Migrate: identities and data

> **Closed by owner decision (2026-10-28).** The source data was single-user and
> is being abandoned; Firestore starts empty and users begin fresh. The steps
> below are retained only as the documented fallback if that decision reverses.
> See `data-migration.md` â†’ "Decision â€” no data migration".

- [ ] Parse the backup again and re-confirm counts before writing anything
      (`npm run migration:parse-backup`) â€” last known: 1 user, 0 snapshots,
      0 profiles, 13 cache rows
- [ ] **[approval]** Dry run the importer against the target project; review the
      plan output (creates, skips, conflicts) before any write
- [ ] **[approval]** Execute the import with `MIGRATION_ALLOW_PRODUCTION=1`
      plus the approval file; the run must be idempotent and resumable via its
      checkpoint
- [ ] Reconcile: document counts and identity mapping match the plan
- [ ] Unset `MIGRATION_ALLOW_PRODUCTION` immediately after the run
- [ ] **Do not** import `eod_price_cache` â€” KV regenerates it

Exit gate: reconciliation report matches the plan with zero unexplained
deltas. Rollback: delete the imported documents and Firebase Auth users;
Supabase is untouched, so nothing is lost.

## Phase 4 â€” Switch

- [ ] **[approval]** Build with `VITE_AUTH_PROVIDER=firebase` and
      `VITE_DATA_PROVIDER=firestore` (same build, same commit)
- [ ] Deploy that build to the Pages preview; re-run the Phase 2 smoke test on
      the real migrated account
- [ ] **[approval]** Move traffic: point the production domain at the Pages
      project, or flip the hosting target
- [ ] Watch errors, 401/403 rates, and Firestore read/write counts for 24â€“48 h
- [ ] Keep `vercel.json` and `api/` deployed and idle as the rollback path

Exit gate: a full session on production (sign in, edit, reload, prices, news,
AI) with no unexpected errors and no split between identity and data.
Rollback: re-point the domain to Vercel (Supabase build). Because Supabase was
never written to during this phase, rollback loses only sessions created on
Firebase after the switch.

## Phase 5 â€” Observe (no changes)

- [ ] 48 h with no P0: no data loss, no auth loop, no unverified-access path
- [ ] Record Firestore usage against the free-tier quotas
- [ ] Confirm the KV cache write volume is near `tickers Ã— 2/day`
- [ ] Note every user-facing issue for a later fix pass, not a hotfix

## Phase 6 â€” Contract: retire Supabase (irreversible, last)

Only after Phase 5 passes **and** the owner explicitly approves each item.

- [ ] **[approval]** Remove the Supabase adapters (`src/lib/supabase.ts`,
      `supabasePortfolioStore.ts`), the provider switches, and their tests
- [ ] **[approval]** Drop `@supabase/supabase-js` from `package.json`; update
      the lockfile in the same commit
- [ ] **[approval]** Delete `api/`, `vercel.json`, and the Vercel project
- [ ] **[approval]** Delete the `portfolio_snapshots`, `profiles`, and
      `eod_price_cache` tables; revoke the anon/service keys
- [ ] **[approval]** Remove `SUPABASE_*` and `UPSTASH_*` from
      `.env.example` and every secret store
- [ ] Final full verification: tests, both `tsc` configs, build, lint, rules
- [ ] Rewrite `.env.example`, `README.md`, and this document to describe only
      the shipped stack

Exit gate: repository contains no Supabase or Vercel reference outside git
history.

## Hard stops

Do not proceed past these without written approval in the same conversation:

1. Creating any Cloudflare or Firebase resource.
2. Any write against the production Firebase project.
3. Any DNS, domain, or traffic change.
4. Deleting, revoking, or downgrading any Supabase resource or credential.
5. Any `git` commit, push, merge, or deploy of the working tree.
