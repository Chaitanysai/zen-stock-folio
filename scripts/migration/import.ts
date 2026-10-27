/**
 * Firestore data importer — DRY RUN by default, emulator-only.
 *
 * Usage:
 *   npm run migration:import                 # dry run, aggregate report only
 *   npm run migration:import -- --apply      # write to the LOCAL EMULATOR
 *                                            # (refuses without FIRESTORE_EMULATOR_HOST)
 *
 * Safety properties:
 *  - dry run is the default; writes only happen with --apply AND an active
 *    Firestore emulator (FIRESTORE_EMULATOR_HOST) — production import has
 *    no code path in this tool;
 *  - existing destination documents are never overwritten (planner skip +
 *    Firestore create-only writes);
 *  - the report is aggregate-only: source/target uids and statuses, never
 *    emails, hashes, or portfolio contents.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildImportPlan } from "../../src/lib/migration/importPlan";
import type { ImportInput } from "../../src/lib/migration/importPlan";
import type { UidMapping } from "../../src/lib/migration/fixture";
import { assertEmulatorOnly, initAdminForEmulator, getAdminDb, applyImportPlan } from "../../src/lib/migration/firestoreImport";

const args = process.argv.slice(2);
const apply = args.includes("--apply");

const fixturePath = join(process.cwd(), "scripts", "migration", "fixtures", "synthetic-fixture.json");
const mappingPath = join(process.cwd(), "scripts", "migration", "fixtures", "synthetic-mapping.json");

const input = JSON.parse(readFileSync(fixturePath, "utf8")) as ImportInput;
const mapping = JSON.parse(readFileSync(mappingPath, "utf8")) as UidMapping;

// Dry run: plan against an empty destination (the planner's conflict
// detection still runs; existing-doc checks apply only when a real
// destination is available, which is the --apply path below).
if (!apply) {
  const plan = buildImportPlan(input, mapping, { portfolios: new Set(), users: new Set() });
  console.log("DRY RUN (no writes performed)");
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log("Per-record statuses:");
  for (const record of plan.records) {
    console.log(`  ${record.collection}/${record.docId || "(no-doc-id)"} <- ${record.sourceUid.slice(0, 8)}… : ${record.status}`);
  }
  process.exit(0);
}

assertEmulatorOnly();
initAdminForEmulator("demo-zenfolio-migration");
const db = getAdminDb();

const run = async () => {
  // Read current destination state so the planner can skip existing docs.
  const [portfolioDocs, userDocs] = await Promise.all([
    db.collection("portfolios").get(),
    db.collection("users").get(),
  ]);
  const existing = {
    portfolios: new Set(portfolioDocs.docs.map((d) => d.id)),
    users: new Set(userDocs.docs.map((d) => d.id)),
  };

  const plan = buildImportPlan(input, mapping, existing);
  const result = await applyImportPlan(db, plan, input);

  console.log("APPLY COMPLETE (local emulator only)");
  console.log(JSON.stringify({ summary: plan.summary, created: result.created, failed: result.failed }, null, 2));
  if (result.failures.length) {
    console.log("Failures:");
    for (const failure of result.failures) {
      console.log(`  ${failure.collection}/${failure.docId}: ${failure.reason}`);
    }
  }
};

void run();
