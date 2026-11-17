/**
 * Deterministic fallback (decision D5).
 *
 * When neither provider is configured, or both fail, the assistant must not
 * pretend to be an assistant and must not answer from memory. It routes a small
 * set of unambiguous, high-frequency questions to the same tools a model would
 * have called, and says plainly that no model answered.
 *
 * This is deliberately a keyword router, not a second language model: it is
 * testable, it cannot hallucinate, and it guarantees the read tools keep working
 * during a provider outage.
 */

import type { AssistantCard, AssistantToolTrace, AssistantChatMessage } from "../../../../src/lib/assistant/schemas.ts";
import { DASHBOARD_SECTION_IDS, type DashboardSectionId } from "../../../../src/lib/navigation/routes.ts";
import { executeToolDefinition } from "./tools/registry";
import type { ToolContext } from "./context";

export interface DegradedTurn {
  reply: string;
  cards: AssistantCard[];
  toolTrace: AssistantToolTrace[];
  toolCalls: number;
}

const DEGRADED_SUFFIX = " (Answered without AI: the language model is unavailable.)";

interface Route {
  tool: string;
  args: Record<string, unknown>;
}

/** Ordered: the first match wins, so the most specific patterns come first. */
const ROUTES: Array<{ pattern: RegExp; route: Route }> = [
  { pattern: /\b(market|nse|bse)\b.*\b(open|closed|status|session)\b|\b(open|closed)\b.*\b(market|nse)\b/, route: { tool: "get_market_status", args: {} } },
  { pattern: /\b(nifty|sensex|bank ?nifty|indices|index)\b/, route: { tool: "get_market_status", args: { includeIndices: true } } },
  { pattern: /\b(closed|sold|realised|realized)\b.*\b(trades?|positions?|p&l|profit)\b/, route: { tool: "get_holdings", args: { status: "closed", limit: 10 } } },
  { pattern: /\b(position|positions|holding|holdings|own|invested)\b/, route: { tool: "get_holdings", args: { status: "active", limit: 10 } } },
  { pattern: /\b(price|trading at|quote)\b/, route: { tool: "get_stock_price", args: {} } },
  { pattern: /\b(find|search|look ?up|resolve)\b/, route: { tool: "search_stock", args: {} } },
  { pattern: /\b(portfolio|profit|loss|p&l|worth|value|doing|performance)\b/, route: { tool: "get_portfolio_summary", args: {} } },
];

/**
 * Navigation aliases, keyed by the canonical section ids from routes.ts.
 * Using a Record keyed by DashboardSectionId makes the compiler reject any
 * missing section, so all 14 dashboard destinations must be covered.
 *
 * Aliases are whole words only. The four requested singular/plural pairs are
 * listed explicitly; the shared "es" misspellings (brokeres, alertes, chartes,
 * tradees) therefore cannot match through a permissive (?:s|es) suffix.
 */
const NAV_ALIASES: Record<DashboardSectionId, readonly string[]> = {
  overview: ["overview", "dashboard", "home"],
  holdings: ["portfolio holdings", "holdings", "positions"],
  trades: ["trade plans", "trades", "trade"],
  history: ["trade history", "history"],
  journal: ["trade journal", "journal"],
  charts: ["charts", "chart", "graph"],
  sector: ["sector allocation", "sectors", "sector"],
  analytics: ["trade analytics", "analytics", "performance", "analysis"],
  watchlist: ["watchlist"],
  news: ["news feed", "news"],
  ai: ["ai insights", "insights", "ai"],
  alerts: ["price alerts", "alerts", "alert"],
  export: ["export", "exports"],
  brokers: ["broker connections", "brokers", "broker"],
};

/** Explicit navigation verbs. Deliberately excludes bare "show" so that
 * "show my holdings" remains a data request rather than a navigation. The
 * captured group is the verb's object (at most three words): the section alias
 * must be the destination, not merely a word anywhere in the sentence. */
const NAV_REQUEST =
  /\b(?:open|go to|navigate to|take me to|show me the|where is|where are|where can i find|where do i find)\b(?:\s+(?:the|my|our|a|an))?\s+([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2})/i;

