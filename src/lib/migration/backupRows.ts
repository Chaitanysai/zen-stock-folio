/**
 * Row-level parser for the Supabase `pg_dumpall` cluster backup.
 *
 * Unlike parseSupabaseDump (aggregate counts only), this module keeps the
 * parsed rows in memory so the migration pipeline can plan and apply real
 * imports. The safety contract is unchanged:
 *  - rows are never logged or printed by this module (tests use synthetic
 *    dumps with example.test addresses only);
 *  - `warnings` never contain row payloads (emails, hashes, snapshot
 *    contents). They may contain source uids, which the rest of the
 *    pipeline (importPlan PlannedRecord.sourceUid) already surfaces as
 *    non-PII identifiers;
 *  - the dump text is never persisted, moved, or uploaded anywhere.
 *
 * COPY data format: tab-delimited, `\.` terminator line, NULL is `\N`.
 * Escapes (`\\`, `\n`, `\r`, `\t`, `\b`, `\f`) are decoded in one
 * left-to-right pass — a chained str.replace passes would corrupt `\\n`
 * (the COPY encoding of a JSON `\n` escape) by replacing the inner `\n`
 * first.
 */

import { parseSnapshot } from "../data/parseSnapshot";

export interface SupabaseUserRow {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  encryptedPassword: string | null;
  /** From auth.identities: any google identity wins; else email iff a password exists. */
  provider: "email" | "google" | "other";
  deletedAt: string | null;
  isAnonymous: boolean;
}

export interface SupabaseSnapshotRow {
  userId: string;
  /** Parsed jsonb payload; null when the JSON text does not parse (or is NULL). */
  snapshot: unknown;
  malformed: boolean;
  updatedAt: string | null;
}

export interface SupabaseProfileRow {
  id: string;
  displayName: string | null;
  updatedAt: string | null;
}

export interface BackupExtract {
  users: SupabaseUserRow[];
  snapshots: SupabaseSnapshotRow[];
  profiles: SupabaseProfileRow[];
  eodCacheCount: number;
  /**
   * Table-level problems only (never row payloads): unterminated COPY
   * blocks, duplicate/anonymous-adjacent structural issues, unmapped rows.
   */
  warnings: string[];
}

const COPY_LINE = /^COPY\s+([A-Za-z_][\w]*\.[A-Za-z_][\w]*)\s*\((.*)\)\s+FROM stdin;\s*$/;
const TERMINATOR = "\\.";
const NULL = "\\N";

const TARGET_TABLES = [
  "auth.users",
  "auth.identities",
  "public.portfolio_snapshots",
  "public.profiles",
  "public.eod_price_cache",
] as const;

type TargetTable = (typeof TARGET_TABLES)[number];

const isTargetTable = (name: string): name is TargetTable =>
  (TARGET_TABLES as readonly string[]).includes(name);

/** Raw (still escaped) COPY block; NULL markers and escapes not yet decoded. */
interface RawCopyBlock {
  table: TargetTable;
  columns: string[];
  rows: string[][];
}

const decodeField = (raw: string): string => {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    switch (next) {
      case "\\":
        out += "\\";
        i += 1;
        break;
      case "n":
        out += "\n";
        i += 1;
        break;
      case "r":
        out += "\r";
        i += 1;
        break;
      case "t":
        out += "\t";
        i += 1;
        break;
      case "b":
        out += "\b";
        i += 1;
        break;
      case "f":
        out += "\f";
        i += 1;
        break;
      default:
        // Lone or unknown backslash: keep it literally, never throw.
        out += ch;
        break;
    }
  }
  return out;
};

