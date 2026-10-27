/**
 * Read-only parser for the Supabase `pg_dumpall` cluster dump
 * (db_cluster-*.backup.gz — plain SQL text, gzip-compressed).
 *
 * SAFETY CONTRACT:
 *  - the parser only ever produces AGGREGATE COUNTS and table-level error
 *    names — it has no code path that returns or logs a row, email, hash,
 *    token, or portfolio value;
 *  - the dump file is opened read-only and is never written, moved, or
 *    uploaded anywhere.
 */

export interface BackupCounts {
  /** Rows in auth.users. */
  users: number;
  /** auth.users rows whose email_confirmed_at is set. */
  confirmedUsers: number;
  /** Distinct auth.identities.user_id where provider = 'google'. */
  googleProviderUsers: number;
  /** Rows in public.portfolio_snapshots. */
  portfolioSnapshots: number;
  /** Rows in public.profiles. */
  profiles: number;
  /** Rows in public.eod_price_cache. */
  priceCacheRecords: number;
  /**
   * Table-level problems only (e.g. "unterminated COPY block for auth.users").
   * Never contains row data.
   */
  parseErrors: string[];
  /** Tables found in the dump but not counted (names only, e.g. auth.sessions). */
  otherTablesSeen: string[];
}

const TARGETS = {
  "auth.users": ["email_confirmed_at"],
  "auth.identities": ["provider", "user_id"],
  "public.portfolio_snapshots": [],
  "public.profiles": [],
  "public.eod_price_cache": [],
} as const;

type TargetKey = keyof typeof TARGETS;

const COPY_LINE = /^COPY\s+([A-Za-z_][\w]*\.[A-Za-z_][\w]*)\s*\((.*)\)\s+FROM stdin;\s*$/;
const TERMINATOR = "\\.";

const field = (row: string[], columns: string[], name: string): string | null => {
  const index = columns.indexOf(name);
  if (index === -1) return null;
  const value = row[index];
  return value === undefined || value === "\\N" ? null : value;
};

/**
 * Extracts a COPY block's rows. Returns the columns and rows for a target
 * table, or null when the line is not a COPY header. Malformed (unterminated)
 * blocks are recorded in `errors` by table name only.
 */
const scan = (
  sql: string,
  counts: BackupCounts,
): void => {
  const lines = sql.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const match = COPY_LINE.exec(line);

    if (!match) {
      // Section comment: "-- Data for Name: sessions; Type: TABLE DATA; Schema: auth"
      const section = /^-- Data for Name: ([A-Za-z_]+); Type: TABLE DATA; Schema: ([A-Za-z_]+)/.exec(line);
      if (section) {
        const qualified = `${section[2]}.${section[1]}`;
        if (!(qualified in TARGETS) && !counts.otherTablesSeen.includes(qualified)) {
          counts.otherTablesSeen.push(qualified);
        }
      }
      i += 1;
      continue;
    }

    const table = match[1] as TargetKey;
    const columns = match[2]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const isTarget = table in TARGETS;

    // Collect rows until the COPY terminator.
    const rows: string[] = [];
    let terminated = false;
    i += 1;
    while (i < lines.length) {
      if (lines[i] === TERMINATOR) {
        terminated = true;
        i += 1;
        break;
      }
      rows.push(lines[i]);
      i += 1;
    }

    if (!terminated) {
      counts.parseErrors.push(`unterminated COPY block for ${table}`);
      continue;
    }
    if (!isTarget) continue;

    switch (table) {
      case "auth.users": {
        counts.users += rows.length;
        for (const row of rows) {
          if (field(row.split("\t"), columns, "email_confirmed_at") !== null) {
            counts.confirmedUsers += 1;
          }
        }
        break;
      }
      case "auth.identities": {
        const googleUserIds = new Set<string>();
        for (const row of rows) {
          const cells = row.split("\t");
          if (field(cells, columns, "provider") === "google") {
            const userId = field(cells, columns, "user_id");
            if (userId) googleUserIds.add(userId);
          }
        }
        counts.googleProviderUsers += googleUserIds.size;
        break;
      }
      case "public.portfolio_snapshots":
        counts.portfolioSnapshots += rows.length;
        break;
      case "public.profiles":
        counts.profiles += rows.length;
        break;
      case "public.eod_price_cache":
        counts.priceCacheRecords += rows.length;
        break;
    }
  }
};

/** Parses a full dump (already decompressed SQL text) into aggregate counts. */
export const parseSupabaseDump = (sql: string): BackupCounts => {
  const counts: BackupCounts = {
    users: 0,
    confirmedUsers: 0,
    googleProviderUsers: 0,
    portfolioSnapshots: 0,
    profiles: 0,
    priceCacheRecords: 0,
    parseErrors: [],
    otherTablesSeen: [],
  };
  scan(sql, counts);
  return counts;
};
