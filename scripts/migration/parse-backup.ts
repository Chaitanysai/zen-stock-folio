/**
 * Read-only Supabase backup parser — aggregate counts only.
 *
 * Usage: npm run migration:parse-backup
 * (or: npx vite-node scripts/migration/parse-backup.ts [path-to-dump.gz])
 *
 * The dump file is opened read-only; nothing is written, uploaded, or
 * modified, and no row, email, hash, or portfolio value is ever printed.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { parseSupabaseDump } from "../../src/lib/migration/parseSupabaseDump";

const defaultPath = join(process.cwd(), "db_cluster-21-10-2026@15-06-23.backup.gz");
const dumpPath = process.argv[2] ?? defaultPath;

const raw = readFileSync(dumpPath);
const sql = gunzipSync(raw).toString("utf8");

const counts = parseSupabaseDump(sql);

console.log(`Backup parsed (read-only): ${dumpPath}`);
console.log(`Uncompressed size: ${sql.length} bytes`);
console.log(JSON.stringify(counts, null, 2));
