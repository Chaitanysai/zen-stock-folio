/**
 * Crash-safe resume state for --apply runs.
 *
 * The checkpoint records which planned writes were ATTEMPTED and their
 * outcome, keyed by `${collection}/${docId}`. On rerun, completed keys are
 * merged into the planner's "existing destination documents" set so finished
 * work is skipped and never written twice.
 *
 * The checkpoint is bound to the source backup digest and the mapping
 * digest: resuming against a different dump or mapping would mark documents
 * that were never actually written as completed, so a digest mismatch
 * refuses to merge instead.
 */

export interface MigrationCheckpoint {
  version: 1;
  sourceSha256: string;
  mappingSha256: string;
  completed: string[];
  failed: Array<{ collection: string; docId: string; reason: string }>;
  updatedAt: string;
}

export interface CheckpointOutcome {
  collection: string;
  docId: string;
  ok: boolean;
  reason?: string;
}

export const emptyCheckpoint = (sourceSha256: string, mappingSha256: string): MigrationCheckpoint => ({
  version: 1,
  sourceSha256,
  mappingSha256,
  completed: [],
  failed: [],
  updatedAt: new Date().toISOString(),
});

export const docKey = (collection: string, docId: string): string => `${collection}/${docId}`;

/** Set of `${collection}/${docId}` keys already written by a previous run. */
export const completedDocKeys = (checkpoint: MigrationCheckpoint | null): Set<string> =>
  new Set(checkpoint ? checkpoint.completed : []);

/**
 * Folds new outcomes into the previous checkpoint. `ok: true` marks the key
 * completed (and clears any prior failure); `ok: false` records the failure
 * (and clears completion). Throws when the previous checkpoint belongs to a
 * different source/mapping digest pair.
 */
export const mergeCheckpoint = (
  previous: MigrationCheckpoint | null,
  sourceSha256: string,
  mappingSha256: string,
  applied: readonly CheckpointOutcome[],
): MigrationCheckpoint => {
  if (
    previous &&
    (previous.sourceSha256 !== sourceSha256 || previous.mappingSha256 !== mappingSha256)
  ) {
    // Fail loudly rather than resume against the wrong source: a stale
    // checkpoint's "completed" keys would silently skip real work.
    throw new Error(
      "REFUSED: existing checkpoint was created for a different source/mapping digest pair; " +
        "inspect and remove it, or run against the matching backup and mapping files",
    );
  }

  const completed = new Set(previous?.completed ?? []);
  const failed = new Map<string, { collection: string; docId: string; reason: string }>();
  for (const entry of previous?.failed ?? []) failed.set(docKey(entry.collection, entry.docId), entry);

  for (const outcome of applied) {
    const key = docKey(outcome.collection, outcome.docId);
    if (outcome.ok) {
      completed.add(key);
      failed.delete(key);
    } else {
      completed.delete(key);
      failed.set(key, { collection: outcome.collection, docId: outcome.docId, reason: outcome.reason ?? "unknown error" });
    }
  }

  return {
    version: 1,
    sourceSha256,
    mappingSha256,
    completed: [...completed].sort(),
    failed: [...failed.values()].sort((a, b) => docKey(a.collection, a.docId).localeCompare(docKey(b.collection, b.docId))),
    updatedAt: new Date().toISOString(),
  };
};
