/**
 * Migration report types plus the canonical serializer used for digests.
 *
 * stableStringify sorts object keys recursively so a sha256 over its output
 * is reproducible across runs, machines, and key insertion order — the
 * approval file for a production import is bound to such a digest.
 *
 * The report itself is aggregate-only: identifiers, statuses, and counts.
 * It never contains emails, hashes, or snapshot contents.
 */

import type { ImportPlan, PlannedRecord } from "./importPlan";
import type { ApplyResult } from "./firestoreImport";
import type { MappingValidation } from "./identityMapping";
import type { ReconciliationReport } from "./reconcile";

/** JSON.stringify with recursively sorted object keys. */
const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const inner = source[key];
      if (inner === undefined) continue; // match JSON.stringify: drop undefined properties
      sorted[key] = sortValue(inner);
    }
    return sorted;
  }
  return value;
};

/**
 * Canonical form of a JSON-compatible value: deterministic digest input for
 * plans and reports. Undefined top-level values serialize as "null" so the
 * return type is always a string.
 */
export const stableStringify = (value: unknown): string => JSON.stringify(sortValue(value) ?? null);

export interface ReportCounts {
  users: number;
  snapshots: number;
  profiles: number;
  eodCacheRows: number;
  plannedRecords: number;
  creates: number;
  skips: number;
}

export interface MigrationReport {
  version: 1;
  generatedAt: string;
  source: { path: string; sha256: string };
  mapping: { path: string; sha256: string };
  destination: { kind: "emulator" | "production"; projectId: string };
  mode: "dry-run" | "apply";
  counts: ReportCounts;
  records: PlannedRecord[];
  validation: MappingValidation;
  apply?: ApplyResult;
  reconciliation?: ReconciliationReport;
}

/** Contents of the written plan.json (audit + re-digest input). */
export interface MigrationPlanFile {
  version: 1;
  generatedAt: string;
  sourceSha256: string;
  mappingSha256: string;
  /** sha256 of stableStringify(plan.records) — the digest the approval file binds. */
  planSha256: string;
  plan: ImportPlan;
}
