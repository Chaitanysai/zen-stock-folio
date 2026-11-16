/**
 * Read-only market and navigation tools.
 *
 * Ticker resolution is delegated to the same merged search service `/api/search`
 * uses (`searchSymbols`), which filters Yahoo's noisy results to the requested
 * market. The assistant never constructs a symbol from a company name — that is
 * how "Reliance" becomes the wrong listing.
 *
 * Freshness is carried through, not dropped: a quote card always states the
 * provider's `dataMode` and timestamp, so "EOD" can never be presented as live.
 */

import { resolveMarketOverview } from "../../../_lib/quotes";
import { getMarketStatus } from "../../../../../src/lib/market/marketStatus.ts";
import { searchSymbols } from "../../../../../src/lib/market-data/search.ts";
import { instrumentKey, normalizeSymbol } from "../../../../../src/lib/market-data/symbols.ts";
import { DASHBOARD_SECTION_LABELS, sectionPath } from "../../../../../src/lib/navigation/routes.ts";
import type {
  GetMarketStatusArgs,
  GetStockPriceArgs,
  NavigateToSectionArgs,
  SearchStockArgs,
  StockCandidate,
} from "../../../../../src/lib/assistant/schemas.ts";
import { sanitizeLabel } from "../guard";
import { loadQuotes, toolError, toolOk, type ToolContext, type ToolOutcome } from "../context";

const MAX_SEARCH_HITS = 8;
/** Marker note produced by the search service when the only source failed. */
const YAHOO_UNAVAILABLE_PREFIX = "Yahoo search unavailable";

/**
 * Resolve a company name or symbol to tradable instruments.
 */
export async function searchStock(ctx: ToolContext, args: SearchStockArgs): Promise<ToolOutcome> {
  const market = args.market ?? "NSE";
  const query = args.query.trim();

  const result = await searchSymbols(query, {
    instruments: null,
    twelveDataHits: null,
    allowYahoo: true,
    market,
    timeoutMs: 5000,
  });

  // "The only search source is down" is not "no such symbol". Saying so is the
  // difference between a user retrying and a user believing a stock is missing.
  const sourceFailed = result.hits.length === 0 && result.notes.some((note) => note.startsWith(YAHOO_UNAVAILABLE_PREFIX));
  if (sourceFailed) {
    return toolError("Symbol search is temporarily unavailable, so no ticker could be resolved.", true);
  }

  const hits: StockCandidate[] = result.hits.slice(0, MAX_SEARCH_HITS).map((hit) => ({
    symbol: sanitizeLabel(hit.symbol, 24).toUpperCase(),
    name: sanitizeLabel(hit.name, 160),
    exchange: sanitizeLabel(hit.exchange, 24),
    market: hit.market,
    isin: hit.isin ? sanitizeLabel(hit.isin, 20) : null,
    instrumentType: hit.instrumentType ? sanitizeLabel(hit.instrumentType, 24) : null,
  }));

  const data = {
    query,
    market,
    count: hits.length,
    hits,
    note: result.notes.length > 0 ? result.notes.join(" ") : null,
  };

  if (hits.length === 0) {
    return toolOk(
      `No ${market} listing matched "${query}". Do not guess a ticker.`,
      data,
      {
        kind: "stocks",
        title: `No match for “${sanitizeLabel(query, 40)}”`,
        hits: [],
        note: `No ${market} listing matched this search.`,
      },
    );
  }

  const summary =
    `Found ${hits.length} ${market} match${hits.length === 1 ? "" : "es"} for "${query}": ` +
    hits.map((hit) => `${hit.symbol} (${hit.name})`).join("; ") +
    (hits.length > 1 ? ". Ask which one before referring to a single instrument." : ".");

  return toolOk(summary, data, {
    kind: "stocks",
    title: `${hits.length} match${hits.length === 1 ? "" : "es"} for “${sanitizeLabel(query, 40)}”`,
    hits,
    note: hits.length > 1 ? "More than one listing matched — confirm which one you meant." : undefined,
  });
}

/**
 * Latest quote for one instrument.
 */
