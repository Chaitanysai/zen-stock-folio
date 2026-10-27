/**
 * Real-data migration CLI: Supabase cluster backup → Firestore.
 *
 * DRY RUN by default; applies only with --apply (and then only to the local
 * emulator unless the full production approval chain passes).
 *
 *   npx vite-node scripts/migration/migrate.ts --dump <path.gz> --mapping <path.json> [--out <dir>]
 *     [--emit-mapping-template]   write mapping template, exit
 *     [--apply]                   write to the LOCAL EMULATOR (requires
 *                                 FIRESTORE_EMULATOR_HOST)
 *     [--apply --production --destination-project <id> --approval-file <path>]
 *                                 production path; refuses unless
 *                                 MIGRATION_ALLOW_PRODUCTION=1 AND the approval
 *                                 JSON matches digests, approver, and a <24h
 *                                 timestamp
 *
 * Safety properties:
 *  - stdout is aggregate-only: counts, doc ids/uid prefixes, digests. It never
 *    contains emails, password hashes, or snapshot contents;
 *  - every plan/report/checkpoint artifact is written under --out (default
 *    .migration/) which must stay out of git (mapping-template.json contains
 *    source emails);
 *  - production refusals write NOTHING (no directory, no files);
 *  - writes are create-only and resume via checkpoint.json; a checkpoint from
 *    a different source/mapping digest pair is refused;
 *  - exit codes: 0 success, 1 validation/reconciliation failure,
 *    2 refused/blocked.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { parseBackupRows } from "../../src/lib/migration/backupRows";
import { assertEmulatorOnly, getAdminDb, initAdminForEmulator } from "../../src/lib/migration/firestoreImport";
import { applyImportPlan, type ApplyResult } from "../../src/lib/migration/firestoreImport";
import { buildImportPlan } from "../../src/lib/migration/importPlan";
import type { ImportInput } from "../../src/lib/migration/importPlan";
import { hasValidationIssues, mappingTemplateRows, validateMapping } from "../../src/lib/migration/identityMapping";
import type { MappingValidation } from "../../src/lib/migration/identityMapping";
import { reconcile } from "../../src/lib/migration/reconcile";
import type { DestinationState, ReconciliationReport } from "../../src/lib/migration/reconcile";
import { completedDocKeys, mergeCheckpoint } from "../../src/lib/migration/checkpoint";
import type { MigrationCheckpoint } from "../../src/lib/migration/checkpoint";
import { stableStringify } from "../../src/lib/migration/report";
import type { MigrationPlanFile, MigrationReport } from "../../src/lib/migration/report";
import type { UidMapping } from "../../src/lib/migration/fixture";

const DEFAULT_DUMP = "db_cluster-21-10-2026@15-06-23.backup.gz";
const DEFAULT_OUT = ".migration";
const EMULATOR_PROJECT_ID = "demo-zenfolio-migration";
const APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const EXIT_OK = 0;
const EXIT_VALIDATION = 1;
const EXIT_BLOCKED = 2;

interface Args {
  dump: string;
  mapping: string | null;
  out: string;
  emitTemplate: boolean;
  apply: boolean;
  production: boolean;
  destinationProject: string | null;
  approvalFile: string | null;
}

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const value = (name: string): string | null => {
    const index = argv.indexOf(name);
    if (index === -1) return null;
    return argv[index + 1] ?? null;
  };
  return {
    dump: value("--dump") ?? DEFAULT_DUMP,
    mapping: value("--mapping"),
    out: value("--out") ?? DEFAULT_OUT,
    emitTemplate: argv.includes("--emit-mapping-template"),
    apply: argv.includes("--apply"),
    production: argv.includes("--production"),
    destinationProject: value("--destination-project"),
    approvalFile: value("--approval-file"),
  };
};

const sha256File = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
const sha256Text = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * Typed abort: thrown from anywhere, converted to process.exit by the
 * top-level handler. (Throwing — rather than relying on process.exit's
 * return type — keeps narrowing/definite-assignment analysis sound under
 * strict TypeScript.)
 */
