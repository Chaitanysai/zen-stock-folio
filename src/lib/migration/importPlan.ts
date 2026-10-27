import { parseSnapshot } from "../data/parseSnapshot";
import type { UidMapping } from "./fixture";

/**
 * Pure planner for the Firestore data import (no I/O — fully unit-testable).
 *
 * Policy (per the approved Phase 2 plan):
 *  - every destination document is keyed by the NEW Firebase UID;
 *  - an existing destination document is NEVER overwritten — it is skipped
 *    and reported;
 *  - records with no uid mapping, malformed payloads, duplicate source rows,
 *    or colliding mappings are skipped and reported;
 *  - reports contain source/target uids and statuses only — never snapshot
 *    contents, emails, or hashes.
 */

export type ImportCollection = "portfolios" | "users";

export type RecordStatus =
  | "create"
  | "skip-destination-exists"
  | "skip-duplicate-source"
  | "skip-missing-mapping"
  | "skip-mapping-conflict"
  | "skip-malformed";

export interface PlannedRecord {
  collection: ImportCollection;
  sourceUid: string;
  /** Destination document id (the mapped Firebase UID). */
  docId: string;
  status: RecordStatus;
}

export interface ImportInput {
  snapshots: Array<{ supabaseUid: string; snapshot: unknown }>;
  profiles: Array<{ supabaseUid: string; displayName: string | null }>;
}

export interface ImportPlan {
  records: PlannedRecord[];
  summary: Record<RecordStatus | "total", number>;
}

export interface ExistingDocuments {
  portfolios: ReadonlySet<string>;
  users: ReadonlySet<string>;
}

const emptySummary = (): Record<RecordStatus | "total", number> => ({
  create: 0,
  "skip-destination-exists": 0,
  "skip-duplicate-source": 0,
  "skip-missing-mapping": 0,
  "skip-mapping-conflict": 0,
  "skip-malformed": 0,
  total: 0,
});

const mappedUidFor = (sourceUid: string, mapping: UidMapping): string | null => {
  const target = mapping[sourceUid];
  return typeof target === "string" && target.trim().length > 0 ? target : null;
};

export const buildImportPlan = (
  input: ImportInput,
  mapping: UidMapping,
  existing: ExistingDocuments,
): ImportPlan => {
  const records: PlannedRecord[] = [];
  const summary = emptySummary();

  // Two source uids mapping to the same target uid would overwrite each
  // other — detect before anything is planned.
  const targetOwners = new Map<string, string>();
  for (const [sourceUid, target] of Object.entries(mapping)) {
    const previous = targetOwners.get(target);
    if (previous !== undefined && previous !== sourceUid) {
      records.push({
        collection: "portfolios",
        sourceUid,
        docId: target,
        status: "skip-mapping-conflict",
      });
    } else {
      targetOwners.set(target, sourceUid);
    }
  }

  const seenSourceUids = new Set<string>();

  // Portfolio snapshots → portfolios/{newUid}
  for (const row of input.snapshots) {
    const { supabaseUid } = row;

    if (seenSourceUids.has(supabaseUid)) {
      records.push({ collection: "portfolios", sourceUid: supabaseUid, docId: "", status: "skip-duplicate-source" });
      continue;
    }
    seenSourceUids.add(supabaseUid);

    const docId = mappedUidFor(supabaseUid, mapping);
    if (!docId) {
      records.push({ collection: "portfolios", sourceUid: supabaseUid, docId: "", status: "skip-missing-mapping" });
      continue;
    }
    if (existing.portfolios.has(docId)) {
      records.push({ collection: "portfolios", sourceUid: supabaseUid, docId, status: "skip-destination-exists" });
      continue;
    }
    if (!parseSnapshot(row.snapshot)) {
      records.push({ collection: "portfolios", sourceUid: supabaseUid, docId, status: "skip-malformed" });
      continue;
    }
    records.push({ collection: "portfolios", sourceUid: supabaseUid, docId, status: "create" });
  }

  // Profiles → users/{newUid}
  const profileSeen = new Set<string>();
  for (const row of input.profiles) {
    const { supabaseUid } = row;

    if (profileSeen.has(supabaseUid)) {
      records.push({ collection: "users", sourceUid: supabaseUid, docId: "", status: "skip-duplicate-source" });
      continue;
    }
    profileSeen.add(supabaseUid);

    const docId = mappedUidFor(supabaseUid, mapping);
    if (!docId) {
      records.push({ collection: "users", sourceUid: supabaseUid, docId: "", status: "skip-missing-mapping" });
      continue;
    }
    if (existing.users.has(docId)) {
      records.push({ collection: "users", sourceUid: supabaseUid, docId, status: "skip-destination-exists" });
      continue;
    }
    if (typeof row.displayName !== "string" && row.displayName !== null) {
      records.push({ collection: "users", sourceUid: supabaseUid, docId, status: "skip-malformed" });
      continue;
    }
    records.push({ collection: "users", sourceUid: supabaseUid, docId, status: "create" });
  }

  for (const record of records) {
    summary[record.status] += 1;
    summary.total += 1;
  }

  return { records, summary };
};

/**
 * The document payload the importer writes — the uid field always equals the
 * document id, matching firestore.rules' payload check.
 */
export const portfolioDocPayload = (docId: string, snapshot: unknown) => ({
  uid: docId,
  snapshot,
  importedFrom: "supabase" as const,
});

export const profileDocPayload = (docId: string, displayName: string | null) => ({
  uid: docId,
  displayName,
  importedFrom: "supabase" as const,
});
