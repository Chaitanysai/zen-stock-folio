# Phase 0 â€” Read-Only Verification Report

> **Status (2026-10-28): historical.** Supabase has been removed from the
> application (adapters, SDK, `api/`, `supabase/`). This document is retained
> as migration evidence. Where it describes Supabase as the active or rollback
> backend, that is no longer true.


**Project:** Zen Stock Folio (`E:\Projects\zen-stock-folio`)
**Migration:** Supabase + Vercel â†’ Firebase + Cloudflare Pages/Functions
**Phase status: PASS** (with 3 external dependencies listed in Â§7 â€” no blockers inside the repository)
**Date:** 2026-10-26
**Mode:** Read-only verification. No application files were modified, no cloud resources created, no secrets printed. The only file created by this phase is this report.

---

## 1. Scope & method

Executed only read-only or check-only operations:

- `git` inspection (branch, HEAD, status, stash, remotes)
- `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` (build writes only the gitignored `dist/` artifact; `git status` was identical before and after)
- CLI status probes: `firebase --version`, `firebase projects:list`, `firebase use` (failed as expected â€” no project dir), `wrangler --version`, `wrangler whoami`
- Backup inventory: file sizes, archive listings, and table-name greps of the dump (**counts and schema names only â€” no record contents were printed**)
- Grep inventories of config files, environment-variable **names**, API call sites, and Supabase import sites

---

## 2. Confirmed facts

### 2.1 Repository state

| Item | Value |
|---|---|
| Branch | `feat/premium-dashboard` |
| HEAD | `a2d56a9f98d8c5ad1ca6f5b9c2932e2ac777e94c` â€” "fix(production): recover blank-page crash and ship premium dashboard polish" |
| Tracked-file changes | None (clean tree) |
| Remote | `https://github.com/Chaitanysai/zen-stock-folio.git` |
| Stash | `stash@{0}: On main: !!GitHub_Desktop<main>` â€” present, untouched |
| Pre-existing untracked files | `.agents/`, `.claude/`, `.codex/`, `.gemini/`, `.playwright-mcp/`, `opencode-deepseek.ps1`, `opencode-haiku.cmd`, `skills-lock.json`, `vite.config.ts.timestamp-*.mjs` |
| **New untracked since prior audit** | `Model MDFiles/` (markdown notes), **`db_cluster-21-10-2026@15-06-23.backup.gz`**, **`ddlxhhvrlufvevgzguqd.storage.zip`** â€” the Supabase backups live in the repository root |

### 2.2 Check suite results (re-run 2026-10-26, ~23:36 local)

| Command | Result | Exit |
|---|---|---|
| `npm run test` | 6 files, **48/48 tests passed** (incl. `usePortfolioSync` 12, `marketStatus` 17, `calculations` 14) | 0 |
| `npx tsc -p tsconfig.app.json --noEmit` | Clean (note: `strict: false` in `tsconfig.app.json`) | 0 |
| `npm run lint` | **68 pre-existing problems** (55 errors, 13 warnings â€” mostly `no-explicit-any`) â€” unchanged from prior audit; none introduced by this phase | 1 |
| `npm run build` | Success, ~9 s; warning: 1.8 MB main chunk (no code splitting) | 0 |

### 2.3 CLI toolchain status

| Tool | Version | Auth | Notes |
|---|---|---|---|
| Firebase CLI | 15.34.1 | âœ… Logged in | `projects:list` returned 2 projects: `model-memory-d4948`, `spendsense-ota-2026`. **No ZenFolio Firebase project exists.** `firebase use` fails (no `.firebaserc`) â€” repo has no Firebase project config yet |
| Wrangler (Cloudflare) | 4.153.0 | âœ… OAuth token | Account: `Chaitanyasaikandula@gmail.com's Account` (ID `fa7a37a42eaadeeb9d446c36d3cb574a`). **Current token scopes are minimal (`user:read`, `offline_access`) â€” insufficient for creating/deploying Pages projects, Functions, or KV. A `wrangler login` re-auth with expanded scopes will be required (user action, interactive browser consent).** |

### 2.4 Existing configuration

