/**
 * Assistant wire contract — the single source of truth for both sides.
 *
 * This module is isomorphic and dependency-light (zod only, no DOM, no `@`
 * alias, no React) because Pages Functions bundle it directly, exactly like
 * `src/lib/brokers/contracts.ts`. Types are DERIVED from the zod schemas, so a
 * field cannot exist in the TypeScript type and be missing from validation.
 *
 * Security-relevant properties, kept here so they cannot drift:
 *  - The request envelope is `.strict()`: an extra key (a smuggled `uid`,
 *    `role`, or tool override) is a 400, never silently ignored.
 *  - There is no `userId` field anywhere. Identity comes from the verified
 *    Firebase token only.
 *  - Every numeric card value is finite-or-null, so a UI can never render
 *    `NaN`, `Infinity` or `-0` as a price.
 *  - Every free-text field is length-capped, because these strings are rendered
 *    and (in the tool path) read by a model.
 */

import { z } from "zod";
import { isDashboardSection } from "../navigation/routes.ts";

// ── Limits ────────────────────────────────────────────────────────────────────

/** Turns of conversation the client sends per request. */
export const MAX_HISTORY_MESSAGES = 12;
/** Turns kept in local storage per user. */
export const MAX_STORED_MESSAGES = 40;
/** Characters accepted in one user message. */
export const MAX_MESSAGE_CHARS = 2000;
/** Cards rendered per assistant turn (the server also caps at this). */
export const MAX_CARDS_PER_TURN = 3;
/** Model round-trips per turn. */
export const MAX_TOOL_ROUNDS = 4;
/** Tool executions per turn. */
export const MAX_TOOL_CALLS = 8;
/** Tool executions requested in a single model reply. */
export const MAX_TOOL_CALLS_PER_ROUND = 4;
/** Reply length accepted from a provider, and returned to the client. */
export const MAX_REPLY_CHARS = 4000;

// ── Primitives ────────────────────────────────────────────────────────────────

export const marketSchema = z.enum(["NSE", "US"]);

export const currencySchema = z.enum(["INR", "USD"]);

export const dataModeSchema = z.enum(["realtime", "delayed", "eod", "unknown"]);

export const positionStatusSchema = z.enum(["Active", "Sold Profit", "Sold Loss", "Sold"]);

/** A finite number, or `null` when the value is genuinely unknown. */
const finiteOrNull = z.number().finite().nullable();

// ── Cards (server → client) ───────────────────────────────────────────────────

const metricSchema = z.object({
  label: z.string().min(1).max(40),
  value: finiteOrNull,
  currency: currencySchema.nullable(),
  hint: z.string().max(120).optional(),
});

const holdingRowSchema = z.object({
  ticker: z.string().min(1).max(24),
  name: z.string().max(120),
  market: marketSchema,
  quantity: z.number().finite(),
  averageCost: finiteOrNull,
  price: finiteOrNull,
  pnl: finiteOrNull,
  pnlPercent: finiteOrNull,
  currency: currencySchema,
  status: positionStatusSchema,
});

const stockCandidateSchema = z.object({
  symbol: z.string().min(1).max(24),
  name: z.string().max(160),
  exchange: z.string().max(24),
  market: marketSchema,
  isin: z.string().max(20).nullable(),
  instrumentType: z.string().max(24).nullable(),
});

const indexRowSchema = z.object({
  label: z.string().min(1).max(24),
  price: finiteOrNull,
  changePercent: finiteOrNull,
});

export const assistantCardSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("metrics"),
    title: z.string().min(1).max(80),
    metrics: z.array(metricSchema).min(1).max(8),
    note: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("holdings"),
    title: z.string().min(1).max(80),
    rows: z.array(holdingRowSchema).max(50),
    note: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("stocks"),
    title: z.string().min(1).max(80),
    hits: z.array(stockCandidateSchema).max(10),
    note: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("quote"),
    title: z.string().min(1).max(80),
    ticker: z.string().min(1).max(24),
    market: marketSchema,
    currency: currencySchema,
    price: finiteOrNull,
    changePercent: finiteOrNull,
    weekHigh52: finiteOrNull,
    weekLow52: finiteOrNull,
    asOf: z.string().max(40).nullable(),
    dataMode: dataModeSchema,
    note: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("market"),
    title: z.string().min(1).max(80),
    phase: z.enum(["pre-open", "open", "closed", "weekend", "holiday", "unknown"]),
    isOpen: z.boolean(),
    label: z.string().max(40),
    istTime: z.string().max(8),
    description: z.string().max(200),
    indices: z.array(indexRowSchema).max(3),
    note: z.string().max(300).optional(),
  }),
  z.object({
    kind: z.literal("navigation"),
    title: z.string().min(1).max(80),
    label: z.string().min(1).max(40),
    path: z.string().min(1).max(120),
  }),
]);

