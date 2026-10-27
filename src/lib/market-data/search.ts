/**
 * Merged symbol search.
 *
 * Two sources with different failure modes:
 *  - Upstox instrument master (when present): authoritative ISINs and names,
 *    no network call at query time, covers all 9,849 NSE equities.
 *  - Yahoo `v1/finance/search`: live, but noisy (verified: returns NYSE/NYQ
 *    listings, and ranks `INFY`'s ADR above the NSE line) → filtered to NSI.
 *  - Twelve Data directory: reference-only fallback with unusable ISINs.
 *
 * Results are deduped by symbol, preferring the source that supplies a real ISIN.
 */

import type { SearchHit, SearchResponse } from "./types.ts";
import { searchInstruments, type InstrumentIndex } from "./instruments.ts";
import { fetchYahooSearch } from "./yahoo.ts";
import { searchTwelveDataHits } from "./twelvedata.ts";

export interface SearchSources {
  /** Upstox master, when already loaded. */
  instruments?: InstrumentIndex | null;
  /** Twelve Data directory hits, when already cached by the server. */
  twelveDataHits?: SearchHit[] | null;
  /** Allow the live Yahoo call. Disabled in tests. */
  allowYahoo?: boolean;
  timeoutMs?: number;
}

const MAX_QUERY_LENGTH = 40;

/**
 * Resolve a query against every available source, best-effort.
 *
 * A source failing never fails the request: it is reported in `notes` so the UI
 * can say "search is partial" instead of silently pretending completeness.
 */
export async function searchSymbols(
  rawQuery: string,
  sources: SearchSources = {},
): Promise<SearchResponse> {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);
  const notes: string[] = [];
  const fetchedAt = new Date().toISOString();

  if (!query) {
    return { query, hits: [], provider: "mixed", fetchedAt, notes: ["Empty query."] };
  }

  const merged = new Map<string, SearchHit>();
  // Providers that RETURNED HITS, used to label the response.
  const providers = new Set<string>();
  // Providers that ANSWERED AT ALL, which is a different question: a source can
  // answer successfully and have no match, and claiming that "no source
  // answered" in that case is a false statement about the backend.
  let answeredSources = 0;

  const add = (hit: SearchHit) => {
    const existing = merged.get(hit.symbol);
    if (!existing) {
      merged.set(hit.symbol, hit);
      providers.add(hit.provider);
      return;
    }
    // Prefer a hit that carries a real ISIN; otherwise keep the first.
    if (!existing.isin && hit.isin) merged.set(hit.symbol, { ...hit, name: existing.name || hit.name });
  };

  const master = sources.instruments;
  if (master && master.equityBySymbol.size > 0) {
    answeredSources += 1;
    for (const row of searchInstruments(master, query, 10)) {
      add({
        symbol: row.symbol,
        name: row.name,
        exchange: "NSE",
        // The provider's own series, mapped — never a blanket "EQUITY".
        instrumentType: row.instrumentType,
        sector: null,
        isin: row.isin,
        provider: "upstox",
      });
    }
  }

  if (sources.twelveDataHits && sources.twelveDataHits.length > 0) {
    answeredSources += 1;
    for (const hit of searchTwelveDataHits(sources.twelveDataHits, query, 10)) add(hit);
  }

  if (sources.allowYahoo !== false) {
    try {
      const rows = await fetchYahooSearch(query, sources.timeoutMs ?? 5000);
      answeredSources += 1;
      for (const row of rows) {
        add({
          symbol: row.symbol,
          name: row.name,
          exchange: "NSE",
          instrumentType: row.quoteType,
          sector: row.sector,
          isin: null,
          provider: "yahoo",
        });
      }
      if (rows.length === 0) notes.push("Yahoo returned no NSE listing for this query.");
    } catch (error) {
      notes.push(
        `Yahoo search unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  if (merged.size === 0) notes.push("No NSE symbol matched this query.");
  if (answeredSources === 0) notes.push("No search source answered.");

  const hits = [...merged.values()].sort((a, b) => {
    const aExact = a.symbol === query.toUpperCase() ? 0 : 1;
    const bExact = b.symbol === query.toUpperCase() ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    const aPrefix = a.symbol.startsWith(query.toUpperCase()) ? 0 : 1;
    const bPrefix = b.symbol.startsWith(query.toUpperCase()) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.symbol.localeCompare(b.symbol);
  });

  return {
    query,
    hits: hits.slice(0, 12),
    provider: providers.size === 1 ? ([...providers][0] as SearchResponse["provider"]) : "mixed",
    fetchedAt,
    notes,
  };
}
