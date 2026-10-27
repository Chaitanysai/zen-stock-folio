import { describe, expect, it } from "vitest";
import { activeUsers, parseBackupRows } from "./backupRows";

/**
 * Unit tests run against fully SYNTHETIC mini-dumps. Every uid, email, hash,
 * ticker, and snapshot value in this file is invented (example.test
 * addresses, sequential fixture uids) — nothing is derived from the real
 * backup.
 */

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const U3 = "33333333-3333-3333-3333-333333333333";
const U_GOOGLE = "44444444-4444-4444-4444-444444444444";

const USERS_HEADER = "COPY auth.users (id, email, encrypted_password, email_confirmed_at, deleted_at, is_anonymous) FROM stdin;";
const IDENTITIES_HEADER =
  "COPY auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id) FROM stdin;";
const SNAPSHOTS_HEADER = "COPY public.portfolio_snapshots (user_id, snapshot, updated_at) FROM stdin;";
const PROFILES_HEADER = "COPY public.profiles (id, display_name, updated_at) FROM stdin;";
const EOD_HEADER = "COPY public.eod_price_cache (ticker, price, week_high52, week_low52, change_percent, change, fetched_at, source) FROM stdin;";

const nulls = (values: Array<string | null>): string =>
  values.map((value) => (value === null ? "\\N" : value)).join("\t");

const userRow = (over: {
  id: string;
  email?: string | null;
  hash?: string | null;
  confirmed?: string | null;
  deleted?: string | null;
  anonymous?: string;
}): string => {
  // `undefined` means "use the default value"; explicit `null` means the
  // COPY NULL marker (\N).
  const pick = (value: string | null | undefined, fallback: string): string | null =>
    value === undefined ? fallback : value;
  return nulls([
    pick(over.id, ""),
    pick(over.email, "unused@example.test"),
    pick(over.hash, "$2a$10$syntheticpasswordhashvalue"),
    pick(over.confirmed, "2026-01-01 00:00:00+00"),
    pick(over.deleted, null),
    pick(over.anonymous, "f"),
  ]);
};

/** Doubles backslashes first, then escapes control chars — inverse of decodeField. */
const encodeCopyField = (text: string): string =>
  text.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");

const syntheticSnapshot = {
  stocks: [{ ticker: "SYNTH1", note: "line1\nline2", tabbed: "a\tb", path: "c\\d" }],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
};

const standardDump = [
  USERS_HEADER,
  userRow({ id: U1, email: "user-1@example.test", confirmed: "2026-01-01 00:00:00+00" }),
  userRow({ id: U2, email: "user-2@example.test", hash: null, confirmed: null }),
  userRow({ id: U_GOOGLE, email: "user-google@example.test", hash: null }),
  userRow({ id: U3, email: "user-3@example.test", deleted: "2026-02-01 00:00:00+00" }),
  "\\.",
  "",
  IDENTITIES_HEADER,
  `gid-1\t${U1}\t{}\tgoogle\t2026-01-01 00:00:00+00\t2026-01-01 00:00:00+00\t\\N\tidentity-1`,
  `gid-2\t${U1}\t{}\temail\t\\N\t2026-01-01 00:00:00+00\t\\N\tidentity-2`,
  `gid-3\t${U_GOOGLE}\t{}\tgoogle\t\\N\t2026-01-01 00:00:00+00\t\\N\tidentity-3`,
  "\\.",
  "",
  SNAPSHOTS_HEADER,
  `${U1}\t${encodeCopyField(JSON.stringify(syntheticSnapshot))}\t2026-01-04 00:00:00+00`,
  `${U2}\t${encodeCopyField(JSON.stringify({ stocks: [], trades: [], watchlist: [], alerts: [] }))}\t2026-01-04 00:00:00+00`,
  "\\.",
  "",
  PROFILES_HEADER,
  `${U1}\tFixture Alice\t2026-01-04 00:00:00+00`,
  `${U2}\t\\N\t2026-01-04 00:00:00+00`,
  "\\.",
  "",
  EOD_HEADER,
  "SYNTH\t100.0000\t150.0\t90.0\t1.5\t2.0\t2026-01-04 10:00:00+00\tsynthetic",
  "SYNTH2\t200.0000\t250.0\t190.0\t1.0\t3.0\t2026-01-04 10:00:00+00\tsynthetic",
  "\\.",
].join("\n");

