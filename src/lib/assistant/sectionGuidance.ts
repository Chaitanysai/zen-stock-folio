/**
 * Static, server-owned guidance for each dashboard section (B1).
 *
 * This map is complete by construction: adding a section id to the router
 * without adding guidance here is a compile error. Text is deliberately short
 * and mentions only capabilities that already exist in the read-only tool
 * registry — it is a screen hint, never a source of financial facts.
 */

import type { DashboardSectionId } from "../navigation/routes.ts";

export const SECTION_GUIDANCE: Record<DashboardSectionId, string> = {
  overview:
    "This is the Dashboard overview. Use the portfolio summary or market status tools for totals and session information.",
  holdings:
    "This is the Portfolio. Use the holdings tools for quantities, cost, current value and profit or loss.",
  trades:
    "This is the trades view. Holdings tools can describe open and closed positions; the assistant cannot add or edit trades.",
  history:
    "This is transaction history. Ask about the resulting holdings or trade outcomes; every figure comes from a portfolio tool.",
  journal:
    "This is the journal. The assistant has no journal tool and cannot write notes; it can only answer from portfolio and market data.",
  charts:
    "This is Charts. Use the stock search or price tools; the selected symbol on screen is a hint, not a price or a holding.",
  sector:
    "This is the sector breakdown. Use the portfolio summary or holdings tools to discuss exposure by sector.",
  analytics:
    "This is Performance analytics. Use the portfolio summary for totals and caveats; the assistant never computes a figure it did not retrieve.",
  watchlist:
    "This is the Watchlist. Name an instrument and use the search or price tools; watchlist contents are not sent to the assistant.",
  news:
    "This is the News Feed. The assistant has no news tool; ask about portfolio or market data that a tool can supply.",
  ai:
    "This is the assistant's own Insights area. Ask a question; all numbers come from the read-only application tools.",
  alerts:
    "This is Alerts. The assistant cannot create or change alerts; it can look up a current price with the price tool.",
  export:
    "This is Export. The assistant cannot produce files; ask about the figures behind your portfolio instead.",
  brokers:
    "This is Brokers. The assistant cannot connect, sync or disconnect a broker; it only reads data already available to the account.",
};
