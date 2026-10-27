/**
 * Generates the fully synthetic migration fixture + a demonstration uid
 * mapping. Nothing here is derived from the real backup; the fixture is
 * safe to keep in the repository.
 *
 * Usage: npm run migration:make-fixture
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { buildSyntheticFixture, SYNTHETIC_PASSWORD, type UidMapping } from "../../src/lib/migration/fixture";

const fixture = buildSyntheticFixture((password) => bcrypt.hashSync(password, 10));

// Demonstrative mapping: every user maps to a fresh Firebase UID except
// user-4, which stays unmapped so the importer's skip-missing-mapping path
// is exercised in tests. Target uids are synthetic strings — real mappings
// are produced at production-import time, not here.
const mapping: UidMapping = {
  "11111111-1111-1111-1111-111111111111": "fb_user_1",
  "22222222-2222-2222-2222-222222222222": "fb_user_2",
  "33333333-3333-3333-3333-333333333333": "fb_user_3",
};

const outDir = join(process.cwd(), "scripts", "migration", "fixtures");
mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, "synthetic-fixture.json"), JSON.stringify(fixture, null, 2));
writeFileSync(join(outDir, "synthetic-mapping.json"), JSON.stringify(mapping, null, 2));

console.log("Fixture written (fully synthetic):");
console.log("  scripts/migration/fixtures/synthetic-fixture.json");
console.log("  scripts/migration/fixtures/synthetic-mapping.json");
console.log(`  users: ${fixture.users.length}, snapshots: ${fixture.snapshots.length}, profiles: ${fixture.profiles.length}`);
console.log(`  (fixture password hashes are bcrypt of the documented synthetic password)`);