- No Firebase config exists: `.firebaserc`, `firebase.json`, `firestore.rules`, `firestore.indexes.json` all absent.
- No Cloudflare config exists: `wrangler.toml` / `wrangler.jsonc`, `functions/` directory all absent.
- Vercel artifacts present and untouched: `vercel.json` (SPA rewrite + build workaround), `.vercel/project.json` (project link), `scripts/verify-preview.mjs` (Vercel-bypass smoke script).
- Environment-variable **names** found in local files (`.env`, `.env.local`; values not read): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (browser-public) and `TOKENHARBOR_API_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `VERCEL_OIDC_TOKEN` (server-local).
- **[Gap]** The server provider secrets the API routes need (`UPSTOX_ACCESS_TOKEN/API_KEY/API_SECRET`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `FINNHUB_API_KEY`, `NEWS_API_KEY`, and the legacy `UPSTASH_REDIS_REST_URL/TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) are **not in any local file** â€” they exist only in the Vercel dashboard. They must be re-entered manually into Cloudflare at Phase 5 by the account owner (see Â§7).

### 2.5 API surface and callers (re-verified by grep)

Frontend call sites (4 distinct endpoints, 5 call sites):

| Endpoint | Callers |
|---|---|
| `POST /api/prices` | `src/hooks/useLivePrices.ts:88` (1 s polling during market hours), `src/components/AddTransactionDialog.tsx:52` |
| `POST /api/fno-prices` | `src/components/FnOTable.tsx:684` (60 s poll when market open) |
| `POST /api/ai` | `src/components/AIInsights.tsx:209,239` |
| `POST /api/news` | `src/components/StockNewsFeed.tsx:263` |
| `GET/POST /api/sync`, `GET /api/auth/callback`, `GET /api/refresh-token` | **No frontend callers** (dead/ops-only; disposition proposed in Â§6) |

`@supabase/supabase-js` is imported in exactly 3 source files (`src/lib/supabase.ts`, `src/contexts/AuthContext.tsx`, `api/prices.ts`) plus the test mirror (`src/hooks/usePortfolioSync.test.ts`). Complete Supabase DB surface: `portfolio_snapshots` (select-single + upsert per user), `profiles` (upsert + select). No RPC, realtime, storage, or Edge-Function usage.

---

## 3. Backup inventory (immutable recovery sources â€” not modified)

| File | Format | Size | Contents (verified at schema level only) |
|---|---|---|---|
| `db_cluster-21-10-2026@15-06-23.backup.gz` | gzip-compressed **PostgreSQL database cluster dump** (`pg_dumpall`-style plain SQL; header verified "PostgreSQL database cluster dump"; includes role definitions) | 47,823 B compressed â†’ 315,436 B uncompressed | **42** `CREATE TABLE` statements; **30** data sections (`COPY`). Confirmed present with data: **`auth.users`**, **`auth.identities`** (provider identities â€” required to identify Google sign-in users), `auth.sessions`, `auth.refresh_tokens`, full GoTrue schema, **`public.portfolio_snapshots`**, **`public.profiles`**, **`public.eod_price_cache`** |
| `ddlxhhvrlufvevgzguqd.storage.zip` | ZIP (Supabase Storage export, project ref matches `ddlxhhvrlufvevgzguqd`) | 22 B | **Empty archive** (0 entries). Expected: the app makes zero Supabase Storage calls |

Assessment **[fact]**: the cluster dump is a complete, self-contained recovery source â€” it contains every production table the app uses *and* the full `auth.users` table including `encrypted_password` hashes, which is the prerequisite for evaluating password-preserving import into Firebase Auth.

Handling rules adopted for all later phases:
1. These two files are treated as immutable inputs. No tool writes to, renames, or moves them.
2. Parsing (Phase 2) will be read-only, in a dedicated script, producing aggregate counts â€” never printing emails, hashes, or portfolio contents.
3. The dump file's contents are sensitive (password hashes, user PII). See risk R1.

---

## 4. Unknowns (no assumptions made)

