import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile";
import type { BackupExtract } from "./backupRows";

/**
 * Fully synthetic — sequential fixture ids and invented snapshot shapes;
 * nothing derived from the real backup.
 */

const SA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SB = "bbbbbbbb-bbbb-bbbb-bbbbb-bbbbbbbbbbbb";
const ORPHAN = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const FB_A = "Alphanumeric789012345";
const FB_B = "Alphanumeric987654321";
const STRANGER = "ForeignTarget00000001";

const validSnapshot = {
  stocks: [{ ticker: "SYN1", quantity: 10, nested: { b: 2, a: 1 } }],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
};

const source: BackupExtract = {
  users: [
    { id: SA, email: null, emailConfirmedAt: null, encryptedPassword: null, provider: "email", deletedAt: null, isAnonymous: false },
    { id: SB, email: null, emailConfirmedAt: null, encryptedPassword: null, provider: "email", deletedAt: null, isAnonymous: false },
  ],
  snapshots: [
    { userId: SA, snapshot: validSnapshot, malformed: false, updatedAt: "2026-01-01 00:00:00+00" },
    { userId: SB, snapshot: null, malformed: true, updatedAt: null }, // planner skips these
  ],
  profiles: [
    { id: SA, displayName: "Fixture Alice", updatedAt: null },
    { id: SB, displayName: null, updatedAt: null },
  ],
  eodCacheCount: 0,
  warnings: [],
};

const mapping = { [SA]: FB_A, [ORPHAN]: FB_B }; // SB unmapped on purpose

const destinationOk = () => ({
  portfolios: new Map<string, unknown>([
    [FB_A, { uid: FB_A, snapshot: validSnapshot, importedFrom: "supabase" }],
  ]),
  users: new Map<string, string | null>([
    [FB_A, "Fixture Alice"],
  ]),
});

describe("reconcile", () => {
  it("reports ok when every mapped doc is present and identical", () => {
    const report = reconcile(source, mapping, destinationOk());

    expect(report.ok).toBe(true);
    expect(report.expectedDocs).toBe(2); // FB_A portfolio + FB_A profile
    expect(report.presentDocs).toBe(2);
    expect(report.missing).toEqual([]);
    expect(report.unexpected).toEqual([]);
    expect(report.mismatches).toEqual([]);
    expect(report.sourcePortfolioCount).toBe(2);
    expect(report.sourceProfileCount).toBe(2);
  });

  it("is key-order-insensitive when comparing snapshots", () => {
    const reordered = JSON.parse(
      JSON.stringify({
        stocks: [{ nested: { a: 1, b: 2 }, quantity: 10, ticker: "SYN1" }],
        fnoTrades: [],
        alerts: [],
        watchlist: [],
        trades: [],
      }),
    );
    const destination = destinationOk();
    destination.portfolios.set(FB_A, { uid: FB_A, snapshot: reordered, importedFrom: "supabase" });
    expect(reconcile(source, mapping, destination).mismatches).toEqual([]);
  });

  it("flags a snapshot whose content differs", () => {
    const destination = destinationOk();
    const drifted = JSON.parse(JSON.stringify(validSnapshot));
    drifted.stocks[0].quantity = 11;
    destination.portfolios.set(FB_A, { uid: FB_A, snapshot: drifted, importedFrom: "supabase" });

    const report = reconcile(source, mapping, destination);
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([
      { collection: "portfolios", docId: FB_A, field: "snapshot", reason: "destination snapshot differs from the source snapshot" },
    ]);
  });

  it("flags a missing destination doc and counts it out of presentDocs", () => {
    const destination = destinationOk();
    destination.portfolios.delete(FB_A);

    const report = reconcile(source, mapping, destination);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([`portfolios/${FB_A}`]);
    expect(report.expectedDocs).toBe(2);
    expect(report.presentDocs).toBe(1);
  });

  it("flags a displayName mismatch and treats null === null", () => {
    const destination = destinationOk();
    destination.users.set(FB_A, "Different Name");

    const drifted = reconcile(source, mapping, destination);
    expect(drifted.mismatches).toContainEqual({
      collection: "users",
      docId: FB_A,
      field: "displayName",
      reason: "destination displayName differs from the source profile",
    });

    destination.users.set(FB_A, null);
    // SB's display name is null, but SB is unmapped — only mapped docs compare.
  });

  it("reports destination docs that are not mapped targets as unexpected", () => {
    const destination = destinationOk();
    destination.portfolios.set(STRANGER, { uid: STRANGER, snapshot: validSnapshot });
    destination.users.set(STRANGER, "Mystery");

    const report = reconcile(source, mapping, destination);
    expect(report.unexpected.sort()).toEqual([`portfolios/${STRANGER}`, `users/${STRANGER}`]);
    expect(report.ok).toBe(false);
    // The mapped docs themselves still compare clean.
    expect(report.mismatches).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it("ignores malformed source snapshots entirely (no missing-doc false alarm)", () => {
    const only: BackupExtract = {
      users: [],
      snapshots: [{ userId: SB, snapshot: null, malformed: true, updatedAt: null }],
      profiles: [],
      eodCacheCount: 0,
      warnings: [],
    };
    const report = reconcile(only, { [SB]: FB_A }, { portfolios: new Map(), users: new Map() });

    expect(report.ok).toBe(true);
    expect(report.expectedDocs).toBe(0);
    expect(report.missing).toEqual([]);
  });
});