describe("parseBackupRows (synthetic mini-dumps)", () => {
  it("parses normal rows, NULLs, google identities, and counts eod rows", () => {
    const extract = parseBackupRows(standardDump);

    expect(extract.users).toHaveLength(4);
    const byId = new Map(extract.users.map((user) => [user.id, user]));
    expect(byId.get(U1)?.email).toBe("user-1@example.test");
    expect(byId.get(U1)?.provider).toBe("google"); // google identity wins over the password
    expect(byId.get(U1)?.emailConfirmedAt).not.toBeNull();
    expect(byId.get(U2)?.provider).toBe("other"); // no password, no google identity
    expect(byId.get(U_GOOGLE)?.provider).toBe("google");
    expect(byId.get(U3)?.deletedAt).not.toBeNull();
    expect(byId.get(U3)?.isAnonymous).toBe(false);

    expect(extract.snapshots).toHaveLength(2);
    expect(extract.snapshots[0]?.malformed).toBe(false);
    expect(extract.snapshots[0]?.snapshot).toEqual(syntheticSnapshot);
    expect(extract.snapshots[0]?.updatedAt).toBe("2026-01-04 00:00:00+00");

    expect(extract.profiles).toHaveLength(2);
    expect(extract.profiles.find((p) => p.id === U2)?.displayName).toBeNull();

    expect(extract.eodCacheCount).toBe(2);
    expect(extract.warnings).toEqual([]);
  });

  it("decodes escaped tabs, newlines, and backslashes inside a JSON snapshot", () => {
    const extract = parseBackupRows(standardDump);
    const snapshot = extract.snapshots[0]?.snapshot as typeof syntheticSnapshot;
    // The COPY payload carries \\n / \\t / \\\\ — decoded: a JSON text whose
    // escapes yield real control characters and a real backslash.
    expect(snapshot.stocks[0]?.note).toBe("line1\nline2");
    expect(snapshot.stocks[0]?.tabbed).toBe("a\tb");
    expect(snapshot.stocks[0]?.path).toBe("c\\d");
  });

  it("handles an empty COPY block without error", () => {
    const dump = [USERS_HEADER, "\\.", SNAPSHOTS_HEADER, "\\.", PROFILES_HEADER, "\\."].join("\n");
    const extract = parseBackupRows(dump);

    expect(extract.users).toEqual([]);
    expect(extract.snapshots).toEqual([]);
    expect(extract.profiles).toEqual([]);
    expect(extract.eodCacheCount).toBe(0);
    expect(extract.warnings).toEqual([]);
  });

  it("warns on an unterminated COPY block and discards its rows", () => {
    const dump = [USERS_HEADER, userRow({ id: U1 }), userRow({ id: U2 })].join("\n"); // no "\\."
    const extract = parseBackupRows(dump);

    expect(extract.users).toEqual([]); // fail closed: torn dump rows never reach the importer
    expect(extract.warnings).toEqual(["unterminated COPY block for auth.users; its rows were discarded"]);
  });

  it("de-duplicates duplicate user ids, keeping the first occurrence", () => {
    const dump = [
      USERS_HEADER,
      userRow({ id: U1, email: "first@example.test" }),
      userRow({ id: U1, email: "second@example.test" }),
      "\\.",
    ].join("\n");
    const extract = parseBackupRows(dump);

    expect(extract.users).toHaveLength(1);
    expect(extract.users[0]?.email).toBe("first@example.test");
    expect(extract.warnings).toHaveLength(1);
    expect(extract.warnings[0]).toContain("duplicate user id");
  });

  it("flags a malformed JSON snapshot as malformed with a null snapshot", () => {
    const dump = [SNAPSHOTS_HEADER, `${U1}\tnot-json-at-all{\t2026-01-04 00:00:00+00`, "\\."].join("\n");
    const extract = parseBackupRows(dump);

    expect(extract.snapshots).toHaveLength(1);
    expect(extract.snapshots[0]?.malformed).toBe(true);
    expect(extract.snapshots[0]?.snapshot).toBeNull();
    expect(extract.warnings.some((w) => w.includes("JSON parse failed"))).toBe(true);
  });

  it("warns about snapshots for unknown user ids and keeps the row", () => {
    const orphan = "99999999-9999-9999-9999-999999999999";
    const dump = [
      USERS_HEADER,
      userRow({ id: U1 }),
      "\\.",
      SNAPSHOTS_HEADER,
      `${orphan}\t${encodeCopyField(JSON.stringify({ stocks: [], trades: [], watchlist: [], alerts: [] }))}\t\\N`,
      "\\.",
    ].join("\n");
    const extract = parseBackupRows(dump);

    expect(extract.snapshots).toHaveLength(1); // kept — validation/planner decide
    expect(extract.warnings.some((w) => w.includes("unknown user id"))).toBe(true);
  });

  it("never leaks row payload (emails, hashes, snapshot contents) into warnings", () => {
    // A dump engineered to produce several warnings at once.
    const orphan = "99999999-9999-9999-9999-999999999999";
    const dump = [
      USERS_HEADER,
      userRow({ id: U1, email: "user-1@example.test" }),
      userRow({ id: U1, email: "user-1-again@example.test" }), // duplicate
      userRow({ id: U2, hash: null }),
      "\\.",
      SNAPSHOTS_HEADER,
      `${U2}\tnot-json-at-all{\t\\N`, // malformed JSON
      `${orphan}\t${encodeCopyField(JSON.stringify({ stocks: [], trades: [], watchlist: [], alerts: [] }))}\t\\N`, // unknown user
      "\\.",
      PROFILES_HEADER,
      `${U1}\tFixture Alice\t\\N`, // profile is fine; its displayName must not leak
      "\\.",
    ].join("\n");
    const extract = parseBackupRows(dump);

    expect(extract.warnings.length).toBeGreaterThanOrEqual(3);
    const serialized = JSON.stringify(extract.warnings);
    expect(serialized).not.toContain("example.test");
    expect(serialized).not.toContain("$2a$");
    expect(serialized).not.toContain("Fixture");
    expect(serialized).not.toContain("SYNTH");
    expect(serialized).not.toContain("not-json");
  });

  it("activeUsers filters soft-deleted and anonymous users", () => {
    const dump = [
      USERS_HEADER,
      userRow({ id: U1 }),
      userRow({ id: U2, deleted: "2026-02-01 00:00:00+00" }),
      userRow({ id: U_GOOGLE, anonymous: "t" }),
      "\\.",
    ].join("\n");
    const extract = parseBackupRows(dump);

    expect(extract.users).toHaveLength(3);
    expect(activeUsers(extract.users).map((user) => user.id)).toEqual([U1]);
  });
});
