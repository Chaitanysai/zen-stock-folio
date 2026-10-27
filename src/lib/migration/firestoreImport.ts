import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { buildImportPlan, portfolioDocPayload, profileDocPayload } from "./importPlan";
import type { ImportInput, ImportPlan, PlannedRecord } from "./importPlan";
import type { UidMapping } from "./fixture";

/**
 * Firestore apply layer for the migration importer.
 *
 * PRODUCTION GUARD: this module refuses to run unless FIRESTORE_EMULATOR_HOST
 * is set — it can only ever write to the local Firestore emulator. Production
 * import is intentionally NOT implemented in Phase 2 and has no code path
 * here.
 */

export const assertEmulatorOnly = (): void => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "REFUSED: FIRESTORE_EMULATOR_HOST is not set. This importer can only write to the " +
        "local Firestore emulator; production import is intentionally not implemented.",
    );
  }
};

let adminApp: App | null = null;

/** Initialises the Admin SDK bound to an emulator project id. */
export const initAdminForEmulator = (projectId: string): App => {
  assertEmulatorOnly();
  if (adminApp) return adminApp;
  adminApp = getApps()[0] ?? initializeApp({ projectId });
  return adminApp;
};

export const getAdminDb = (): Firestore => getFirestore(adminApp!);

export interface ApplyResult {
  created: number;
  failed: number;
  /** Collection + docId for each failure (never payload contents). */
  failures: Array<{ collection: string; docId: string; reason: string }>;
}

/**
 * Applies a plan. Every write is a `create` — Firestore rejects it if the
 * document already exists, giving a second, atomic layer on top of the
 * planner's skip-destination-exists check. Idempotent by construction.
 *
 * `onRecord` is called after each ATTEMPTED write (create-status records
 * only) with the outcome — used by the real-data CLI for resumable
 * checkpointing. Omitting it keeps the previous behaviour unchanged.
 */
export const applyImportPlan = async (
  db: Firestore,
  plan: ImportPlan,
  input: ImportInput,
  onRecord?: (record: PlannedRecord, outcome: { ok: boolean; reason?: string }) => void | Promise<void>,
): Promise<ApplyResult> => {
  const result: ApplyResult = { created: 0, failed: 0, failures: [] };
  const snapshotByUid = new Map(input.snapshots.map((row) => [row.supabaseUid, row.snapshot]));
  const profileByUid = new Map(input.profiles.map((row) => [row.supabaseUid, row.displayName]));

  for (const record of plan.records) {
    if (record.status !== "create") continue;

    // The callback runs OUTSIDE try/catch: a failing callback (e.g. a
    // checkpoint write) must halt the migration, not be misreported as a
    // failed document write.
    let outcome: { ok: boolean; reason?: string };
    try {
      const ref = db.collection(record.collection).doc(record.docId);
      if (record.collection === "portfolios") {
        await ref.create(portfolioDocPayload(record.docId, snapshotByUid.get(record.sourceUid)));
      } else {
        await ref.create(profileDocPayload(record.docId, profileByUid.get(record.sourceUid) ?? null));
      }
      result.created += 1;
      outcome = { ok: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.failures.push({
        collection: record.collection,
        docId: record.docId,
        reason,
      });
      outcome = { ok: false, reason };
    }
    await onRecord?.(record, outcome);
  }

  return result;
};

/** Convenience wrapper: plan + apply in one call (used by tests and the CLI). */
export const planAndApply = async (
  db: Firestore,
  input: ImportInput,
  mapping: UidMapping,
  existing: { portfolios: ReadonlySet<string>; users: ReadonlySet<string> },
): Promise<{ plan: ImportPlan; result: ApplyResult }> => {
  const plan = buildImportPlan(input, mapping, existing);
  const result = await applyImportPlan(db, plan, input);
  return { plan, result };
};