1. **Firebase project identity**: no ZenFolio Firebase project exists. Name, and Firestore **region** (proposal: `asia-south1` for India latency â€” must be fixed at creation; cannot change later) â€” needs user decision/approval.
2. **User counts**: exact number of Supabase users, confirmed-email users, and Google-provider users is knowable from the dump but will only be reported by the Phase 2 dry-run parser (aggregate counts, no PII).
3. **Vercel secret values**: not present locally; only the account owner can re-enter them into Cloudflare.
4. **Upstox ops endpoints** (`/api/auth/callback`, `/api/refresh-token`): whether any personal workflow still depends on them (the daily manual token-rotation loop) â€” needs user decision; see Â§6 R4/R5.
5. **Wrangler re-auth**: whether the account can grant the required scopes (interactive consent at next `wrangler login`).
6. **Password-hash import**: Firebase Auth user-import API supports bcrypt (GoTrue uses bcrypt) per platform documentation â€” **must be verified against a fixture in Phase 2 before any production import**. Plan B (force password reset) is defined in Â§8 Phase 2.

---

## 5. Security issues found (carried into migration scope; none fixed in Phase 0)

| # | Severity | Finding | Disposition in plan |
|---|---|---|---|
| S1 | **P0** | All four data/ML endpoints (`prices`, `fno-prices`, `ai`, `news`) accept unauthenticated traffic with open CORS; client polls `prices` every 1 s during market hours | Phase 3: every Function verifies a Firebase ID token; restrictive CORS; per-UID rate limits sized to not break the 1 s poll |
| S2 | **P0** | `api/refresh-token.ts:39-43` returns a fresh Upstox access token in the response body to any unauthenticated caller; `api/auth/callback.ts:44-75` renders the token in HTML | Phase 3: do **not** port blindly â€” redesign behind a secret header or replace with a documented manual re-auth procedure (Â§6 R4) |
| S3 | **P1** | `api/prices.ts:21-25` silently falls back from service-role to anon key (cache writes then fail silently) | Phase 3: KV cache removes the pattern entirely |
| S4 | **P1** | Hardcoded Vercel URLs: `refresh-token.ts:19`, `auth/callback.ts:24`, `ai.ts:90` | Phase 3: derive from request origin / env |
| S5 | **P1** | **Backup files sit untracked in the repo root and are NOT covered by `.gitignore`** (no `*.gz`/`*.zip` rules) â€” one `git add .` away from committing password hashes and user PII | **Recommended Phase 1 action (with approval): extend `.gitignore` with the backup filenames/patterns.** No change made in Phase 0 |
| S6 | **P2** | News endpoint's Groq fallback fabricates headlines presented as news (`api/news.ts:118-183`) | Phase 3: label AI-generated items distinctly / gate behind explicit fallback flag |
| S7 | **P2** | 68 pre-existing lint problems | Out of migration scope; tracked separately, no new lint issues may be added |

---

## 6. Migration risks (ranked)

- **R1 â€” Backup hygiene (P1, immediate):** sensitive dumps in repo root, not gitignored (S5). Mitigation in Phase 1.
- **R2 â€” UID remap:** Firebase UIDs â‰  Supabase UUIDs; `portfolio_snapshots`/`profiles` are keyed by the Supabase UUID. Strategy to be approved in Phase 2: import with a validated old-UUID â†’ new-UID mapping table; destination docs keyed by new UID; conflict policy = never overwrite existing destination doc without explicit approval.
- **R3 â€” Password migration:** bcrypt hash import into Firebase Auth is expected to work but is fixture-gated (Â§4.6). User impact if it fails: every user receives a password-reset email.
- **R4 â€” Upstox token lifecycle:** Upstox access tokens expire ~daily (3:30 AM IST per the callback page); `refresh-token.ts` passes an access token as an OAuth `code` and is likely non-functional by design. Migration proposal: secure manual re-auth page (secret-protected) or documented manual rotation; the 1 s live-price feature depends on a valid `UPSTOX_ACCESS_TOKEN` being present.
- **R5 â€” Polling load:** per-user 1 s price polling must be matched by per-UID rate limits (not global-strict), else market-hours UX breaks.
- **R6 â€” Wrangler scopes:** current OAuth token cannot create resources; re-auth required before any Phase 3/5 cloud action.
- **R7 â€” Firestore region:** must be chosen once at project creation (`asia-south1` proposed).
- **R8 â€” Dual-running constraint:** Vercel production must stay live and untouched until cutover approval; all migration work is additive on a new branch.

---

## 7. Required permissions / approvals

