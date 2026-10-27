import { describe, expect, it } from "vitest";
import { buildImportPlan, type ImportInput } from "./importPlan";
import type { UidMapping } from "./fixture";

const OLD_A = "11111111-1111-1111-1111-111111111111";
const OLD_B = "22222222-2222-2222-2222-222222222222";
const OLD_UNMAPPED = "44444444-4444-4444-4444-444444444444";

const validSnapshot = {
  stocks: [{ ticker: "SYNTH1" }],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
};

const malformedSnapshot = { stocks: "not-an-array" };

const input = (over: Partial<ImportInput> = {}): ImportInput => ({
  snapshots: [
    { supabaseUid: OLD_A, snapshot: validSnapshot },
    { supabaseUid: OLD_B, snapshot: validSnapshot },
    { supabaseUid: OLD_UNMAPPED, snapshot: validSnapshot },
  ],
  profiles: [
    { supabaseUid: OLD_A, displayName: "Fixture Alice" },
    { supabaseUid: OLD_B, displayName: null },
  ],
  ...over,
});

const mapping: UidMapping = {
  [OLD_A]: "fb_user_1",
  [OLD_B]: "fb_user_2",
  // OLD_UNMAPPED is deliberately absent
};

describe("buildImportPlan", () => {
  it("plans creates keyed by the NEW uid for everything mappable and valid", () => {
    const plan = buildImportPlan(input(), mapping, { portfolios: new Set(), users: new Set() });

    expect(plan.summary).toMatchObject({ create: 4, total: 5 });
    expect(plan.records.filter((r) => r.collection === "portfolios" && r.status === "create")).toEqual([
      { collection: "portfolios", sourceUid: OLD_A, docId: "fb_user_1", status: "create" },
      { collection: "portfolios", sourceUid: OLD_B, docId: "fb_user_2", status: "create" },
    ]);
  });

  it("never overwrites an existing destination document", () => {
    const plan = buildImportPlan(input(), mapping, {
      portfolios: new Set(["fb_user_1"]),
      users: new Set(),
    });

    expect(plan.records).toContainEqual({
      collection: "portfolios",
      sourceUid: OLD_A,
      docId: "fb_user_1",
      status: "skip-destination-exists",
    });
    expect(plan.summary["skip-destination-exists"]).toBe(1);
    expect(plan.summary.create).toBe(3);
  });

  it("skips records with no uid mapping", () => {
    const plan = buildImportPlan(input(), mapping, { portfolios: new Set(), users: new Set() });

    expect(plan.records).toContainEqual({
      collection: "portfolios",
      sourceUid: OLD_UNMAPPED,
      docId: "",
      status: "skip-missing-mapping",
    });
    expect(plan.summary["skip-missing-mapping"]).toBe(1);
  });

  it("skips malformed snapshots (structure validation, not contents)", () => {
    const plan = buildImportPlan(
      input({
        snapshots: [
          { supabaseUid: OLD_A, snapshot: malformedSnapshot },
          { supabaseUid: OLD_B, snapshot: validSnapshot },
        ],
      }),
      mapping,
      { portfolios: new Set(), users: new Set() },
    );

    expect(plan.records).toContainEqual({
      collection: "portfolios",
      sourceUid: OLD_A,
      docId: "fb_user_1",
      status: "skip-malformed",
    });
    expect(plan.summary["skip-malformed"]).toBe(1);
  });

  it("skips duplicate source rows and colliding mappings", () => {
    const duplicated = input({
      snapshots: [
        { supabaseUid: OLD_A, snapshot: validSnapshot },
        { supabaseUid: OLD_A, snapshot: validSnapshot },
      ],
    });
    const plan = buildImportPlan(duplicated, mapping, { portfolios: new Set(), users: new Set() });
    expect(plan.summary["skip-duplicate-source"]).toBe(1);
    expect(plan.summary.create).toBe(3); // 1 portfolio + 2 profiles

    const colliding: UidMapping = { [OLD_A]: "fb_user_1", [OLD_B]: "fb_user_1" };
    const collisionPlan = buildImportPlan(input(), colliding, { portfolios: new Set(), users: new Set() });
    expect(collisionPlan.summary["skip-mapping-conflict"]).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent: a full re-plan against now-existing docs yields only skips", () => {
    const first = buildImportPlan(input(), mapping, { portfolios: new Set(), users: new Set() });
    const createdPortfolios = new Set(
      first.records.filter((r) => r.collection === "portfolios" && r.status === "create").map((r) => r.docId),
    );
    const createdUsers = new Set(
      first.records.filter((r) => r.collection === "users" && r.status === "create").map((r) => r.docId),
    );

    const second = buildImportPlan(input(), mapping, {
      portfolios: createdPortfolios,
      users: createdUsers,
    });

    // 2 portfolios + 2 profiles now exist → all skipped; the unmapped
    // snapshot is skipped for its own reason. Nothing is re-created.
    expect(second.summary["skip-destination-exists"]).toBe(4);
    expect(second.summary["skip-missing-mapping"]).toBe(1);
    expect(second.summary.create).toBe(0);
  });
});
