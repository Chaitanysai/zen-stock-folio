import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { stableStringify } from "./report";

describe("stableStringify", () => {
  it("is deterministic across nested key order", () => {
    const a = { z: 1, b: { y: 2, x: [3, { d: 4, c: 5 }] }, a: null };
    const b = { a: null, b: { x: [3, { c: 5, d: 4 }], y: 2 }, z: 1 };

    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("sorts keys at every level, deeper levels included", () => {
    const output = stableStringify({ outer: { mm: 1, kk: { tt: 1, ss: 2 } }, inner: 2 });
    expect(output.indexOf('"kk"')).toBeLessThan(output.indexOf('"mm"'));
    expect(output.indexOf('"ss"')).toBeLessThan(output.indexOf('"tt"'));
  });

  it("preserves array order (order is semantic for snapshot payloads)", () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(stableStringify([{ a: 1 }, { b: 2 }])).toBe(stableStringify([{ a: 1 }, { b: 2 }]));
  });

  it("handles primitives, nested arrays, and empty structures", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify("text")).toBe('"text"');
    expect(stableStringify([])).toBe("[]");
    expect(stableStringify({})).toBe("{}");
  });

  it("yields a stable sha256 digest for identical content in different key orders", () => {
    const a = { version: 1, records: [{ b: 2, a: 1 }], counts: { total: 1, create: 1 } };
    const b = { counts: { create: 1, total: 1 }, records: [{ a: 1, b: 2 }], version: 1 };

    const sha256 = (value: unknown): string =>
      createHash("sha256").update(stableStringify(value), "utf8").digest("hex");

    expect(sha256(a)).toBe(sha256(b));
    // Sanity: the digest actually changes when content changes.
    expect(sha256(a)).not.toBe(sha256({ ...a, version: 2 }));
  });
});
