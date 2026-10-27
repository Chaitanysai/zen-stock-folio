/**
 * UID mapping validation and template helpers for the Supabase → Firebase
 * migration.
 *
 * The mapping is the single most dangerous artifact in the migration: a
 * wrong or duplicated target uid silently routes one user's portfolio to
 * another user's document. Every check here is therefore fail-closed and
 * reports uids only — never emails, hashes, or portfolio contents.
 */

import type { SupabaseUserRow } from "./backupRows";
import type { UidMapping } from "./fixture";

/** Re-exported so pipeline modules can import the mapping type from here. */
export type { UidMapping };

/**
 * Firebase Auth uids are opaque alphanumeric strings (28 chars in practice,
 * but the documented contract is only alphanumeric with sane length bounds),
 * so anything outside [A-Za-z0-9]{6,128} is a typo or corruption, not a uid.
 */
const FIREBASE_UID_PATTERN = /^[A-Za-z0-9]+$/;
const FIREBASE_UID_MIN = 6;
const FIREBASE_UID_MAX = 128;

export interface MappingValidation {
  /** Source uids that have a non-empty target. */
  mapped: number;
  /**
   * Source users with no non-empty target: the key is absent OR its value is
   * blank. Deliberately overlaps with emptyTargets so the report shows both
   * the aggregate view and the exact blank rows.
   */
  missingSourceUids: string[];
  /** Mapping keys that are not source users (typos, stale entries). */
  unknownSourceUids: string[];
  /** Two or more source uids pointing at the same target doc. */
  duplicateTargets: Array<{ firebaseUid: string; sourceUids: string[] }>;
  /** Source uids whose mapping value is blank/whitespace only. */
  emptyTargets: string[];
  /** Non-empty targets that cannot be a Firebase uid. */
  invalidTargets: Array<{ firebaseUid: string; reason: string }>;
}

export const validateMapping = (mapping: UidMapping, sourceUids: readonly string[]): MappingValidation => {
  const knownSources = new Set(sourceUids);

  const missingSourceUids: string[] = [];
  const emptyTargets: string[] = [];
  for (const uid of sourceUids) {
    const target = mapping[uid];
    if (target === undefined) {
      missingSourceUids.push(uid);
    } else if (target.trim() === "") {
      // Blank cells go into both lists: "missing" (no usable target) and
      // "emptyTargets" (there is a row, it just was never filled in).
      missingSourceUids.push(uid);
      emptyTargets.push(uid);
    }
  }

  const unknownSourceUids = Object.keys(mapping).filter((key) => !knownSources.has(key));

  const ownersByTarget = new Map<string, string[]>();
  const invalidTargets: Array<{ firebaseUid: string; reason: string }> = [];
  const seenInvalid = new Set<string>();
  for (const [sourceUid, rawTarget] of Object.entries(mapping)) {
    const target = rawTarget.trim();
    if (target === "") continue;
    const owners = ownersByTarget.get(target) ?? [];
    owners.push(sourceUid);
    ownersByTarget.set(target, owners);

    const reasons: string[] = [];
    if (!FIREBASE_UID_PATTERN.test(target)) reasons.push("contains characters outside A-Za-z0-9");
    if (target.length < FIREBASE_UID_MIN) reasons.push(`shorter than ${FIREBASE_UID_MIN} characters`);
    if (target.length > FIREBASE_UID_MAX) reasons.push(`longer than ${FIREBASE_UID_MAX} characters`);
    for (const reason of reasons) {
      const dedupeKey = `${target}::${reason}`;
      if (!seenInvalid.has(dedupeKey)) {
        seenInvalid.add(dedupeKey);
        invalidTargets.push({ firebaseUid: target, reason });
      }
    }
  }

  const duplicateTargets: Array<{ firebaseUid: string; sourceUids: string[] }> = [];
  for (const [firebaseUid, sourceUidsOfTarget] of ownersByTarget) {
    if (sourceUidsOfTarget.length > 1) duplicateTargets.push({ firebaseUid, sourceUids: sourceUidsOfTarget });
  }

  const mapped = sourceUids.filter((uid) => {
    const target = mapping[uid];
    return typeof target === "string" && target.trim() !== "";
  }).length;

  return { mapped, missingSourceUids, unknownSourceUids, duplicateTargets, emptyTargets, invalidTargets };
};

/** One gate for both the dry-run report and the pre-apply refusal. */
export const hasValidationIssues = (validation: MappingValidation): boolean =>
  validation.missingSourceUids.length > 0 ||
  validation.unknownSourceUids.length > 0 ||
  validation.duplicateTargets.length > 0 ||
  validation.emptyTargets.length > 0 ||
  validation.invalidTargets.length > 0;

export interface MappingTemplateRow {
  supabaseUid: string;
  /** Included so the operator knows which row they are filling in. */
  email: string | null;
  provider: string;
  /** True when the source user is soft-deleted (still listed; do not map). */
  deleted: boolean;
  /** Value the operator fills in; "" means "do not migrate this user". */
  firebaseUid: string;
}

/**
 * Builds the operator-facing template from the parsed backup rows. Contains
 * source emails by design — this file is a LOCAL gitignored artifact and
 * must never be printed or committed.
 */
export const mappingTemplateRows = (users: readonly SupabaseUserRow[]): MappingTemplateRow[] =>
  users.map((user) => ({
    supabaseUid: user.id,
    email: user.email,
    provider: user.provider,
    deleted: user.deletedAt !== null,
    firebaseUid: "",
  }));

/**
 * Applies the operator's edits (supabaseUid → firebaseUid) to the template.
 * Blank edits are dropped (row left unmapped); an edit for a uid that is not
 * in the template is a typo and fails loudly.
 */
export const applyMappingEdits = (
  template: readonly MappingTemplateRow[],
  edits: Record<string, string>,
): UidMapping => {
  const known = new Set(template.map((row) => row.supabaseUid));
  const mapping: UidMapping = {};
  for (const [supabaseUid, rawTarget] of Object.entries(edits)) {
    if (!known.has(supabaseUid)) {
      throw new Error(`mapping edit references a supabase uid that is not in the template (${supabaseUid.slice(0, 8)}…)`);
    }
    const trimmed = rawTarget.trim();
    if (trimmed !== "") mapping[supabaseUid] = trimmed;
  }
  return mapping;
};
