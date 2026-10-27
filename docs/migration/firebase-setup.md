# Firebase Setup â€” Phase 1 Scaffolding

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


## Phase 2 addendum (2026-10-27)

### Cloud state
- Firestore database `(default)` created in **`asia-south1`** (FIRESTORE_NATIVE, STANDARD edition) on project `zen-stock-folio`.
- `firestore.rules` **deployed** (released to `cloud.firestore`) and `firestore.indexes.json` deployed. No Hosting, no auth providers enabled.
- The Firestore API had to be service-enabled first (the CLI cannot do it; done via the Service Usage API using the CLI's own credentials).

### Backup findings (aggregate only, via `npm run migration:parse-backup`)
The cluster dump holds **1 confirmed email/password user, 0 Google users, 0 portfolio snapshots, 0 profiles, 13 price-cache rows, 0 parse errors**. There is no cloud-side portfolio data to import â€” user data lives in browser localStorage (local-first) and will re-sync to Firestore on first login after cutover. Migration reduces to the single auth account.

### Migration tooling (all emulator-only, dry-run by default)
- `src/lib/migration/parseSupabaseDump.ts` â€” read-only dump parser (aggregate counts, no row data possible by construction).
- `src/lib/migration/fixture.ts` + `scripts/migration/make-fixture.ts` â€” fully synthetic fixture + demo mapping (`scripts/migration/fixtures/`, safe to commit).
- `src/lib/migration/importPlan.ts` â€” pure planner: mapping validation, duplicate/malformed/missing-mapping/destination-conflict detection, strict no-overwrite.
- `src/lib/migration/firestoreImport.ts` â€” Admin-SDK apply layer; **refuses to run without `FIRESTORE_EMULATOR_HOST`** (verified) and writes create-only (second no-overwrite layer).
- `scripts/migration/import.ts` â€” CLI: `npm run migration:import` (dry run) / `-- --apply` (emulator only).
- Tests: `npm run test:migration` runs the emulator suites (firestore import: 3/3; auth import: 1 pass + 1 skipped).

### Password-hash compatibility status
Verified: the real Admin `importUsers` API accepts a GoTrue-format bcrypt hash (`$2a$â€¦`) with `{ algorithm: "BCRYPT" }` and preserves email/emailVerified on the imported account.
NOT verifiable on any auth emulator (reproduced on firebase-tools 13.29/14.11/15.34): users created via `importUsers` are not visible to the client sign-in path (EMAIL_NOT_FOUND). The password round-trip must be confirmed with a synthetic account against a staging project in Phase 5. Plan B remains password-reset emails.


## What exists after Phase 1

| Item | Value |
|---|---|
| Firebase project ID | `zen-stock-folio` (project number `378079456749`) |
| Web app registration | `ZenFolio Web` â€” app ID `1:378079456749:web:f559ddb64709e29a254be4` |
| Firestore database | **Not created yet** â€” deferred to Phase 2 after the exact project ID + region below are approved |
| Intended Firestore region | `asia-south1` (Mumbai) â€” confirmed supported per https://firebase.google.com/docs/firestore/locations |
| Auth providers | **None enabled yet** (email/password + Google get enabled at staging) |
| Active app provider | `supabase` (production behaviour unchanged; switch is a Phase 5 cutover) |

## Environment variable names (placeholders only â€” real values live in gitignored `.env.local`)

```bash
# Firebase web config (browser-public by design)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=          # <project-id>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Migration switches â€” "supabase" (default) | "firebase"
VITE_AUTH_PROVIDER=supabase
VITE_DATA_PROVIDER=supabase
```

All names are also documented with placeholders in `.env.example`. No secret
belongs in any `VITE_*` variable; the Firebase web API key is public by
design and access is controlled by Firebase Auth + `firestore.rules`.

## Code layout

```
src/lib/firebase/env.ts          # env-var reader + isFirebaseConfigured (SDK-free)
src/lib/firebase/app.ts          # app singleton, placeholder-safe init
src/lib/firebase/auth.ts         # getFirebaseAuth()
src/lib/firebase/firestore.ts    # getFirebaseDb()
src/lib/auth/types.ts            # provider-neutral AuthProvider contract
src/lib/auth/supabaseAuthProvider.ts   # default provider (verbatim behaviour)
src/lib/auth/firebaseAuthProvider.ts   # Firebase provider (error mapping + parity)
src/lib/auth/index.ts            # VITE_AUTH_PROVIDER selection (dynamic import)
src/lib/data/types.ts            # provider-neutral PortfolioDataStore contract
src/lib/data/supabasePortfolioStore.ts # default provider (verbatim behaviour)
src/lib/data/firestorePortfolioStore.ts # portfolios/{uid} + users/{uid}
src/lib/data/index.ts            # VITE_DATA_PROVIDER selection (dynamic import)
firestore.rules                  # owner-only rules (uid == doc id, WITH CHECK analogue)
firestore.indexes.json           # no composite indexes required
firebase.json                    # firestore config + emulator ports
```

## Firestore layout and rules

- `portfolios/{uid}` â†’ `{ uid, snapshot, updatedAt }` â€” whole-portfolio snapshot (mirrors `portfolio_snapshots`)
- `users/{uid}` â†’ `{ uid, displayName, updatedAt }` â€” profile metadata (mirrors `profiles`)
- Rules require `request.auth.uid == uid` for every read/write, and
  `request.resource.data.uid == uid` on create/update (the analogue of the
  Postgres `WITH CHECK (auth.uid() = user_id)` policy).
- Price caching stays in Cloudflare KV (server-side) â€” Firestore holds only
  per-user data and has no public collections.

## Tests

| Suite | Command | Requires |
|---|---|---|
| Unit (90 tests) | `npm run test` | nothing |
| Rules (7 tests) | `npm run test:rules` | local Firestore emulator via firebase-tools 14 (the current firebase-tools 15 requires JDK 21; the repo pins 14.11.0 which runs on the installed JDK 17). Without the emulator the rules suite skips itself |

Rules coverage: owner CRUD on `portfolios/{uid}` and `users/{uid}`;
cross-user read/write denied; unauthenticated denied; payload-uid mismatch
denied on create and update; uid-less payload denied.

## Local operations

```bash
npm run test:rules                 # rules suite against the emulator
npx -y firebase-tools@14.11.0 emulators:start --only firestore,auth   # interactive emulator UI at :4000
```

## Known constraints / deferred decisions

1. Firestore database creation is intentionally deferred: region `asia-south1`
   is immutable once chosen and awaits explicit approval (report the project
   ID + region at the Phase 2 gate).
2. Auth providers (email/password, Google) are not enabled in the project
   yet â€” done at Phase 5 staging setup.
3. Firebase UIDs will differ from Supabase UUIDs â€” the Phase 2 importer owns
   the validated mapping strategy.
4. The rules tests run against a `demo-*` project id â€” no cloud resources
   are touched.