| # | What | Who | When |
|---|---|---|---|
| A1 | Approve Phase 0 report â†’ start Phase 1 (new branch, Firebase config layer, abstraction, tests â€” no cloud resources, no production behavior change) | Owner | Now |
| A2 | Approve `.gitignore` extension for backup files (S5/R1) | Owner | Phase 1 |
| A3 | Approve Firebase project creation + name + Firestore region (`asia-south1` proposed) | Owner | Phase 1 (before any `firebase` write action) |
| A4 | Wrangler re-auth with expanded scopes (interactive) | Owner | Phase 3 |
| A5 | Re-enter provider secrets into Cloudflare (manual, from Vercel dashboard) | Owner | Phase 5 |
| A6 | Approve dry-run import report before any production import | Owner | Phase 2 gate |
| A7 | Approve staging deploy (separate Pages project/alias, not production DNS) | Owner | Phase 5 |
| A8 | Approve cutover checklist before production DNS/OAuth changes | Owner | Phase 6 |

No cloud resource has been created or changed during Phase 0.

---

## 8. Staged execution plan (gated)

| Phase | Scope | Gate |
|---|---|---|
| **1 â€” Foundation** | Migration branch from verified HEAD; Firebase client config layer; auth abstraction (Supabase â†” Firebase behind one interface); Firestore data-access abstraction + `firestore.rules` (owner-only); auth-state & isolation tests; `.gitignore` backup rules (A2). Production behavior unchanged | A1 â†’ this report; A3 approval before creating the Firebase project |
| **2 â€” Data migration** | Read-only backup parser; dry-run importer (fixture/emulator first); UID mapping validation; duplicate/missing/conflict detection; aggregate report (counts + failures, no PII); password-hash import feasibility verified on fixture | A6 before any production import |
| **3 â€” API & cache** | Port 4 live endpoints to Pages Functions (Fetch API, `context.env`); Firebase ID-token verification; input schemas; per-UID rate limits; restrictive CORS; body-size caps; price cache â†’ KV (30 h TTL); redesign/remove `/api/sync` (dead), `/api/auth/callback` + `/api/refresh-token` (S2/R4); AI-generated news labeling (S6) | A4 (wrangler re-auth) before any Cloudflare resource |
| **4 â€” Local regression** | Full suite: unit + type + lint + build; auth flows (signup/verify/resend/reset/Google/sign-out); multi-user isolation proofs; import/export; guest mode; prices/F&O/AI/news incl. provider-failure paths; zero-Supabase-dependency audit of tests/build; Vercel-reference inventory | Report; fix regressions before Phase 5 |
| **5 â€” Staging** | Separate staging Pages project + env/secrets (A5); smoke tests incl. auth redirects, CORS, rate limits, rules, KV caching; credential-leak scan of responses/logs | A7 |
| **6 â€” Cutover prep** | Checklist: backup verification, user-migration strategy + impact, import results, production config, OAuth/domain requirements (Google authorized domains, Upstox redirect), security + smoke results, rollback to Vercel, remaining risks | **Stop â€” A8 before any production action. Supabase project and Vercel deploy stay intact for the agreed rollback period** |

---

## 9. Phase 0 bookkeeping

**Files created:** `docs/migration/phase0-verification.md` (this report).
**Files modified:** none. **Files deleted:** none. **Cloud resources created/changed:** none. **Secrets printed:** none (names only).

**Commands executed (all exit 0 unless noted):** `git branch --show-current` / `git rev-parse HEAD` / `git status --porcelain` / `git stash list` / `git remote -v`; `firebase --version`; `firebase projects:list`; `firebase use` (exit 1 â€” expected, no project dir); `wrangler --version`; `wrangler whoami`; `npm run test` (48/48 pass); `npx tsc -p tsconfig.app.json --noEmit` (pass); `npm run lint` (exit 1 â€” 68 pre-existing); `npm run build` (pass); `gzip -l`, `zcat â€¦ | grep -c/-oE` (dump schema inventory), `unzip -l` (storage zip â€” empty).

---

## 10. Exact next step

Await approval of this report. On approval (A1 + A2 + A3): **Phase 1 begins â€” create migration branch `feat/firebase-cloudflare-migration` from `a2d56a9`, add `.gitignore` backup rules, scaffold the Firebase config layer + auth/data abstractions + security rules + tests, and create the Firebase project (name/region per A3) only after that approval.** No production behavior changes in Phase 1; the Vercel deployment and Supabase project remain untouched.