export async function getStockPrice(ctx: ToolContext, args: GetStockPriceArgs): Promise<ToolOutcome> {
  const market = args.market ?? "NSE";
  const ticker = normalizeSymbol(args.ticker, market);
  if (!ticker) {
    return toolError(`${sanitizeLabel(args.ticker, 24)} is not a valid ${market} symbol.`, false);
  }

  const instrument = { market, ticker } as const;
  const quoted = await loadQuotes(ctx, [instrument]);
  const envelope = quoted.quotes[instrumentKey(instrument)];
  const price = envelope?.quote?.price ?? null;

  if (!envelope || price === null) {
    return toolError(`No live price is available for ${market}:${ticker} right now.`, true);
  }

  const dataMode = envelope.dataMode;
  const changePercent = envelope.quote?.changePercent ?? null;
  const note =
    dataMode === "eod"
      ? "This price is the last session close, not a live quote."
      : dataMode === "delayed"
        ? "This price is delayed by the provider."
        : dataMode === "unknown"
          ? "The provider sent no timestamp, so this price cannot be labelled live."
          : undefined;

  return toolOk(
    `${market}:${ticker} is at ${price} (${dataMode}${changePercent === null ? "" : `, ${changePercent.toFixed(2)}% today`}).`,
    {
      ticker,
      market,
      currency: envelope.quote?.currency ?? (market === "US" ? "USD" : "INR"),
      price,
      changePercent,
      previousClose: envelope.quote?.previousClose ?? null,
      weekHigh52: envelope.quote?.weekHigh52 ?? null,
      weekLow52: envelope.quote?.weekLow52 ?? null,
      dataMode,
      stale: envelope.stale,
      asOf: envelope.exchangeTimestamp,
      provider: envelope.provider,
      unavailable: envelope.unavailable,
    },
    {
      kind: "quote",
      title: `${ticker} · ${market}`,
      ticker,
      market,
      currency: market === "US" ? "USD" : "INR",
      price,
      changePercent,
      weekHigh52: envelope.quote?.weekHigh52 ?? null,
      weekLow52: envelope.quote?.weekLow52 ?? null,
      asOf: envelope.exchangeTimestamp,
      dataMode,
      note,
    },
  );
}

/**
 * NSE session status plus, optionally, the index levels.
 *
 * The session clock is deterministic (`getMarketStatus`), so it is always
 * available; the indices need a provider call, which is why they are opt-in.
 */
export async function getMarketStatusTool(
  ctx: ToolContext,
  args: GetMarketStatusArgs,
): Promise<ToolOutcome> {
  const status = getMarketStatus(new Date(ctx.now));
  const warnings: string[] = [];

  let indices: Array<{ label: string; price: number | null; changePercent: number | null }> = [];
  if (args.includeIndices === true) {
    const overview = await resolveMarketOverview({ now: ctx.now });
    if (overview.status === "ok") {
      indices = overview.result.indices.map((index) => ({
        label: index.label,
        price: index.price,
        changePercent: index.changePercent,
      }));
      warnings.push(...overview.result.warnings);
    } else {
      warnings.push("Index levels are unavailable right now.");
    }
  }

  const note = warnings.length > 0 ? warnings.join(" ") : undefined;

  return toolOk(
    `NSE is ${status.label.toLowerCase()} (${status.istTime} IST). ${status.description}`.trim(),
    {
      phase: status.phase,
      isOpen: status.isOpen,
      label: status.label,
      istTime: status.istTime,
      istDate: status.istDate,
      description: status.description,
      holidayName: status.holidayName,
      sessionName: status.sessionName,
      indices,
      warnings,
    },
    {
      kind: "market",
      title: "NSE session",
      phase: status.phase,
      isOpen: status.isOpen,
      label: status.label,
      istTime: status.istTime,
      description: status.description,
      indices,
      note,
    },
  );
}

/**
 * A link to a dashboard section.
 *
 * Navigation is a UI action: the tool validates the section and returns a card
 * whose button is a router link. The model chooses a destination, never a URL.
 */
export async function navigateToSection(
  _ctx: ToolContext,
  args: NavigateToSectionArgs,
): Promise<ToolOutcome> {
  const section = args.section as keyof typeof DASHBOARD_SECTION_LABELS;
  const label = DASHBOARD_SECTION_LABELS[section];
  const path = sectionPath(section);

  return toolOk(
    `The ${label} section is at ${path}.`,
    { section, label, path },
    { kind: "navigation", title: "Open in dashboard", label, path },
  );
}