class MigrationExit extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

// A `function` declaration (not a const arrow) is required so TypeScript
// treats calls to `fail` as terminating control flow, which keeps narrowing
// and definite-assignment analysis sound without casts.
function fail(code: number, message: string): never {
  throw new MigrationExit(code, message);
}

interface DestinationRead {
  state: DestinationState;
  portfolioIds: Set<string>;
  userIds: Set<string>;
}

const readDestination = async (db: Firestore): Promise<DestinationRead> => {
  const [portfolioDocs, userDocs] = await Promise.all([
    db.collection("portfolios").get(),
    db.collection("users").get(),
  ]);
  const portfolios = new Map<string, unknown>();
  const users = new Map<string, string | null>();
  for (const doc of portfolioDocs.docs) portfolios.set(doc.id, doc.data());
  for (const doc of userDocs.docs) {
    const data: unknown = doc.data();
    let displayName: string | null = null;
    if (data !== null && typeof data === "object" && "displayName" in data) {
      const value = (data as { displayName?: unknown }).displayName;
      if (typeof value === "string") displayName = value;
    }
    users.set(doc.id, displayName);
  }
  return { state: { portfolios, users }, portfolioIds: new Set(portfolios.keys()), userIds: new Set(users.keys()) };
};

interface ApprovalExpectation {
  destinationProjectId: string;
  sourceSha256: string;
  mappingSha256: string;
  planSha256: string;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/**
 * Pure validation of the production approval file. Returns null when every
 * field matches the expectation exactly and the approval is fresh; otherwise
 * a human-readable refusal reason (never containing record data).
 */
export const verifyProductionApproval = (raw: string, expected: ApprovalExpectation): string | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "approval file is not valid JSON";
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "approval file is not a JSON object";
  }
  const approval = parsed as Record<string, unknown>;

  for (const field of ["destinationProjectId", "sourceSha256", "mappingSha256", "planSha256", "approvedBy", "approvedAt"]) {
    if (!isNonEmptyString(approval[field])) return `approval file field "${field}" is missing or empty`;
  }
  if (approval.destinationProjectId !== expected.destinationProjectId) {
    return "approval destinationProjectId does not match --destination-project";
  }
  if (approval.sourceSha256 !== expected.sourceSha256) return "approval sourceSha256 does not match the backup digest";
  if (approval.mappingSha256 !== expected.mappingSha256) return "approval mappingSha256 does not match the mapping digest";
  if (approval.planSha256 !== expected.planSha256) return "approval planSha256 does not match the computed plan";

  const approvedAtMs = Date.parse(approval.approvedAt as string);
  if (Number.isNaN(approvedAtMs)) return "approval approvedAt is not a parseable timestamp";
  if (approvedAtMs > Date.now()) return "approval approvedAt is in the future";
  if (Date.now() - approvedAtMs > APPROVAL_MAX_AGE_MS) return "approval approvedAt is older than 24 hours";
  return null;
};

const checkpointPath = (outDir: string): string => join(outDir, "checkpoint.json");

/** Loads and shape-checks a resumable checkpoint; refuses anything unexpected. */
const loadCheckpoint = (outDir: string, sourceSha256: string, mappingSha256: string): MigrationCheckpoint => {
  const path = checkpointPath(outDir);
  if (!existsSync(path)) return mergeCheckpoint(null, sourceSha256, mappingSha256, []);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(EXIT_BLOCKED, `checkpoint ${path} exists but is not valid JSON — inspect or remove it before resuming`);
  }
  const candidate = parsed as Partial<MigrationCheckpoint> | null;
  if (
    !candidate ||
    candidate.version !== 1 ||
    typeof candidate.sourceSha256 !== "string" ||
    typeof candidate.mappingSha256 !== "string" ||
    !Array.isArray(candidate.completed)
  ) {
    fail(EXIT_BLOCKED, `checkpoint ${path} has an unrecognized shape — refusing to resume`);
  }
  // Merge with zero outcomes validates the digest binding before any work.
  return mergeCheckpoint(candidate as MigrationCheckpoint, sourceSha256, mappingSha256, []);
};

