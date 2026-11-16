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
  { pattern: /\b(watchlist|alerts?|journal|brokers?)\b.*\b(open|show|where|go)\b/, route: { tool: "navigate_to_section", args: { section: "watchlist" } } },
  { pattern: /\b(closed|sold|realised|realized)\b.*\b(trades?|positions?|p&l|profit)\b/, route: { tool: "get_holdings", args: { status: "closed", limit: 10 } } },
  { pattern: /\b(position|positions|holding|holdings|own|invested)\b/, route: { tool: "get_holdings", args: { status: "active", limit: 10 } } },
  { pattern: /\b(price|trading at|quote)\b/, route: { tool: "get_stock_price", args: {} } },
  { pattern: /\b(find|search|look ?up|resolve)\b/, route: { tool: "search_stock", args: {} } },
  { pattern: /\b(portfolio|profit|loss|p&l|worth|value|doing|performance)\b/, route: { tool: "get_portfolio_summary", args: {} } },
];

const NAV_SECTIONS: Array<{ pattern: RegExp; section: string }> = [
  { pattern: /\bwatchlist\b/, section: "watchlist" },
  { pattern: /\balerts?\b/, section: "alerts" },
  { pattern: /\bjournal\b/, section: "journal" },
  { pattern: /\bbrokers?\b/, section: "brokers" },
  { pattern: /\bexport\b/, section: "export" },
  { pattern: /\bcharts?\b/, section: "charts" },
  { pattern: /\bnews\b/, section: "news" },
];

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

  // "Open the journal" is a navigation request before it is anything else.
  if (/\b(open|go to|show me the|take me to)\b/.test(text)) {
    const target = NAV_SECTIONS.find((entry) => entry.pattern.test(text));
    if (target) {
      return runOne(ctx, "navigate_to_section", { section: target.section });
    }
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
