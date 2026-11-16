/**
 * Per-turn tool context.
 *
 * THE identity rule of this feature: `uid` and `token` are placed here once,
 * from the verified Firebase identity, and every tool receives this object.
 * No tool accepts a user id, a document path, a collection name or a query from
 * its arguments — so there is no path by which model-generated output can name
 * a different user's data.
 *
 * The context also memoises provider work for the duration of one turn: a
 * single question frequently needs the same snapshot, quote or FX rate twice
 * ("compare my top two holdings"), and re-fetching would double latency and
 * provider spend for no new information.
 */

import { readPortfolio } from "../../_lib/firestore";
import { MAX_QUOTES_PER_REQUEST, resolveQuotes } from "../../_lib/quotes";
import { fetchUsdInr } from "../../../../src/lib/market-data/fx.ts";
import type { Instrument, QuoteEnvelope } from "../../../../src/lib/market-data/types.ts";
import type { PortfolioSnapshot } from "../../../../src/lib/data/snapshotTypes.ts";
import type { AssistantCard } from "../../../../src/lib/assistant/schemas.ts";
import type { Env } from "../../_lib/types";

export interface ToolContext {
  readonly env: Env;
  /** From the verified token. Never from the request body. */
  readonly uid: string;
  /** The caller's own ID token, used for Firestore reads as that user. */
  readonly token: string;
  readonly now: number;
  readonly memo: Map<string, Promise<unknown>>;
}

export function createToolContext(input: {
  env: Env;
  uid: string;
  token: string;
  now?: number;
}): ToolContext {
  return {
    env: input.env,
    uid: input.uid,
    token: input.token,
    now: input.now ?? Date.now(),
    memo: new Map(),
  };
}

/** Runs `factory` at most once per key per turn. */
export function memoize<T>(ctx: ToolContext, key: string, factory: () => Promise<T>): Promise<T> {
  const existing = ctx.memo.get(key);
  if (existing) return existing as Promise<T>;
  const created = factory();
  ctx.memo.set(key, created as Promise<unknown>);
  return created;
}

export type ToolOutcome =
  | {
      status: "ok";
      /** Factual prose the model may quote. Numbers live in `data`/`card`. */
      summary: string;
      data: Record<string, unknown>;
      card?: AssistantCard;
    }
  | {
      status: "error";
      message: string;
      /** True when retrying the same call could plausibly succeed. */
      retryable: boolean;
    };

export const toolOk = (
  summary: string,
  data: Record<string, unknown>,
  card?: AssistantCard,
): ToolOutcome => (card ? { status: "ok", summary, data, card } : { status: "ok", summary, data });

export const toolError = (message: string, retryable = true): ToolOutcome => ({
  status: "error",
  message,
  retryable,
});

const emptySnapshot = (): PortfolioSnapshot => ({
  stocks: [],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
  executions: [],
});

export type SnapshotResult =
  | { status: "ok"; snapshot: PortfolioSnapshot; updateTime: string | null }
  | { status: "error"; message: string };

/**
 * Reads the caller's own snapshot.
 *
 * "No document yet" is a success with an empty snapshot — a new account is not
 * an error. A failed read is an error and is reported as one, because treating
 * it as "empty" is exactly how an assistant would tell a user their portfolio
 * had been wiped.
 */
export async function loadSnapshot(ctx: ToolContext): Promise<SnapshotResult> {
  return memoize(ctx, "snapshot", async (): Promise<SnapshotResult> => {
    const result = await readPortfolio(ctx.env, ctx.uid, ctx.token);
    if (result.status === "error") {
      return { status: "error", message: "Your portfolio could not be read right now." };
    }
    return {
      status: "ok",
      snapshot: result.snapshot ?? emptySnapshot(),
      updateTime: result.updateTime,
    };
  });
}

/**
 * USD→INR, or `null` when the provider cannot supply one.
 *
 * Never estimated and never defaulted: `null` propagates as "FX P&L
 * unavailable", which is the honest answer and the one the dashboard shows too.
 */
export async function loadUsdInr(ctx: ToolContext): Promise<number | null> {
  return memoize(ctx, "usd-inr", async (): Promise<number | null> => {
    try {
      const observation = await fetchUsdInr(6000);
      return Number.isFinite(observation.rate) && observation.rate > 0 ? observation.rate : null;
    } catch {
      return null;
    }
  });
}

export interface QuoteLoad {
  /** Envelope keyed `market:ticker`, exactly as the quote service returns them. */
  quotes: Record<string, QuoteEnvelope>;
  /** True when the provider answered for at least one instrument. */
  live: boolean;
  /** Set when the provider was unavailable, so a reply can say so. */
  note: string | null;
}

export const MAX_QUOTE_INSTRUMENTS = MAX_QUOTES_PER_REQUEST;

/**
 * Live quotes for a bounded instrument list.
 *
 * An outage is reported in `note` and the caller falls back to stored prices
 * with an explicit disclaimer. It is never silently rendered as a fresh price.
 */
export async function loadQuotes(ctx: ToolContext, instruments: Instrument[]): Promise<QuoteLoad> {
  if (instruments.length === 0) return { quotes: {}, live: false, note: null };

  const key = `quotes:${instruments.map((i) => `${i.market}:${i.ticker}`).join(",")}`;
  return memoize(ctx, key, async (): Promise<QuoteLoad> => {
    const outcome = await resolveQuotes(ctx.env, instruments.slice(0, MAX_QUOTE_INSTRUMENTS));
    if (outcome.status === "outage") {
      return { quotes: {}, live: false, note: "Live market prices are unavailable right now." };
    }
    return {
      quotes: outcome.result.quotes,
      live: true,
      note:
        outcome.result.missing.length > 0
          ? `No live price for ${outcome.result.missing.length} instrument(s).`
          : null,
    };
  });
}
