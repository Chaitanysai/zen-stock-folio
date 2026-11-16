/**
 * The tool registry: the ONLY way model output reaches application code.
 *
 * Properties this file is responsible for:
 *
 *  1. **Closed allowlist.** A name not in `TOOL_DEFINITIONS` does not exist, so
 *     there is nothing for a prompt to talk the model into calling.
 *  2. **No identity, no paths.** No argument schema contains a user id, a uid, a
 *     collection, a document path, a URL or a query. The caller's identity is
 *     supplied by `ToolContext` from the verified token. A test asserts this.
 *  3. **Validated arguments.** Everything the model emits is parsed as JSON and
 *     then parsed by a zod schema before use; a failure returns an error result
 *     the model must report, never a partially-applied call.
 *  4. **Parity with the catalog.** `ASSISTANT_TOOL_NAMES` (what the UI advertises)
 *     and this registry (what can actually run) must match exactly; the chat
 *     route refuses to serve otherwise.
 */

import { z } from "zod";
import { getHoldingsArgsSchema, getHoldingDetailsArgsSchema, getMarketStatusArgsSchema, getPortfolioSummaryArgsSchema, getStockPriceArgsSchema, navigateToSectionArgsSchema, searchStockArgsSchema } from "../../../../../src/lib/assistant/schemas.ts";
import { ASSISTANT_TOOL_NAMES } from "../../../../../src/lib/assistant/toolCatalog.ts";
import { DASHBOARD_SECTION_IDS } from "../../../../../src/lib/navigation/routes.ts";
import type { ToolSpec } from "../provider";
import type { ToolContext, ToolOutcome } from "../context";
import { getHoldingDetails, getHoldings, getPortfolioSummary } from "./portfolio";
import { getMarketStatusTool, getStockPrice, navigateToSection, searchStock } from "./market";

export interface JsonObjectSchema {
  /** Index signature so a tool schema is directly assignable to the provider's
   * `parameters: Record<string, unknown>` without a cast. */
  [key: string]: unknown;
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  /** Read by the model. Behavioural rules belong here as much as in the prompt. */
  description: string;
  args: z.ZodTypeAny;
  jsonSchema: JsonObjectSchema;
  run: (ctx: ToolContext, args: unknown) => Promise<ToolOutcome>;
}

const noArgs: JsonObjectSchema = { type: "object", properties: {}, additionalProperties: false };

const marketProperty = { type: "string", enum: ["NSE", "US"], description: "Listing market. Defaults to NSE." };

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "get_portfolio_summary",
    description:
      "Portfolio totals for the signed-in user: current value, invested amount, unrealised and realised P&L in INR, and position counts. Use for any question about the portfolio as a whole (\"how am I doing\", \"what is my profit\"). Returns `unpricedCount`, `unknownCostCount` and `usdExcluded` when part of the portfolio could not be valued — say so instead of implying a complete total.",
    args: getPortfolioSummaryArgsSchema,
    jsonSchema: noArgs,
    run: (ctx) => getPortfolioSummary(ctx),
  },
  {
    name: "get_holdings",
    description:
      "List the user's positions with quantity, average cost, current price and P&L. Use for \"show my holdings\", \"my positions\", \"what do I own\". Defaults to open positions sorted by value, largest first. `status` selects open, closed or all; `limit` caps the list (default 10, max 50).",
    args: getHoldingsArgsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "closed", "all"],
          description: "Which positions to list. Defaults to active.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Maximum rows to return. Defaults to 10.",
        },
      },
      additionalProperties: false,
    },
    run: (ctx, args) => getHoldings(ctx, args as z.infer<typeof getHoldingsArgsSchema>),
  },
  {
    name: "get_holding_details",
    description:
      "Details for one ticker the user holds, including every lot when the same symbol appears more than once. Use for \"tell me about my Reliance position\". The ticker must match a position; this does not fetch arbitrary market data — use search_stock or get_stock_price for that.",
    args: getHoldingDetailsArgsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Trading symbol as stored, e.g. RELIANCE." },
        market: marketProperty,
      },
      required: ["ticker"],
      additionalProperties: false,
    },
    run: (ctx, args) => getHoldingDetails(ctx, args as z.infer<typeof getHoldingDetailsArgsSchema>),
  },
  {
    name: "search_stock",
    description:
      "Resolve a company name or partial symbol to real listings. ALWAYS call this before naming a ticker for an instrument the user described by name, and never guess a symbol. Returns candidates with symbol, company name, exchange and market; when more than one candidate matches, ask the user which one they meant instead of choosing.",
    args: searchStockArgsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company name or partial symbol, e.g. \"Reliance\" or \"INFY\"." },
        market: marketProperty,
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: (ctx, args) => searchStock(ctx, args as z.infer<typeof searchStockArgsSchema>),
  },
  {
    name: "get_stock_price",
    description:
      "Latest quote for one instrument the user asked about, with the provider's freshness (`realtime`, `delayed`, `eod` or `unknown`). Use for \"what is Infosys trading at\". Report the freshness when it is not realtime, and never present a price the tool did not return.",
    args: getStockPriceArgsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Trading symbol, e.g. RELIANCE or AAPL." },
        market: marketProperty,
      },
      required: ["ticker"],
      additionalProperties: false,
    },
    run: (ctx, args) => getStockPrice(ctx, args as z.infer<typeof getStockPriceArgsSchema>),
  },
  {
    name: "get_market_status",
    description:
      "Current NSE session state (pre-open, open, closed, weekend, holiday), the IST clock and what that means. Use for \"is the market open\". Set includeIndices to also return NIFTY 50, SENSEX and BANK NIFTY levels — that costs a provider call, so only do it when the user asked about indices or market levels.",
    args: getMarketStatusArgsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        includeIndices: {
          type: "boolean",
          description: "Also return the three index levels. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
    run: (ctx, args) => getMarketStatusTool(ctx, args as z.infer<typeof getMarketStatusArgsSchema>),
  },
  {
    name: "navigate_to_section",
    description:
      "Give the user a button that opens one dashboard section. Use when the answer lives in a screen the user should see (\"open my journal\", \"where are my alerts\"). You choose the section, never a URL.",
    args: navigateToSectionArgsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: [...DASHBOARD_SECTION_IDS],
          description: "Dashboard section id.",
        },
      },
      required: ["section"],
      additionalProperties: false,
    },
    run: (ctx, args) => navigateToSection(ctx, args as z.infer<typeof navigateToSectionArgsSchema>),
  },
];