/** Data questions that must never be turned into navigation, however phrased. */
const DATA_OVERRIDES: readonly RegExp[] = [
  /\b(closed|sold|realised|realized)\b.*\b(trades?|positions?|p&l|profit)\b/i,
  /\b(portfolio|holdings?|positions?)\b.*\b(performance|worth|value|doing|profit|loss|p&l)\b/i,
  /\b(performance|worth|value|doing)\b.*\b(portfolio|holdings?|positions?)\b/i,
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface NavAliasEntry {
  section: DashboardSectionId;
  alias: string;
  pattern: RegExp;
}

/** Built from the canonical id list; longer aliases win when phrases overlap. */
const NAV_ALIAS_ENTRIES: NavAliasEntry[] = DASHBOARD_SECTION_IDS.flatMap((section) =>
  NAV_ALIASES[section].map((alias) => ({
    section,
    alias,
    pattern: new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i"),
  })),
).sort((a, b) => b.alias.length - a.alias.length);

/**
 * Resolve an explicit navigation request to a canonical dashboard section.
 * Returns null for unknown requests — there is intentionally no Watchlist
 * fallback.
 */
export function resolveNavigationSection(text: string): DashboardSectionId | null {
  // How-to questions are not navigation, even when they contain a nav verb and
  // a section alias (e.g. "how do I open a broker account").
  if (/\b(how do i|how can i|tutorial|guide)\b/i.test(text)) return null;
  if (DATA_OVERRIDES.some((pattern) => pattern.test(text))) return null;
  const object = NAV_REQUEST.exec(text)?.[1];
  if (!object) return null;
  const match = NAV_ALIAS_ENTRIES.find((entry) => entry.pattern.test(object));
  return match ? match.section : null;
}

const HELP_TEXT =
  "The AI service is unavailable, so I can only run simple lookups right now. Try \"how is my portfolio doing\", \"show my holdings\", \"is the market open\" or \"find Reliance\".";

/** Extracts a plausible ticker or company token for price/search routes. */
function subjectFrom(text: string): string | null {
  const stop = new Set([
    "price", "of", "the", "what", "whats", "is", "current", "quote", "for", "on", "at",
    "find", "search", "look", "up", "show", "me", "my", "stock", "share", "trading",
    "today", "now", "and", "please", "nse", "bse", "us", "market",
  ]);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !stop.has(token));
  const candidate = tokens[tokens.length - 1];
  return candidate ? candidate.toUpperCase() : null;
}

export async function runDeterministicFallback(
  ctx: ToolContext,
  messages: AssistantChatMessage[],
): Promise<DegradedTurn> {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const text = lastUser?.content.toLowerCase() ?? "";

  if (!text.trim()) {
    return { reply: HELP_TEXT, cards: [], toolTrace: [], toolCalls: 0 };
  }

  // Navigation is checked first, but only for explicit navigation phrases and
  // only when a canonical section alias is actually present.
  const section = resolveNavigationSection(text);
  if (section) {
    return runOne(ctx, "navigate_to_section", { section });
  }

  const match = ROUTES.find((entry) => entry.pattern.test(text));
  if (!match) {
    return { reply: HELP_TEXT, cards: [], toolTrace: [], toolCalls: 0 };
  }

  let args: Record<string, unknown> = { ...match.route.args };

  if (match.route.tool === "search_stock" || match.route.tool === "get_stock_price") {
    const subject = subjectFrom(text);
    if (!subject) {
      return {
        reply: `Tell me which stock, for example "price of RELIANCE".${DEGRADED_SUFFIX}`,
        cards: [],
        toolTrace: [],
        toolCalls: 0,
      };
    }
    args = match.route.tool === "search_stock" ? { query: subject } : { ticker: subject };
  }

  return runOne(ctx, match.route.tool, args);
}

/** Runs exactly one tool and turns its outcome into a factual reply. */
async function runOne(
  ctx: ToolContext,
  tool: string,
  args: Record<string, unknown>,
): Promise<DegradedTurn> {
  const startedAt = Date.now();
  const executed = await executeToolDefinition(ctx, tool, JSON.stringify(args));
  const durationMs = Date.now() - startedAt;

  const traceStatus: AssistantToolTrace["status"] =
    executed.status === "ok" ? "ok" : executed.status === "error" ? "error" : "skipped";
  const toolTrace: AssistantToolTrace[] = [{ name: tool, status: traceStatus, durationMs }];
  const { outcome } = executed;
  const cards: AssistantCard[] = outcome.status === "ok" && outcome.card ? [outcome.card] : [];

  if (outcome.status === "error") {
    return { reply: `${outcome.message}${DEGRADED_SUFFIX}`, cards, toolTrace, toolCalls: 1 };
  }

  return { reply: `${outcome.summary}${DEGRADED_SUFFIX}`, cards, toolTrace, toolCalls: 1 };
}
