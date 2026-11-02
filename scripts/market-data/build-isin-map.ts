/**
 * Generates src/lib/market-data/nseIsinMap.json from the Upstox NSE master.
 *
 * The full master (~40 MB expanded) cannot be loaded in the browser or in a
 * Workers isolate (verified constraint documented in functions/api/search.ts),
 * so statement imports resolve ISIN/name → symbol against this slim
 * equity-only artifact instead.
 *
 * Run: npx vite-node scripts/market-data/build-isin-map.ts
 */

import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const OUT_FILE = new URL("../../src/lib/market-data/nseIsinMap.json", import.meta.url);

interface RawRecord {
  segment?: string;
  instrument_key?: string;
  isin?: string;
  name?: string;
  short_name?: string;
  trading_symbol?: string;
  instrument_type?: string;
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

async function main(): Promise<void> {
  const gzPath = process.argv[2];
  const raw: RawRecord[] = gzPath
    ? JSON.parse(gunzipSync(readFileSync(gzPath)).toString("utf8"))
    : JSON.parse(
        gunzipSync(
          new Uint8Array(await (await fetch(MASTER_URL)).arrayBuffer()),
        ).toString("utf8"),
      );

  const byIsin = new Map<string, { s: string; n: string; t: string }>();
  let skipped = 0;

  for (const record of raw) {
    if (record.segment !== "NSE_EQ") continue;
    const symbol = (record.trading_symbol ?? "").trim().toUpperCase();
    const isin = (record.isin ?? "").trim().toUpperCase();
    if (!symbol || !ISIN_RE.test(isin)) {
      skipped += 1;
      continue;
    }
    const name = (record.name ?? record.short_name ?? "").trim();
    // EQ-series rows are the tradeable share; later duplicate ISINs (BE/BZ
    // surveillance series) must not replace the primary listing.
    const series = (record.instrument_type ?? "").trim().toUpperCase();
    const existing = byIsin.get(isin);
    if (existing && existing.t === "EQ") continue;
    byIsin.set(isin, { s: symbol, n: name, t: series });
  }

  const equities = [...byIsin.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([isin, row]) => [row.s, isin, row.n] as [string, string, string]);

  const artifact = {
    source: MASTER_URL,
    generatedAt: new Date().toISOString(),
    equities,
  };
  writeFileSync(OUT_FILE, JSON.stringify(artifact));

  console.log(
    `nseIsinMap.json written: ${equities.length} ISINs, ${skipped} records skipped (no symbol/ISIN or non-EQ duplicate)`,
  );
}

void main();
