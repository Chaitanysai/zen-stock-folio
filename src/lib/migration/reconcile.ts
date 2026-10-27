/**
 * Post-import reconciliation: proves that what the destination Firestore now
 * contains matches the source backup for every mapped user.
 *
 * Comparison semantics:
 *  - snapshots are normalized through parseSnapshot (the same structural
 *    validation the importer and the app use) and compared via
 *    stableStringify — a canonical deep-equal that is insensitive to object
 *    key order (Firestore and JSON round-trips do not preserve key order);
 *  - displayName is compared exactly, with null === null;
 *  - only mapped source users are compared; a destination document whose id
 *    is not a mapped target id is reported as `unexpected` so pre-existing
 *    destination data can never pass silently.
 */

import { parseSnapshot } from "../data/parseSnapshot";
import { stableStringify } from "./report";
import type { BackupExtract } from "./backupRows";
import type { UidMapping } from "./fixture";

export interface DestinationState {
  /** portfolios/{docId} → full document data ({uid, snapshot, importedFrom}). */
  portfolios: ReadonlyMap<string, unknown>;
  /** users/{docId} → displayName (string or null). */
  users: ReadonlyMap<string, string | null>;
}

export interface ReconciliationMismatch {
  collection: "portfolios" | "users";
  docId: string;
  field: "snapshot" | "displayName";
  reason: string;
}

export interface ReconciliationReport {
  ok: boolean;
  sourcePortfolioCount: number;
  sourceProfileCount: number;
  destinationPortfolioCount: number;
  destinationUserCount: number;
  expectedDocs: number;
  presentDocs: number;
  /** `${collection}/${docId}` entries expected from mapped sources but absent. */
  missing: string[];
  /** Destination documents whose id is not one of the mapped target ids. */
  unexpected: string[];
  mismatches: ReconciliationMismatch[];
}

/**
 * Target doc ids owned by this migration: the mapping values of every source
 * uid referenced anywhere in the backup (auth.users ids plus the uids on
 * snapshot/profile rows — a snapshot may exist for a uid that is missing
 * from auth.users, which is flagged upstream but still owns its doc).
 */
const mappedTargetIds = (source: BackupExtract, mapping: UidMapping): Set<string> => {
  const sourceIds = new Set<string>();
  for (const user of source.users) sourceIds.add(user.id);
  for (const snapshot of source.snapshots) sourceIds.add(snapshot.userId);
  for (const profile of source.profiles) sourceIds.add(profile.id);

  const targets = new Set<string>();
  for (const uid of sourceIds) {
    const target = mapping[uid];
    if (typeof target === "string" && target.trim() !== "") targets.add(target);
  }
  return targets;
};

const destinationSnapshotOf = (docData: unknown): unknown => {
  if (docData === null || typeof docData !== "object" || !("snapshot" in docData)) return undefined;
  return (docData as { snapshot?: unknown }).snapshot;
};

/** First occurrence wins, matching the planner's duplicate-source policy. */
const expectedPortfolioDocs = (source: BackupExtract, mapping: UidMapping): Map<string, unknown> => {
  const expected = new Map<string, unknown>();
  for (const row of source.snapshots) {
    if (row.malformed) continue; // planner skips-malformed; nothing exists to compare
    const docId = mapping[row.userId];
    if (typeof docId !== "string" || docId.trim() === "") continue;
    const normalized = parseSnapshot(row.snapshot);
    if (!normalized) continue;
    if (!expected.has(docId)) expected.set(docId, normalized);
  }
  return expected;
};

const expectedProfileDocs = (source: BackupExtract, mapping: UidMapping): Map<string, string | null> => {
  const expected = new Map<string, string | null>();
  for (const row of source.profiles) {
    const docId = mapping[row.id];
    if (typeof docId !== "string" || docId.trim() === "") continue;
    if (!expected.has(docId)) expected.set(docId, row.displayName);
  }
  return expected;
};

export const reconcile = (
  source: BackupExtract,
  mapping: UidMapping,
  destination: DestinationState,
): ReconciliationReport => {
  const targets = mappedTargetIds(source, mapping);
  const missing: string[] = [];
  const mismatches: ReconciliationMismatch[] = [];
  let expectedDocs = 0;
  let presentDocs = 0;

  for (const [docId, expectedSnapshot] of expectedPortfolioDocs(source, mapping)) {
    expectedDocs += 1;
    const docData = destination.portfolios.get(docId);
    if (docData === undefined) {
      missing.push(`portfolios/${docId}`);
      continue;
    }
    presentDocs += 1;
    const destinationSnapshot = parseSnapshot(destinationSnapshotOf(docData));
    if (!destinationSnapshot) {
      mismatches.push({
        collection: "portfolios",
        docId,
        field: "snapshot",
        reason: "destination snapshot is missing or fails structural validation",
      });
      continue;
    }
    if (stableStringify(destinationSnapshot) !== stableStringify(expectedSnapshot)) {
      mismatches.push({
        collection: "portfolios",
        docId,
        field: "snapshot",
        reason: "destination snapshot differs from the source snapshot",
      });
    }
  }

  for (const [docId, expectedDisplayName] of expectedProfileDocs(source, mapping)) {
    expectedDocs += 1;
    if (!destination.users.has(docId)) {
      missing.push(`users/${docId}`);
      continue;
    }
    presentDocs += 1;
    const destinationDisplayName = destination.users.get(docId) ?? null;
    if (destinationDisplayName !== expectedDisplayName) {
      mismatches.push({
        collection: "users",
        docId,
        field: "displayName",
        reason: "destination displayName differs from the source profile",
      });
    }
  }

  const unexpected: string[] = [];
  for (const docId of destination.portfolios.keys()) {
    if (!targets.has(docId)) unexpected.push(`portfolios/${docId}`);
  }
  for (const docId of destination.users.keys()) {
    if (!targets.has(docId)) unexpected.push(`users/${docId}`);
  }

  return {
    ok: missing.length === 0 && unexpected.length === 0 && mismatches.length === 0,
    sourcePortfolioCount: source.snapshots.length,
    sourceProfileCount: source.profiles.length,
    destinationPortfolioCount: destination.portfolios.size,
    destinationUserCount: destination.users.size,
    expectedDocs,
    presentDocs,
    missing,
    unexpected,
    mismatches,
  };
};
