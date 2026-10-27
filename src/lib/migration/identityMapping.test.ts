import { describe, expect, it } from "vitest";
import {
  applyMappingEdits,
  hasValidationIssues,
  mappingTemplateRows,
  validateMapping,
} from "./identityMapping";
import { parseBackupRows } from "./backupRows";
import type { SupabaseUserRow } from "./backupRows";

/**
 * Fully synthetic fixtures — every uid and email invented; nothing derived
 * from the real backup.
 */

const SA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SC = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const FB_OK = "Alphanumeric789012345"; // valid: alphanumeric, 21 chars
const FB_OK_2 = "Alphanumeric987654321";

const user = (id: string, over: Partial<SupabaseUserRow> = {}): SupabaseUserRow => ({
  id,
  email: `${id.slice(0, 1)}@example.test`,
  emailConfirmedAt: "2026-01-01 00:00:00+00",
  encryptedPassword: "$2a$10$syntheticpasswordhashvalue",
  provider: "email",
  deletedAt: null,
  isAnonymous: false,
  ...over,
});

describe("validateMapping", () => {
  it("counts mapped entries and reports missing/unknown/duplicate/empty/invalid", () => {
    const sourceUids = [SA, SB, SC];
    const typoKey = SC.slice(0, 8); // operator typo: truncated source uid
    const validation = validateMapping(
      {
        [SA]: FB_OK,
        [SB]: FB_OK, // duplicate target
        [SC]: "", // empty target
        "dddddddd-dddd-dddd-dddd-dddddddddddd": FB_OK_2, // unknown source
        [typoKey]: "short", // unknown source with an invalid (too short) target
      },
      sourceUids,
    );

    expect(validation.mapped).toBe(2); // SA and SB have non-empty targets (SB's is a duplicate, reported separately)
    expect(validation.missingSourceUids).toEqual([SC]); // SC's target is blank → also in emptyTargets
    expect(validation.emptyTargets).toEqual([SC]);
    expect(validation.unknownSourceUids.sort()).toEqual([typoKey, "dddddddd-dddd-dddd-dddd-dddddddddddd"]);
    expect(validation.duplicateTargets).toEqual([{ firebaseUid: FB_OK, sourceUids: [SA, SB] }]);
    expect(validation.invalidTargets).toEqual([
      { firebaseUid: "short", reason: "shorter than 6 characters" },
    ]);
    expect(hasValidationIssues(validation)).toBe(true);
  });

  it("reports invalid targets for non-alphanumeric characters and length bounds", () => {
    const validation = validateMapping(
      {
        [SA]: "has-dash", // - not allowed
        [SB]: "a".repeat(129), // too long
        [SC]: "b".repeat(6), // boundary: valid
      },
      [SA, SB, SC],
    );

    expect(validation.invalidTargets).toEqual([
      { firebaseUid: "has-dash", reason: "contains characters outside A-Za-z0-9" },
      { firebaseUid: "a".repeat(129), reason: "longer than 128 characters" },
    ]);
    expect(validation.invalidTargets.find((entry) => entry.firebaseUid === "b".repeat(6))).toBeUndefined();
    expect(validation.duplicateTargets).toEqual([]);
  });

  it("passes cleanly for a complete unique valid mapping", () => {
    const validation = validateMapping({ [SA]: FB_OK, [SB]: FB_OK_2 }, [SA, SB]);
    expect(validation).toMatchObject({
      mapped: 2,
      missingSourceUids: [],
      unknownSourceUids: [],
      duplicateTargets: [],
      emptyTargets: [],
      invalidTargets: [],
    });
    expect(hasValidationIssues(validation)).toBe(false);
  });
});

describe("mappingTemplateRows", () => {
  it("lists every user with a blank targets column", () => {
    const rows = mappingTemplateRows([
      user(SA, { email: "a@example.test" }),
      user(SB, { email: null, deletedAt: "2026-02-01 00:00:00+00", provider: "google" }),
    ]);

    expect(rows).toEqual([
      { supabaseUid: SA, email: "a@example.test", provider: "email", deleted: false, firebaseUid: "" },
      { supabaseUid: SB, email: null, provider: "google", deleted: true, firebaseUid: "" },
    ]);
  });
});

describe("applyMappingEdits", () => {
  const template = mappingTemplateRows([user(SA), user(SB)]);

  it("applies non-blank edits and drops blanks", () => {
    const mapping = applyMappingEdits(template, { [SA]: `  ${FB_OK}  `, [SB]: "" });
    expect(mapping).toEqual({ [SA]: FB_OK });
  });

  it("throws for edits referencing uids that are not in the template", () => {
    expect(() => applyMappingEdits(template, { [SC]: FB_OK })).toThrow(/not in the template/);
  });
});

describe("validateMapping against a parsed backup extract", () => {
  it("wires up end-to-end with parseBackupRows output", () => {
    // Keep the parseSupabaseDump module untouched — this uses backupRows.
    const dump = [
      "COPY auth.users (id, email, encrypted_password, deleted_at, is_anonymous) FROM stdin;",
      `${SA}\ta@example.test\t$2a$10$hash\t\\N\tf`,
      `${SB}\tb@example.test\t$2a$10$hash\t2026-02-01 00:00:00+00\tf`,
      "\\.",
    ].join("\n");
    const extract = parseBackupRows(dump);
    const validation = validateMapping({ [SA]: FB_OK }, extract.users.map((u) => u.id));

    expect(validation.mapped).toBe(1);
    expect(validation.missingSourceUids).toEqual([SB]); // deleted user still counts for validation
  });
});
