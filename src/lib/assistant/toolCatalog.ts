/**
 * The tools that actually exist today.
 *
 * Deliberately NOT the full 44-tool roadmap: the assistant must never expose a
 * capability it cannot perform, and the model must never be told about one.
 * The server registry attaches an implementation and argument schema to each
 * name here, and a test fails if the two lists disagree in either direction —
 * so "registered" and "implemented" cannot drift apart.
 *
 * Every entry is read-only. Write tools arrive in Phase 2 with confirmation and
 * compare-and-set protection (see docs/assistant/phase-0-…, §12 D7).
 */

import type { DashboardSectionId } from "../navigation/routes.ts";

export type AssistantToolRisk = "read" | "write" | "high_impact";

export type AssistantToolDomain = "portfolio" | "trades" | "market" | "dashboard";

export interface AssistantToolInfo {
  name: string;
  domain: AssistantToolDomain;
  risk: AssistantToolRisk;
  /** Shown to the user; the model gets its own copy from the registry. */
  description: string;
}

export const ASSISTANT_TOOLS: readonly AssistantToolInfo[] = [
  {
    name: "get_portfolio_summary",
    domain: "portfolio",
    risk: "read",
    description: "Portfolio totals: invested, current value, unrealised and realised P&L.",
  },
  {
    name: "get_holdings",
    domain: "portfolio",
    risk: "read",
    description: "List positions with quantity, average cost, price and P&L.",
  },
  {
    name: "get_holding_details",
    domain: "portfolio",
    risk: "read",
    description: "Details for one held ticker, including every lot.",
  },
  {
    name: "search_stock",
    domain: "trades",
    risk: "read",
    description: "Resolve a company name or symbol to tradable instruments.",
  },
  {
    name: "get_stock_price",
    domain: "market",
    risk: "read",
    description: "Latest quote for one instrument, with freshness.",
  },
  {
    name: "get_market_status",
    domain: "market",
    risk: "read",
    description: "NSE session status, IST clock and optionally the index levels.",
  },
  {
    name: "navigate_to_section",
    domain: "dashboard",
    risk: "read",
    description: "Give the user a link to a dashboard section.",
  },
] as const;

export const ASSISTANT_TOOL_NAMES = ASSISTANT_TOOLS.map((tool) => tool.name);

export const isAssistantToolName = (value: string): boolean =>
  ASSISTANT_TOOLS.some((tool) => tool.name === value);

/**
 * Suggested openers. Kept next to the catalog so every prompt is answerable by
 * a tool that exists (a prompt that needs a write would be a broken promise).
 */
export const ASSISTANT_SUGGESTIONS: readonly string[] = [
  "How is my portfolio doing today?",
  "Show my holdings and P&L",
  "What's my biggest position?",
  "Is the market open right now?",
  "Find Reliance on NSE",
  "What are my closed trades worth?",
] as const;

/**
 * Per-section openers (B1.2). Every entry is answerable by a tool in the
 * catalog above — a screen-specific prompt that needs a write would be a
 * broken promise. The map is complete by construction.
 */
export const SECTION_SUGGESTIONS: Record<DashboardSectionId, readonly string[]> = {
  overview: ["How is my portfolio doing today?", "Is the market open right now?"],
  holdings: ["Show my holdings and P&L", "What's my biggest position?"],
  trades: ["What are my closed trades worth?", "Show my active positions"],
  history: ["What are my closed trades worth?", "How is my portfolio doing today?"],
  journal: ["How is my portfolio doing today?", "Show my holdings and P&L"],
  charts: ["Find Reliance on NSE", "What is the price of TCS?"],
  sector: ["Show my holdings and P&L", "What's my biggest position?"],
  analytics: ["How is my portfolio doing today?", "What are my closed trades worth?"],
  watchlist: ["Find Reliance on NSE", "What is the price of TCS?"],
  news: ["Is the market open right now?", "How is my portfolio doing today?"],
  ai: ["How is my portfolio doing today?", "Show my holdings and P&L"],
  alerts: ["What is the price of TCS?", "Is the market open right now?"],
  export: ["How is my portfolio doing today?", "Show my holdings and P&L"],
  brokers: ["How is my portfolio doing today?", "Is the market open right now?"],
};

export function suggestionsForSection(section?: DashboardSectionId | null): readonly string[] {
  return section ? SECTION_SUGGESTIONS[section] : ASSISTANT_SUGGESTIONS;
}
