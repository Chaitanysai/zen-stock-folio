/**
 * Twelve Data adapter — reference/search data only.
 *
 * Verified 2026-10-27:
 *   GET /stocks?exchange=NSE&country=India  → 200, 3,819 rows, ~1.0 MB, ~1.7 s
 *   GET /quote, /time_series                → 401 (an API key is mandatory)
 *   A row's `isin` is the literal placeholder "request_access_via_add_ons".
 *
 * Consequences:
 *  - This is a symbol directory, NOT a price source. Nothing here is a quote.
 *  - `?exchange=NSE` must always be pinned: `?symbol=INFY` alone returns the
 *    NYSE ADR as well.
 *  - The placeholder ISIN is reported as `null`, never as a real identifier.
 */

import type { SearchHit } from "./types.ts";

const BASE = "https://api.twelvedata.com";

/** Values Twelve Data uses as placeholders instead of real identifiers. */
const ISIN_PLACEHOLDERS: Record<string, true> = {
  request_access_via_add_ons: true,
  request_access_via_addons: true,
  "": true,
};

export interface TwelveDataRow {
  symbol?: string;
  name?: string;
  currency?: string;
  exchange?: string;
  mic_code?: string;
  country?: string;
  type?: string;
  isin?: string;
}

function normalizeIsin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (ISIN_PLACEHOLDERS[trimmed]) return null;
  // A real ISIN is exactly 12 alphanumerics.
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase()
    : null;
}

/**
 * Fetch the NSE symbol directory. The response is ~1 MB, so callers MUST cache
 * it (the health centre reports the row count) and MUST NOT call this per
 * keystroke.
 */
export async function fetchTwelveDataNseDirectory(timeoutMs = 10_000): Promise<TwelveDataRow[]> {
  const url = `${BASE}/stocks?exchange=NSE&country=India`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Twelve Data directory responded ${response.status}`);
  }
  const body = (await response.json()) as { data?: TwelveDataRow[]; status?: string; message?: string };
  if (body.status === "error") {
    throw new Error(`Twelve Data error: ${body.message ?? "unknown"}`);
  }
  return Array.isArray(body.data) ? body.data : [];
}

/**
 * Twelve Data's NSE directory is not a pure NSE-mainboard list. It carries
 * series suffixes that belong to other segments:
 *   `.SM` (580 rows) — NSE SME platform, a separate board
 *   `.BL` (113 rows) — BSE listings
 *   `.IV`, `.TL`, `.RR`, … — provider-specific series
 * None of these resolve through the quote path, which only accepts a bare NSE
 * symbol (see `normalizeSymbol`). Offering them would produce a hit the user
 * can select and then never get a price for, so they are dropped here. A dot is
 * the discriminator: real NSE mainboard symbols use `&-` but never `.`.
 */
const NSE_MAINBOARD_RE = /^[A-Z0-9][A-Z0-9&-]{0,19}$/;

/**
 * Map directory rows to search hits, keeping only NSE mainboard listings.
 *
 * `exchange` is echoed verbatim from the provider rather than assumed: a row
 * whose exchange is not the pinned NSE value must never be presented as NSE.
 */
export function twelveDataRowsToHits(rows: TwelveDataRow[]): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const symbol = (row.symbol ?? "").trim().toUpperCase();
    if (!symbol || row.exchange !== "NSE") continue;
    if (!NSE_MAINBOARD_RE.test(symbol)) continue;
    hits.push({
      symbol,
      name: row.name ?? symbol,
      exchange: "NSE",
      instrumentType: row.type ?? null,
      sector: null,
      isin: normalizeIsin(row.isin),
      provider: "twelvedata",
    });
  }
  return hits;
}

/**
 * Filter a directory to a query. Substring on symbol and name, prefix-first.
 * Pure, so the server can cache the directory once and search it cheaply.
 */
export function searchTwelveDataHits(hits: SearchHit[], query: string, limit = 10): SearchHit[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const scored: Array<{ hit: SearchHit; score: number }> = [];
  for (const hit of hits) {
    const name = hit.name.toUpperCase();
    let score = -1;
    if (hit.symbol === q) score = 100;
    else if (hit.symbol.startsWith(q)) score = 80 - Math.min(hit.symbol.length - q.length, 20);
    else if (name.startsWith(q)) score = 60;
    else if (name.includes(q)) score = 40;
    else if (hit.symbol.includes(q)) score = 20;
    if (score < 0) continue;
    scored.push({ hit, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.symbol.localeCompare(b.hit.symbol));
  return scored.slice(0, limit).map((entry) => entry.hit);
}