/** Splits the SQL into target-table COPY blocks. Row content stays raw here. */
const scanCopyBlocks = (sql: string, warnings: string[]): Array<RawCopyBlock> => {
  const blocks: Array<RawCopyBlock> = [];
  const lines = sql.split("\n");
  let i = 0;
  while (i < lines.length) {
    const match = COPY_LINE.exec(lines[i]);
    i += 1;
    if (!match) continue;
    const table = match[1];
    if (!isTargetTable(table)) continue;
    const columns = match[2]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const rows: string[][] = [];
    let terminated = false;
    while (i < lines.length) {
      const line = lines[i].replace(/\r$/, "");
      i += 1;
      if (line === TERMINATOR) {
        terminated = true;
        break;
      }
      rows.push(line.split("\t"));
    }
    if (!terminated) {
      // Fail closed: rows from a torn dump must never reach the importer.
      warnings.push(`unterminated COPY block for ${table}; its rows were discarded`);
      continue;
    }
    blocks.push({ table, columns, rows });
  }
  return blocks;
};

const requireColumn = (block: RawCopyBlock, name: string, warnings: string[]): number | null => {
  const index = block.columns.indexOf(name);
  if (index === -1) {
    warnings.push(`${block.table}: COPY header has no ${name} column; that value is treated as NULL`);
    return null;
  }
  return index;
};

const cellAt = (row: string[], index: number): string | null => {
  const raw = row[index];
  return raw === NULL ? null : decodeField(raw);
};

/** Column lookup that tolerates headers missing the column (schema drift). */
const cellAtOpt = (row: string[], index: number | null): string | null =>
  index === null ? null : cellAt(row, index);

/**
 * Parses a full dump (already decompressed SQL text) into typed rows.
 * Handles empty COPY blocks (0 rows) without error and de-duplicates
 * duplicate auth.users ids, keeping the first occurrence.
 */