const writeCheckpointAtomic = (outDir: string, checkpoint: MigrationCheckpoint): void => {
  const path = checkpointPath(outDir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), "utf8");
  renameSync(tmp, path);
};

const printCounts = (
  label: string,
  extract: { users: Array<{ deletedAt: string | null; isAnonymous: boolean }>; snapshots: unknown[]; profiles: unknown[]; eodCacheCount: number },
): void => {
  const active = extract.users.filter((user) => user.deletedAt === null && !user.isAnonymous).length;
  console.log(
    `${label}: users=${extract.users.length} (active=${active}) ` +
      `snapshots=${extract.snapshots.length} profiles=${extract.profiles.length} eodCacheRows=${extract.eodCacheCount}`,
  );
};

const printPlanRecords = (
  status: string,
  records: Array<{ collection: string; docId: string; sourceUid: string; status: string }>,
): void => {
  for (const record of records) {
    if (record.status !== status) continue;
    const docPart = record.docId === "" ? "(no-doc-id)" : `${record.collection}/${record.docId}`;
    console.log(`  ${record.status.padEnd(24)} ${docPart} <- ${record.sourceUid.slice(0, 8)}…`);
  }
};

interface ReportCountsInput {
  users: number;
  snapshots: number;
  profiles: number;
  eodCacheRows: number;
  plannedRecords: number;
  creates: number;
  skips: number;
}

const buildCounts = (extract: { users: unknown[]; snapshots: unknown[]; profiles: unknown[]; eodCacheCount: number }, plan: { records: unknown[]; summary: Record<string, number> }): ReportCountsInput => ({
  users: extract.users.length,
  snapshots: extract.snapshots.length,
  profiles: extract.profiles.length,
  eodCacheRows: extract.eodCacheCount,
  plannedRecords: plan.records.length,
  creates: plan.summary.create ?? 0,
  skips: plan.records.length - (plan.summary.create ?? 0),
});

