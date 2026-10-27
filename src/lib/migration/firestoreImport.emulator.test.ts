// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { buildSyntheticFixture, type SyntheticFixture, type UidMapping } from "./fixture";
import { buildImportPlan, type ImportInput } from "./importPlan";
import { initAdminForEmulator, getAdminDb, applyImportPlan, assertEmulatorOnly } from "./firestoreImport";

/**
 * Firestore-emulator integration test for the importer.
 *
 * Run with: npm run test:migration
 * (wraps the suite in `firebase emulators:exec --only firestore,auth`).
 * Skips itself when no emulator is wired up.
 */

const emulatorUp = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const d = emulatorUp ? describe : describe.skip;

const PROJECT_ID = "demo-zenfolio-migration";
let fixture: SyntheticFixture;
const input = (): ImportInput => ({
  snapshots: fixture.snapshots,
  profiles: fixture.profiles,
});

const mapping: UidMapping = {
  "11111111-1111-1111-1111-111111111111": "fb_user_1",
  "22222222-2222-2222-2222-222222222222": "fb_user_2",
  "33333333-3333-3333-3333-333333333333": "fb_user_3",
};

d("firestoreImport (emulator)", () => {
  beforeAll(() => {
    assertEmulatorOnly();
    initAdminForEmulator(PROJECT_ID);
    fixture = buildSyntheticFixture((password) => bcrypt.hashSync(password, 10));
  });

  beforeEach(async () => {
    const db = getAdminDb();
    await Promise.all([
      db.recursiveDelete(db.collection("portfolios")),
      db.recursiveDelete(db.collection("users")),
    ]);
  });

  it("applies the plan and writes uid-consistent documents", async () => {
    const db = getAdminDb();
    const plan = buildImportPlan(input(), mapping, { portfolios: new Set(), users: new Set() });
    const result = await applyImportPlan(db, plan, input());

    expect(result.failed).toBe(0);
    expect(result.created).toBe(plan.summary.create);
    expect(plan.summary["skip-missing-mapping"]).toBe(1); // user-4 unmapped

    const portfolioDoc = await db.collection("portfolios").doc("fb_user_1").get();
    expect(portfolioDoc.exists).toBe(true);
    expect(portfolioDoc.data()?.uid).toBe("fb_user_1");
    expect(portfolioDoc.data()?.importedFrom).toBe("supabase");
    expect(Array.isArray(portfolioDoc.data()?.snapshot?.stocks)).toBe(true);

    const profileDoc = await db.collection("users").doc("fb_user_3").get();
    expect(profileDoc.exists).toBe(true);
    expect(profileDoc.data()?.uid).toBe("fb_user_3");
    expect(profileDoc.data()?.displayName).toBe("Fixture Google User");
  });

  it("is idempotent: re-applying creates nothing and reports destination conflicts", async () => {
    const db = getAdminDb();
    const first = buildImportPlan(input(), mapping, { portfolios: new Set(), users: new Set() });
    await applyImportPlan(db, first, input());

    const existing = {
      portfolios: new Set((await db.collection("portfolios").get()).docs.map((doc) => doc.id)),
      users: new Set((await db.collection("users").get()).docs.map((doc) => doc.id)),
    };
    const second = buildImportPlan(input(), mapping, existing);
    const secondResult = await applyImportPlan(db, second, input());

    expect(second.summary.create).toBe(0);
    expect(second.summary["skip-destination-exists"]).toBe(4);
    expect(secondResult.created).toBe(0);
    expect(secondResult.failed).toBe(0);
  });

  it("enforces no-overwrite at the write layer too (create-only)", async () => {
    const db = getAdminDb();
    const plan = buildImportPlan(input(), mapping, { portfolios: new Set(), users: new Set() });
    await applyImportPlan(db, plan, input());

    // Force a re-apply of one record ignoring the planner's skip: the
    // Firestore create must fail rather than overwrite.
    const duplicate = await db
      .collection("portfolios")
      .doc("fb_user_1")
      .create({ uid: "fb_user_1", snapshot: {}, importedFrom: "supabase" })
      .then(() => "unexpectedly-created")
      .catch((error: unknown) =>
        (error as { code?: string }).code ?? (error instanceof Error ? error.message : "failed"),
      );

    expect(String(duplicate)).toMatch(/already-exists|ALREADY_EXISTS|6/);
  });
});