const BY_NAME = new Map(TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** Tool specs in the shape the providers expect. */
export function modelToolSpecs(): ToolSpec[] {
  return TOOL_DEFINITIONS.map((definition) => ({
    type: "function" as const,
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.jsonSchema,
    },
  }));
}

/** Empty when the advertised catalog and the runnable registry agree. */
export function registryParityIssues(): string[] {
  const registered = new Set(TOOL_DEFINITIONS.map((definition) => definition.name));
  const advertised = new Set(ASSISTANT_TOOL_NAMES);
  const issues: string[] = [];

  for (const name of advertised) {
    if (!registered.has(name)) issues.push(`advertised but not implemented: ${name}`);
  }
  for (const name of registered) {
    if (!advertised.has(name)) issues.push(`implemented but not advertised: ${name}`);
  }
  return issues;
}

export type ToolExecutionStatus = "ok" | "error" | "invalid_args" | "unknown_tool";

export interface ToolExecution {
  status: ToolExecutionStatus;
  outcome: ToolOutcome;
}

const invalidArgs = (message: string): ToolExecution => ({
  status: "invalid_args",
  outcome: { status: "error", message, retryable: true },
});

/**
 * Parses, validates and runs one tool call.
 *
 * Argument errors are described by field path and rule only — the model's own
 * text is never echoed back into a result, so injected content cannot ride a
 * validation message into the next prompt.
 */
export async function executeToolDefinition(
  ctx: ToolContext,
  name: string,
  rawArguments: string,
): Promise<ToolExecution> {
  const definition = getToolDefinition(name);
  if (!definition) {
    return {
      status: "unknown_tool",
      outcome: {
        status: "error",
        message: "That capability does not exist. Available tools are read-only portfolio and market lookups.",
        retryable: false,
      },
    };
  }

  let parsedArguments: unknown;
  const trimmed = rawArguments.trim();
  try {
    parsedArguments = trimmed === "" ? {} : JSON.parse(trimmed);
  } catch {
    return invalidArgs("Arguments were not valid JSON.");
  }
  if (typeof parsedArguments !== "object" || parsedArguments === null || Array.isArray(parsedArguments)) {
    return invalidArgs("Arguments must be a JSON object.");
  }

  const validation = definition.args.safeParse(parsedArguments);
  if (!validation.success) {
    const first = validation.error.issues[0];
    const path = first && first.path.length > 0 ? first.path.join(".") : "arguments";
    return invalidArgs(`Invalid ${path}: ${first?.message ?? "expected a different value"}.`);
  }

  try {
    const outcome = await definition.run(ctx, validation.data);
    return { status: outcome.status === "ok" ? "ok" : "error", outcome };
  } catch {
    // A tool bug must read as a failed lookup, not as a broken assistant, and it
    // must never leak a stack trace into the conversation.
    return {
      status: "error",
      outcome: { status: "error", message: "That lookup failed unexpectedly.", retryable: true },
    };
  }
}