const main = async (): Promise<void> => {
  const args = parseArgs();
  const mode: "dry-run" | "apply" = args.apply ? "apply" : "dry-run";
  const targetKind: "emulator" | "production" = args.production ? "production" : "emulator";
  const outDir = resolve(args.out);

  // ---------------------------------------------------------------- backup
  if (!existsSync(args.dump)) fail(EXIT_BLOCKED, `backup file not found: ${args.dump}`);
  const sourceSha256 = sha256File(args.dump);
  const sql = gunzipSync(readFileSync(args.dump)).toString("utf8");
  const extract = parseBackupRows(sql);

  console.log(`Backup parsed read-only: ${args.dump}`);
  printCounts("Source counts", extract);
  if (extract.warnings.length > 0) {
    console.log("Backup warnings (table-level only):");
    for (const warning of extract.warnings) console.log(`  - ${warning}`);
  }

  // ------------------------------------------------- mapping template mode
  if (args.emitTemplate) {
    mkdirSync(outDir, { recursive: true });
    const template = {
      version: 1,
      note:
        'Fill firebaseUid for each row to migrate; leave "" to skip. Contains source emails — never print, commit, or share this file.',
      rows: mappingTemplateRows(extract.users),
    };
    writeFileSync(join(outDir, "mapping-template.json"), JSON.stringify(template, null, 2), "utf8");
    console.log(`Mapping template written: ${join(args.out, "mapping-template.json")} (${template.rows.length} rows)`);
    console.log(`NOTE: the template contains source emails; ensure "${args.out}/" is gitignored before any commit.`);
    process.exit(EXIT_OK);
  }

  // ---------------------------------------------------------------- mapping
  if (!args.mapping) fail(EXIT_BLOCKED, "--mapping is required (or run with --emit-mapping-template to create the template first)");
  const mappingPath: string = args.mapping;
  if (!existsSync(mappingPath)) fail(EXIT_BLOCKED, `mapping file not found: ${mappingPath} — run with --emit-mapping-template first`);
  const mappingSha256 = sha256File(mappingPath);

  let parsedMapping: unknown;
  try {
    parsedMapping = JSON.parse(readFileSync(mappingPath, "utf8"));
  } catch {
    fail(EXIT_BLOCKED, "mapping file is not valid JSON");
  }
  if (parsedMapping === null || typeof parsedMapping !== "object" || Array.isArray(parsedMapping)) {
    fail(EXIT_BLOCKED, "mapping file must be a JSON object of {supabaseUid: firebaseUid}");
  }
  const mapping: UidMapping = {};
  for (const [key, value] of Object.entries(parsedMapping as Record<string, unknown>)) {
    if (typeof value !== "string") fail(EXIT_BLOCKED, "mapping file: every value must be a string firebase uid");
    mapping[key] = value;
  }

  const validation: MappingValidation = validateMapping(mapping, extract.users.map((user) => user.id));
  console.log(
    `Validation: mapped=${validation.mapped} missing=${validation.missingSourceUids.length} ` +
      `unknown=${validation.unknownSourceUids.length} duplicateTargets=${validation.duplicateTargets.length} ` +
      `emptyTargets=${validation.emptyTargets.length} invalidTargets=${validation.invalidTargets.length}`,
  );
  for (const uid of validation.missingSourceUids) console.log(`  missing mapping for source uid ${uid}`);
  for (const uid of validation.unknownSourceUids) console.log(`  unknown source uid in mapping ${uid}`);
  for (const collision of validation.duplicateTargets) {
    console.log(`  duplicate target ${collision.firebaseUid.slice(0, 8)}… claimed by ${collision.sourceUids.length} source uids`);
  }
  for (const invalid of validation.invalidTargets) console.log(`  invalid target value (${invalid.reason})`);

  // ----------------------------------------------------- production pre-gate
  const productionApply = mode === "apply" && args.production;
  if (productionApply) {
    if (process.env.MIGRATION_ALLOW_PRODUCTION !== "1") {
      fail(EXIT_BLOCKED, "production import refused: MIGRATION_ALLOW_PRODUCTION must be set to 1");
    }
    if (!args.destinationProject) {
      fail(EXIT_BLOCKED, "production import refused: --destination-project is required");
    }
  }

  // ------------------------------------------------------------ destination
  let db: Firestore | null = null;
  let destination: DestinationRead = {
    state: { portfolios: new Map(), users: new Map() },
    portfolioIds: new Set(),
    userIds: new Set(),
  };
  let destinationRead = false;
  const dryRunCanReadEmulator = mode === "dry-run" && !args.production && Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  if (mode === "apply" && args.production) {
    // Production path deliberately avoids initAdminForEmulator: the emulator
    // guard there would reject this flow, and the two destinations must stay
    // auditable separately. Credentials come from Application Default
    // Credentials; if they are absent the first SDK call below fails closed.
    const app = getApps()[0] ?? initializeApp({ projectId: args.destinationProject as string });
    db = getFirestore(app);
  } else if (mode === "apply") {
    try {
      assertEmulatorOnly();
    } catch (error) {
      fail(EXIT_BLOCKED, error instanceof Error ? error.message : String(error));
    }
    initAdminForEmulator(args.destinationProject ?? EMULATOR_PROJECT_ID);
    db = getAdminDb();
  } else if (dryRunCanReadEmulator) {
    initAdminForEmulator(args.destinationProject ?? EMULATOR_PROJECT_ID);
    db = getAdminDb();
  }

  if (db) {
    try {
      destination = await readDestination(db);
      destinationRead = true;
    } catch (error) {
      fail(
        EXIT_BLOCKED,
        `could not read destination Firestore (check credentials/connectivity): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ------------------------------------------------------------- checkpoint
  const existingPortfolios = new Set(destination.portfolioIds);
  const existingUsers = new Set(destination.userIds);
  let checkpoint: MigrationCheckpoint | null = null;
  if (mode === "apply") {
    checkpoint = loadCheckpoint(outDir, sourceSha256, mappingSha256); // digest mismatch → exit 2
    for (const key of completedDocKeys(checkpoint)) {
      // Resume: previously completed docs join the "existing" set so the
      // planner skips them and creates never run twice.
      if (key.startsWith("portfolios/")) existingPortfolios.add(key.slice("portfolios/".length));
      else if (key.startsWith("users/")) existingUsers.add(key.slice("users/".length));
    }
  }

  // -------------------------------------------------------------------- plan
  const input: ImportInput = {
    snapshots: extract.snapshots.map((row) => ({ supabaseUid: row.userId, snapshot: row.snapshot })),
    profiles: extract.profiles.map((row) => ({ supabaseUid: row.id, displayName: row.displayName })),
  };
  const plan = buildImportPlan(input, mapping, { portfolios: existingPortfolios, users: existingUsers });
  const planSha256 = sha256Text(stableStringify(plan.records));

  console.log(`Digests:\n  sourceSha256:  ${sourceSha256}\n  mappingSha256: ${mappingSha256}\n  planSha256:    ${planSha256}`);
  console.log(
    `Destination: ${targetKind}${destinationRead ? " (state read)" : " (not read; planned against empty destination)"}`,
  );
  console.log(`Plan summary: ${JSON.stringify(plan.summary)}`);
  for (const status of Object.keys(plan.summary)) {
    if (status === "total") continue;
    printPlanRecords(status, plan.records);
  }

  // -------------------------------------------------------- production approval
  if (productionApply) {
    if (!args.approvalFile || !existsSync(args.approvalFile)) {
      console.error("REFUSED: --approval-file is missing for a production apply. Nothing was written.");
      console.error(
        "Create the approval file (plain JSON) with exactly these fields:\n" +
          JSON.stringify(
            {
              destinationProjectId: args.destinationProject,
              sourceSha256,
              mappingSha256,
              planSha256,
              approvedBy: "<your name>",
              approvedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
      );
      fail(EXIT_BLOCKED, "production import refused: the approval file does not exist");
    }
    const reason = verifyProductionApproval(readFileSync(args.approvalFile, "utf8"), {
      destinationProjectId: args.destinationProject as string,
      sourceSha256,
      mappingSha256,
      planSha256,
    });
    if (reason) fail(EXIT_BLOCKED, `production import refused: ${reason}. Nothing was written.`);
  }

  // ----------------------------------------------------------------- dry run
  if (mode === "dry-run") {
    mkdirSync(outDir, { recursive: true });
    const generatedAt = new Date().toISOString();
    const planFile: MigrationPlanFile = { version: 1, generatedAt, sourceSha256, mappingSha256, planSha256, plan };
    const report: MigrationReport = {
      version: 1,
      generatedAt,
      source: { path: args.dump, sha256: sourceSha256 },
      mapping: { path: mappingPath, sha256: mappingSha256 },
      destination: { kind: targetKind, projectId: args.destinationProject ?? EMULATOR_PROJECT_ID },
      mode,
      counts: buildCounts(extract, plan),
      records: plan.records,
      validation,
    };
    writeFileSync(join(outDir, "plan.json"), JSON.stringify(planFile, null, 2), "utf8");
    writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
    const template = {
      version: 1,
      note: 'Fill firebaseUid per row; leave "" to skip. Contains source emails — never print or commit.',
      rows: mappingTemplateRows(extract.users),
    };
    writeFileSync(join(outDir, "mapping-template.json"), JSON.stringify(template, null, 2), "utf8");
    console.log(`Dry-run artifacts written under ${args.out}/: plan.json, report.json, mapping-template.json`);
    if (hasValidationIssues(validation)) {
      console.error("Dry run found validation issues (exit 1) — fill in the mapping and rerun.");
      process.exit(EXIT_VALIDATION);
    }
    process.exit(EXIT_OK);
  }

  // -------------------------------------------------------------------- apply
  if (db === null) fail(EXIT_BLOCKED, "destination connection was not initialized");
  if (hasValidationIssues(validation)) {
    // Refuse to write anything to Firestore; artifacts stay aggregate-only.
    mkdirSync(outDir, { recursive: true });
    const generatedAt = new Date().toISOString();
    const planFile: MigrationPlanFile = { version: 1, generatedAt, sourceSha256, mappingSha256, planSha256, plan };
    writeFileSync(join(outDir, "plan.json"), JSON.stringify(planFile, null, 2), "utf8");
    console.error("Apply refused: mapping validation failed (exit 1) — see the validation lines above.");
    process.exit(EXIT_VALIDATION);
  }

  const dbForApply = db;
  let applyResult: ApplyResult | null = null;
  try {
    applyResult = await applyImportPlan(dbForApply, plan, input, (record, outcome) => {
      if (!checkpoint) return;
      checkpoint = mergeCheckpoint(
        checkpoint,
        sourceSha256,
        mappingSha256,
        [{ collection: record.collection, docId: record.docId, ok: outcome.ok, reason: outcome.reason }],
      );
      writeCheckpointAtomic(outDir, checkpoint);
    });
  } catch (error) {
    fail(EXIT_BLOCKED, `apply aborted (checkpoint state is restartable): ${error instanceof Error ? error.message : String(error)}`);
  }
  const completedApply = applyResult as ApplyResult;

  console.log(
    `Apply complete (write target: ${targetKind}): created=${completedApply.created} failed=${completedApply.failed}`,
  );
  for (const failure of completedApply.failures) {
    console.log(`  failed ${failure.collection}/${failure.docId}: ${failure.reason}`);
  }

  // ------------------------------------------------------------ reconciliation
  let resolution: ReconciliationReport | null = null;
  try {
    const fresh = await readDestination(dbForApply);
    resolution = reconcile(extract, mapping, fresh.state);
  } catch (error) {
    fail(EXIT_BLOCKED, `could not re-read destination for reconciliation: ${error instanceof Error ? error.message : String(error)}`);
  }
  const reconciliation = resolution as ReconciliationReport;

  mkdirSync(outDir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const planFile: MigrationPlanFile = { version: 1, generatedAt, sourceSha256, mappingSha256, planSha256, plan };
  const report: MigrationReport = {
    version: 1,
    generatedAt,
    source: { path: args.dump, sha256: sourceSha256 },
    mapping: { path: mappingPath, sha256: mappingSha256 },
    destination: { kind: targetKind, projectId: args.destinationProject ?? EMULATOR_PROJECT_ID },
    mode,
    counts: buildCounts(extract, plan),
    records: plan.records,
    validation,
    apply: completedApply,
    reconciliation,
  };
  writeFileSync(join(outDir, "plan.json"), JSON.stringify(planFile, null, 2), "utf8");
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    join(outDir, "reconciliation.json"),
    JSON.stringify({ version: 1, generatedAt, reconciliation }, null, 2),
    "utf8",
  );

  console.log(
    `Reconciliation: ok=${reconciliation.ok} expectedDocs=${reconciliation.expectedDocs} presentDocs=${reconciliation.presentDocs} ` +
      `missing=${reconciliation.missing.length} unexpected=${reconciliation.unexpected.length} mismatches=${reconciliation.mismatches.length}`,
  );
  for (const entry of reconciliation.missing) console.log(`  missing ${entry}`);
  for (const entry of reconciliation.unexpected) console.log(`  unexpected ${entry}`);
  for (const entry of reconciliation.mismatches) {
    console.log(`  mismatch ${entry.collection}/${entry.docId} field=${entry.field}: ${entry.reason}`);
  }

  if (completedApply.failed > 0 || !reconciliation.ok) process.exit(EXIT_VALIDATION);
  process.exit(EXIT_OK);
};

void main().then(
  () => {},
  (error: unknown) => {
    if (error instanceof MigrationExit) {
      console.error(`ERROR: ${error.message}`);
      process.exit(error.code);
    }
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(EXIT_BLOCKED);
  },
);
