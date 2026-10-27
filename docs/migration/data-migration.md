# Data migration

Supabase → Firebase. Implemented, unit-tested, and dry-run against the real
backup. **No production write has been performed.**

## Decision — no data migration (2026-10-28)

The owner confirmed the Supabase data does not need to be copied:

> "You can ignore all the snapshots, world profile snapshots, and everything
> else. It was just for me, and only I used it in the past. So we can start
> fresh in Firebase now."

Therefore:

- The migration gate is **closed by owner decision**, not by a passing run. No
  source counts need to be re-verified before cutover and no approval file is
  required.
- Firestore starts empty per account; each user's `portfolios/{uid}` document is
  created by that user's first write, and `users/{uid}` by their first profile
  save. A missing document is a legitimate first-time-user state, not a failed
  read.
- Supabase is left untouched and undeleted, so the old data stays readable until
  the project is decommissioned.
- The pipeline, approval chain, and gates below remain in the tree as a tested
  fallback and still refuse to run without explicit approval. They are **not**
  part of the cutover.

One consequence to be explicit about: rollback is only clean while Firebase
holds no real user data. Once users write portfolios to Firestore, reverting to
Supabase loses those entries — nothing is mirrored back. Roll back before real
usage, or copy data forward first.

## What moves

| Source | Destination | Rows in backup | Handled |
|---|---|---|---|
| `auth.users` (+ `auth.identities`) | Firebase Auth users | 1 active | Email re-created; provider preserved. Passwords are not exportable — the user resets |
| `public.profiles` | `users/{uid}` | 0 | Copy `displayName` |
| `public.portfolio_snapshots` | `portfolios/{uid}` | 0 | Copy the snapshot verbatim after parse validation |
| `public.eod_price_cache` | Cloudflare KV | 13 | **Deliberately not migrated** — disposable cache, regenerates on the next close-of-market write |

The real backup makes this an identity-only migration, but the snapshot and
profile paths are implemented and tested so the pipeline stays correct if the
counts differ at cutover.

## Pipeline

```
backup.gz
  → parseBackupRows        typed rows from COPY blocks, fail-closed decoding
  → mapping.json           { "<supabase uid>": "<firebase uid>" }
  → validateMapping        mapped / missing / duplicate / invalid targets
  → buildImportPlan        per-document create plan (never deletes or updates)
  → applyImportPlan        create-only writes, resumable
  → reconcile              expected vs destination, key-order-insensitive compare
  → report.json            aggregate, value-free
```

Modules live in `src/lib/migration/`; the CLI is `scripts/migration/migrate.ts`.
The `--emit-mapping-template` output and every artifact contain source emails,
so they are written only under `.migration/` (gitignored, verified with
`git check-ignore`).

## Commands

All paths below assume the dump is in the repository root.

```bash
# 1. Emit a mapping template (one row per active source user)
npx vite-node scripts/migration/migrate.ts \
  --dump "db_cluster-21-10-2026@15-06-23.backup.gz" --out .migration \
  --emit-mapping-template

# 2. Dry run — parses, validates, plans, and reports. Writes nothing to Firebase.
npx vite-node scripts/migration/migrate.ts \
  --dump "db_cluster-21-10-2026@15-06-23.backup.gz" \
  --mapping .migration/mapping.json --out .migration

# 3. Apply to the local emulator (requires FIRESTORE_EMULATOR_HOST)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vite-node scripts/migration/migrate.ts \
  --dump "db_cluster-21-10-2026@15-06-23.backup.gz" \
  --mapping .migration/mapping.json --out .migration --apply

# 4. Production (refused unless every gate below passes)
MIGRATION_ALLOW_PRODUCTION=1 npx vite-node scripts/migration/migrate.ts \
  --dump "db_cluster-21-10-2026@15-06-23.backup.gz" \
  --mapping .migration/mapping.json --out .migration \
  --apply --production --destination-project <project-id> \
  --approval-file .migration/approval.json
```

`npm run migration:migrate` is an alias for the CLI.

## Production approval chain

A production apply is refused (exit 2, nothing written) unless **all** hold:

1. `MIGRATION_ALLOW_PRODUCTION=1`.
2. `--destination-project` is present and matches the approval file.
3. The approval file is JSON with non-empty `approvedBy`, a parseable
   `approvedAt` not in the future and younger than 24 hours, plus
   `destinationProjectId`, `sourceSha256`, `mappingSha256`, `planSha256` that
   match the actual inputs — source and mapping digests are over raw file
   bytes, the plan digest over the canonical serialization of the plan records.
4. Destination credentials resolve (Application Default Credentials). Without
   them the run fails closed rather than guessing.

The approval is bound to the exact backup, mapping, and plan. Editing any of
them invalidates it, which is the point: approval for a 1-user plan cannot be
replayed against a different dataset.

## Exit codes

| Code | Meaning | What exists after |
|---|---|---|
| 0 | Success (or a completed dry run) | plan/report/reconciliation artifacts |
| 1 | Validation findings, reconciliation mismatches, or failed writes | artifacts plus a checkpoint for resume |
| 2 | Refused or blocked — approval, digest, emulator, or credential gate | **nothing** (no directory, no files) |

## Resumability and idempotency

- Writes are **create-only**. Re-running after a failure cannot overwrite or
  duplicate existing documents.
- `checkpoint.json` records completed document keys, written atomically
  (temp file + rename) after every record, and is keyed by the source and
  mapping digests. A checkpoint from a different digest pair is refused, so a
  stale checkpoint can never "resume" a different migration.
- A failed record clears its success marker and vice versa; the checkpoint is
  deterministic (sorted) so diffs are reviewable.

## Safety properties

1. **stdout is aggregate-only** — counts, digests, uid prefixes, statuses. No
   emails, password hashes, or snapshot contents.
2. **Parse failures fail closed** — an unterminated COPY block discards its rows
   with a warning rather than silently importing a partial user.
3. **Malformed snapshots are reported, not written** — `malformed:true` with
   `snapshot:null`; the plan skips them and reconciliation flags the gap.
4. **Duplicates are de-duped keep-first with a warning**, and rows referencing
   an unknown user are warned about, never applied.
5. **Warnings never contain PII.**

## Current state (dry run, real backup)

```
users=1 (active=1)  snapshots=0  profiles=0  eodCacheRows=13
validation: mapped=0 missing=1  → "missing mapping for source uid a201bb5b-…"
plan: all counts zero
exit: 1 (validation findings; artifacts written)
```

That is the expected result with an empty `mapping.json`. Before a real apply,
map the single source uid to the Firebase uid created for that user (or let
the import create it, depending on the chosen identity step in
`cutover-checklist.md` Phase 3).

## Not verified in this lane

- **Emulator `--apply` writes and live reconciliation** were unit-tested but not
  executed against a running Firestore emulator here. Run
  `npm run test:migration` (needs the emulators) before the first real apply.
- **Production path** was verified only at its refusal gates, by design.

## Rollback

Supabase is never written to during the migration, so rollback is local:
delete the imported `portfolios/*` and `users/*` documents and the Firebase
Auth users, then re-run once the mapping or plan is corrected. Nothing on the
Supabase side needs restoring.