export const parseBackupRows = (sql: string): BackupExtract => {
  const warnings: string[] = [];
  const blocks = scanCopyBlocks(sql, warnings);

  const blocksByTable: Record<TargetTable, Array<RawCopyBlock>> = {
    "auth.users": [],
    "auth.identities": [],
    "public.portfolio_snapshots": [],
    "public.profiles": [],
    "public.eod_price_cache": [],
  };
  for (const block of blocks) blocksByTable[block.table].push(block);

  let eodCacheCount = 0;
  for (const block of blocksByTable["public.eod_price_cache"]) {
    for (const row of block.rows) {
      if (row.length !== block.columns.length) {
        warnings.push(`${block.table}: row with ${row.length} cells (expected ${block.columns.length}) was ignored`);
        continue;
      }
      eodCacheCount += 1;
    }
  }

  // Identities first: provider detection for users needs the google set.
  const googleUserIds = new Set<string>();
  for (const block of blocksByTable["auth.identities"]) {
    const providerIdx = requireColumn(block, "provider", warnings);
    const userIdIdx = requireColumn(block, "user_id", warnings);
    if (providerIdx === null || userIdIdx === null) continue;
    for (const row of block.rows) {
      if (row.length !== block.columns.length) {
        warnings.push(`${block.table}: row with ${row.length} cells (expected ${block.columns.length}) was ignored`);
        continue;
      }
      if (cellAt(row, providerIdx) === "google") {
        const userId = cellAt(row, userIdIdx);
        if (userId) googleUserIds.add(userId);
      }
    }
  }

  const users: SupabaseUserRow[] = [];
  const seenUserIds = new Set<string>();
  for (const block of blocksByTable["auth.users"]) {
    const idIdx = requireColumn(block, "id", warnings);
    if (idIdx === null) continue; // cannot identify any row — fail closed
    const emailIdx = requireColumn(block, "email", warnings);
    const passwordIdx = requireColumn(block, "encrypted_password", warnings);
    const confirmedIdx = requireColumn(block, "email_confirmed_at", warnings);
    const deletedIdx = requireColumn(block, "deleted_at", warnings);
    const anonymousIdx = requireColumn(block, "is_anonymous", warnings);
    for (const row of block.rows) {
      if (row.length !== block.columns.length) {
        warnings.push(`${block.table}: row with ${row.length} cells (expected ${block.columns.length}) was ignored`);
        continue;
      }
      const id = cellAt(row, idIdx);
      if (!id) {
        warnings.push("auth.users: row without an id was ignored");
        continue;
      }
      if (seenUserIds.has(id)) {
        warnings.push(`auth.users: duplicate user id ${id}; keeping the first occurrence`);
        continue;
      }
      seenUserIds.add(id);
      const encryptedPassword = cellAtOpt(row, passwordIdx);
      users.push({
        id,
        email: cellAtOpt(row, emailIdx),
        emailConfirmedAt: cellAtOpt(row, confirmedIdx),
        encryptedPassword,
        provider: googleUserIds.has(id) ? "google" : encryptedPassword !== null ? "email" : "other",
        deletedAt: cellAtOpt(row, deletedIdx),
        isAnonymous: cellAtOpt(row, anonymousIdx) === "t",
      });
    }
  }

  const knownUserIds = new Set(users.map((u) => u.id));
  const snapshots: SupabaseSnapshotRow[] = [];
  for (const block of blocksByTable["public.portfolio_snapshots"]) {
    const userIdIdx = requireColumn(block, "user_id", warnings);
    if (userIdIdx === null) continue;
    const snapshotIdx = requireColumn(block, "snapshot", warnings);
    const updatedAtIdx = requireColumn(block, "updated_at", warnings);
    for (const row of block.rows) {
      if (row.length !== block.columns.length) {
        warnings.push(`${block.table}: row with ${row.length} cells (expected ${block.columns.length}) was ignored`);
        continue;
      }
      const userId = cellAt(row, userIdIdx);
      if (!userId) {
        warnings.push("public.portfolio_snapshots: row without a user_id was ignored");
        continue;
      }
      if (!knownUserIds.has(userId)) {
        warnings.push(`public.portfolio_snapshots: snapshot row for unknown user id ${userId}`);
      }
      const updatedAt = cellAtOpt(row, updatedAtIdx);
      const rawSnapshot = snapshotIdx === null ? null : cellAt(row, snapshotIdx);
      if (rawSnapshot === null) {
        snapshots.push({ userId, snapshot: null, malformed: true, updatedAt });
        warnings.push(`public.portfolio_snapshots: NULL or unreadable snapshot for user id ${userId}`);
        continue;
      }
      try {
        snapshots.push({ userId, snapshot: JSON.parse(rawSnapshot) as unknown, malformed: false, updatedAt });
      } catch {
        snapshots.push({ userId, snapshot: null, malformed: true, updatedAt });
        warnings.push(`public.portfolio_snapshots: JSON parse failed for user id ${userId}`);
      }
    }
  }

  const profiles: SupabaseProfileRow[] = [];
  for (const block of blocksByTable["public.profiles"]) {
    const idIdx = requireColumn(block, "id", warnings);
    if (idIdx === null) continue;
    const displayNameIdx = requireColumn(block, "display_name", warnings);
    const updatedAtIdx = requireColumn(block, "updated_at", warnings);
    for (const row of block.rows) {
      if (row.length !== block.columns.length) {
        warnings.push(`${block.table}: row with ${row.length} cells (expected ${block.columns.length}) was ignored`);
        continue;
      }
      const id = cellAt(row, idIdx);
      if (!id) {
        warnings.push("public.profiles: row without an id was ignored");
        continue;
      }
      if (!knownUserIds.has(id)) {
        warnings.push(`public.profiles: profile row for unknown user id ${id}`);
      }
      profiles.push({
        id,
        displayName: cellAtOpt(row, displayNameIdx),
        updatedAt: cellAtOpt(row, updatedAtIdx),
      });
    }
  }

  return { users, snapshots, profiles, eodCacheCount, warnings };
};

/**
 * Users eligible for migration (never deleted, never anonymous). Kept as a
 * helper because the extract itself deliberately retains deleted/anonymous
 * rows so validation and reporting can decide.
 */
export const activeUsers = (users: readonly SupabaseUserRow[]): SupabaseUserRow[] =>
  users.filter((u) => u.deletedAt === null && !u.isAnonymous);
