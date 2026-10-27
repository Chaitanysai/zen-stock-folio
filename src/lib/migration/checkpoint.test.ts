import { describe, expect, it } from "vitest";
import { completedDocKeys, docKey, emptyCheckpoint, mergeCheckpoint } from "./checkpoint";
import type { MigrationCheckpoint } from "./checkpoint";

const SOURCE = "source-digest-aaaa";
const SOURCE_OTHER = "source-digest-bbbb";
const MAPPING = "mapping-digest-aaaa";
const MAPPING_OTHER = "mapping-digest-bbbb";

describe("mergeCheckpoint", () => {
  it("starts an empty checkpoint from scratch", () => {
    const checkpoint = mergeCheckpoint(null, SOURCE, MAPPING, []);
    expect(checkpoint.version).toBe(1);
    expect(checkpoint.sourceSha256).toBe(SOURCE);
    expect(checkpoint.mappingSha256).toBe(MAPPING);
    expect(checkpoint.completed).toEqual([]);
    expect(checkpoint.failed).toEqual([]);
  });

  it("emptyCheckpoint matches the merge-null baseline", () => {
    const a = emptyCheckpoint(SOURCE, MAPPING);
    expect(a.completed).toEqual([]);
    expect(a.failed).toEqual([]);
    expect(a.version).toBe(1);
  });

  it("folds outcomes in: ok becomes completed, failure recorded with reason", () => {
    let checkpoint = emptyCheckpoint(SOURCE, MAPPING);
    checkpoint = mergeCheckpoint(
      checkpoint,
      SOURCE,
      MAPPING,
      [
        { collection: "portfolios", docId: "fb_1", ok: true },
        { collection: "users", docId: "fb_2", ok: false, reason: "already exists" },
      ],
    );

    expect(checkpoint.completed).toEqual(["portfolios/fb_1"]);
    expect(checkpoint.failed).toEqual([{ collection: "users", docId: "fb_2", reason: "already exists" }]);
  });

  it("clears a prior failure when the doc later succeeds (resume semantics)", () => {
    let checkpoint = emptyCheckpoint(SOURCE, MAPPING);
    checkpoint = mergeCheckpoint(checkpoint, SOURCE, MAPPING, [
      { collection: "portfolios", docId: "fb_1", ok: false, reason: "transient" },
    ]);
    checkpoint = mergeCheckpoint(checkpoint, SOURCE, MAPPING, [{ collection: "portfolios", docId: "fb_1", ok: true }]);

    expect(checkpoint.completed).toEqual(["portfolios/fb_1"]);
    expect(checkpoint.failed).toEqual([]);
  });

  it("replaces a prior failure reason on a new failure", () => {
    let checkpoint = emptyCheckpoint(SOURCE, MAPPING);
    checkpoint = mergeCheckpoint(checkpoint, SOURCE, MAPPING, [
      { collection: "portfolios", docId: "fb_1", ok: false, reason: "first" },
    ]);
    checkpoint = mergeCheckpoint(checkpoint, SOURCE, MAPPING, [
      { collection: "portfolios", docId: "fb_1", ok: false, reason: "second" },
    ]);

    expect(checkpoint.failed).toEqual([{ collection: "portfolios", docId: "fb_1", reason: "second" }]);
    expect(checkpoint.completed).toEqual([]);
  });

  it("refuses to merge into a checkpoint from a different source or mapping digest", () => {
    const checkpoint: MigrationCheckpoint = mergeCheckpoint(null, SOURCE, MAPPING, [
      { collection: "portfolios", docId: "fb_1", ok: true },
    ]);

    expect(() => mergeCheckpoint(checkpoint, SOURCE_OTHER, MAPPING, [])).toThrow(/different source\/mapping digest/);
    expect(() => mergeCheckpoint(checkpoint, SOURCE, MAPPING_OTHER, [])).toThrow(/different source\/mapping digest/);
    // The refusal must leave the original checkpoint untouched.
    expect(checkpoint.completed).toEqual(["portfolios/fb_1"]);
  });
});

describe("completedDocKeys", () => {
  it("returns the resume key set (or empty for null)", () => {
    expect(completedDocKeys(null)).toEqual(new Set());
    const checkpoint = emptyCheckpoint(SOURCE, MAPPING);
    const merged = mergeCheckpoint(checkpoint, SOURCE, MAPPING, [
      { collection: "portfolios", docId: "fb_1", ok: true },
      { collection: "users", docId: "fb_2", ok: true },
    ]);
    expect(completedDocKeys(merged)).toEqual(
      new Set([docKey("portfolios", "fb_1"), docKey("users", "fb_2")]),
    );
  });
});