export type AssistantCard = z.infer<typeof assistantCardSchema>;
export type AssistantCardKind = AssistantCard["kind"];
export type HoldingRow = z.infer<typeof holdingRowSchema>;
export type StockCandidate = z.infer<typeof stockCandidateSchema>;
export type AssistantMetric = z.infer<typeof metricSchema>;

// ── Conversation envelope (client → server) ───────────────────────────────────

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const conversationContextSchema = z
  .object({
    /** Market the user last referred to, so "and Reliance?" stays unambiguous. */
    market: marketSchema.optional(),
    /** Last instrument the user asked about. */
    ticker: z.string().min(1).max(24).optional(),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    /**
     * Client-generated correlation id. Used for logging ONLY — never for
     * identity, ownership or scoping. A guessable id grants nothing.
     */
    conversationId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    messages: z.array(chatMessageSchema).min(1).max(MAX_HISTORY_MESSAGES),
    context: conversationContextSchema.optional(),
  })
  // `.strict()` is the anti-spoofing rule: a body carrying `uid` or any other
  // extra key is rejected instead of quietly ignored.
  .strict();

export type AssistantChatMessage = z.infer<typeof chatMessageSchema>;
export type AssistantChatRequest = z.infer<typeof chatRequestSchema>;

// ── Response ──────────────────────────────────────────────────────────────────

export const assistantToolTraceSchema = z.object({
  name: z.string().min(1).max(48),
  status: z.enum(["ok", "error", "skipped"]),
  durationMs: z.number().int().min(0).max(120_000),
});

export const assistantUsageSchema = z.object({
  rounds: z.number().int().min(0).max(MAX_TOOL_ROUNDS + 4),
  toolCalls: z.number().int().min(0).max(MAX_TOOL_CALLS + 4),
  durationMs: z.number().int().min(0).max(300_000),
});

export const assistantChatResponseSchema = z.object({
  reply: z.string().min(1).max(MAX_REPLY_CHARS),
  cards: z.array(assistantCardSchema).max(MAX_CARDS_PER_TURN),
  /** True when the deterministic fallback answered instead of a model. */
  degraded: z.boolean(),
  provider: z.string().max(24).nullable(),
  model: z.string().max(80).nullable(),
  usage: assistantUsageSchema,
  toolTrace: z.array(assistantToolTraceSchema).max(MAX_TOOL_CALLS + 4),
});

export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;
export type AssistantToolTrace = z.infer<typeof assistantToolTraceSchema>;
export type AssistantUsage = z.infer<typeof assistantUsageSchema>;

// ── Tool arguments (server-side validation; no uid field anywhere) ─────────────

export const getPortfolioSummaryArgsSchema = z.object({}).strict();

export const getHoldingsArgsSchema = z
  .object({
    status: z.enum(["active", "closed", "all"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const getHoldingDetailsArgsSchema = z
  .object({
    ticker: z.string().min(1).max(24),
    market: marketSchema.optional(),
  })
  .strict();

export const searchStockArgsSchema = z
  .object({
    query: z.string().min(1).max(40),
    market: marketSchema.optional(),
  })
  .strict();

export const getStockPriceArgsSchema = z
  .object({
    ticker: z.string().min(1).max(24),
    market: marketSchema.optional(),
  })
  .strict();

export const getMarketStatusArgsSchema = z
  .object({
    includeIndices: z.boolean().optional(),
  })
  .strict();

export const navigateToSectionArgsSchema = z
  .object({
    section: z
      .string()
      .min(1)
      .max(24)
      .refine((value) => isDashboardSection(value), {
        message: "Unknown dashboard section",
      }),
  })
  .strict();

export type GetHoldingsArgs = z.infer<typeof getHoldingsArgsSchema>;
export type GetHoldingDetailsArgs = z.infer<typeof getHoldingDetailsArgsSchema>;
export type SearchStockArgs = z.infer<typeof searchStockArgsSchema>;
export type GetStockPriceArgs = z.infer<typeof getStockPriceArgsSchema>;
export type GetMarketStatusArgs = z.infer<typeof getMarketStatusArgsSchema>;
export type NavigateToSectionArgs = z.infer<typeof navigateToSectionArgsSchema>;
