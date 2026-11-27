// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./chat";
import { authedRequest, makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "../_lib/testHelpers";
import { clearRateLimits } from "../_lib/ratelimit";
import { resetMarketCache } from "../_lib/marketCache";
import { encodeValue } from "../_lib/firestore";
import type { PortfolioSnapshot } from "../../../src/lib/data/snapshotTypes.ts";

/**
 * Orchestration-level proof for the OpenAI provider.
 *
 * The production defect these tests guard against: a configured provider that
 * silently loses every round, so `degraded: true` was returned for every
 * request while the client rendered it as a normal answer.
 */

const URL = "https://zenfolio.pages.dev/api/assistant/chat";
const CONVERSATION_ID = "conv-openai-0001";

const POSITIONS: PortfolioSnapshot["stocks"] = [
  {
    ticker: "RELIANCE",
    stockName: "Reliance Industries",
    sector: "Energy",
    entryDate: "10-Jan-2026",
    entryPrice: 2450,
    cmp: 2612.35,
    quantity: 15,
    status: "Active",
    market: "NSE",
    currency: "INR",
    source: "manual",
  },
];

const firestoreDocument = (uid: string, snapshot: PortfolioSnapshot) => ({
  updateTime: "2026-11-10T00:00:00.000000Z",
  fields: { uid: { stringValue: uid }, snapshot: encodeValue(snapshot) },
});

const modelReply = (content: string | null, toolCalls?: unknown[]) => ({
  choices: [{ message: { content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }],
});

/** A raw OpenAI chat-completions body (note the extra envelope fields). */
const openAiReply = (content: string | null, toolCalls?: unknown[]) =>
  upstreamJson({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });

const post = (env: Record<string, unknown>, body: unknown) =>
  onRequestPost({ request: authedRequest(URL, body), env: makeEnv(env), params: {} });

const userMessage = (content: string) => ({
  conversationId: CONVERSATION_ID,
  messages: [{ role: "user", content }],
});

interface ChatBody {
  reply: string;
  degraded: boolean;
  provider: string | null;
  model: string | null;
  cards: Array<{ kind: string }>;
  usage: { rounds: number; toolCalls: number };
}

beforeEach(() => {
  stubIdentity("user-1");
  resetMarketCache();
  // 8 turns in one file exceed the 20/min assistant budget otherwise; each test
  // must start from a clean window to isolate what it is actually asserting.
  clearRateLimits();
});

afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearRateLimits();
  resetMarketCache();
});

describe("assistant chat â€” OpenAI as primary provider", () => {
  it("returns a model-backed answer and does NOT report it as degraded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("https://api.openai.com")) return openAiReply("You hold Reliance.");
        return upstreamJson(firestoreDocument("user-1", { stocks: POSITIONS, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }));
      }),
    );

    const res = await post({ OPENAI_API_KEY: "sk-test" }, userMessage("how is my portfolio doing"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatBody;

    expect(body.degraded).toBe(false);
    expect(body.provider).toBe("openai");
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.reply).toBe("You hold Reliance.");
    expect(body.usage.rounds).toBe(1);
  });

  it("executes a model tool call against authoritative portfolio data", async () => {
    const providerBodies: string[] = [];
    let round = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("firestore.googleapis.com")) {
          return upstreamJson(firestoreDocument("user-1", { stocks: POSITIONS, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }));
        }
        if (url.includes("https://api.openai.com")) {
          providerBodies.push(String(init?.body ?? ""));
          round += 1;
          if (round === 1) {
            return openAiReply(null, [
              { id: "call_1", type: "function", function: { name: "get_holdings", arguments: '{"status":"active","limit":10}' } },
            ]);
          }
          return openAiReply("You hold 15 Reliance shares.");
        }
        return upstreamJson({}, 500);
      }),
    );

    const res = await post({ OPENAI_API_KEY: "sk-test" }, userMessage("show my holdings"));
    const body = (await res.json()) as ChatBody;

    expect(body.degraded).toBe(false);
    expect(body.provider).toBe("openai");
    expect(body.usage.toolCalls).toBeGreaterThanOrEqual(1);
    // The second provider call carries the tool result, fenced as untrusted data.
    expect(providerBodies.length).toBeGreaterThanOrEqual(2);
    expect(providerBodies[1]).toContain("<<<UNTRUSTED tool result");
    // The card came from the application's own holdings computation.
    expect(body.cards.some((card) => card.kind === "holdings")).toBe(true);
  });

  it("looks up a stock the user does not own", async () => {
    let round = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("https://api.openai.com")) {
          round += 1;
          if (round === 1) {
            return openAiReply(null, [
              { id: "c1", type: "function", function: { name: "get_stock_price", arguments: '{"ticker":"NVDA","market":"US"}' } },
            ]);
          }
          return openAiReply("Nvidia is quoted below.");
        }
        if (url.includes("finance.yahoo.com") || url.includes("query1.finance")) {
          return upstreamJson({
            chart: {
              result: [
                {
                  meta: { symbol: "NVDA", regularMarketPrice: 178.2, previousClose: 175.0, currency: "USD" },
                  timestamp: [1764432000],
                  indicators: { quote: [{ close: [178.2] }] },
                },
              ],
            },
          });
        }
        return upstreamJson({}, 500);
      }),
    );

    const res = await post({ OPENAI_API_KEY: "sk-test" }, userMessage("what is Nvidia's price"));
    const body = (await res.json()) as ChatBody;

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(false);
    // A quote card for a non-held instrument proves the tool set is not
    // restricted to portfolio holdings.
    expect(body.cards.some((card) => card.kind === "quote")).toBe(true);
  });

  it("falls back to the deterministic answer when OpenAI fails, and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("https://api.openai.com")) return upstreamJson({ error: { code: "invalid_api_key" } }, 401);
        return upstreamJson(firestoreDocument("user-1", { stocks: POSITIONS, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }));
      }),
    );

    const res = await post({ OPENAI_API_KEY: "bad" }, userMessage("how is my portfolio doing"));
    const body = (await res.json()) as ChatBody;

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.provider).toBeNull();
    expect(body.model).toBeNull();
    expect(body.reply).toContain("without AI");
  });

  it("does not claim a model answered when nothing is configured", async () => {
    const res = await post({}, userMessage("how is my portfolio doing"));
    const body = (await res.json()) as ChatBody;
    expect(body.degraded).toBe(true);
    expect(body.provider).toBeNull();
  });

  it("moves to Groq when OpenAI is rejected, and reports Groq as the provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("https://api.openai.com")) return upstreamJson({ error: { code: "invalid_api_key" } }, 401);
        if (url.includes("https://api.groq.com")) return upstreamJson(modelReply("Groq says Reliance."));
        return upstreamJson(firestoreDocument("user-1", { stocks: POSITIONS, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }));
      }),
    );

    const res = await post({ OPENAI_API_KEY: "bad", GROQ_API_KEY: "g" }, userMessage("how is my portfolio doing"));
    const body = (await res.json()) as ChatBody;

    expect(body.degraded).toBe(false);
    expect(body.provider).toBe("groq");
    expect(body.reply).toBe("Groq says Reliance.");
  });

  it("never leaks the API key into the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("https://api.openai.com")) return upstreamJson({ error: { code: "invalid_api_key" } }, 401);
        return upstreamJson(firestoreDocument("user-1", { stocks: POSITIONS, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }));
      }),
    );

    const res = await post({ OPENAI_API_KEY: "sk-super-secret-value" }, userMessage("hi"));
    const raw = await res.text();
    expect(raw).not.toContain("sk-super-secret-value");
  });

  it("still refuses a write request with the read-only correction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("https://api.openai.com")) return openAiReply("I have added that trade for you.");
        return upstreamJson(firestoreDocument("user-1", { stocks: POSITIONS, trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }));
      }),
    );

    const res = await post({ OPENAI_API_KEY: "sk-test" }, userMessage("add a trade for 1 TCS"));
    const body = (await res.json()) as ChatBody;

    expect(body.reply).toContain("can't change anything");
    expect(body.cards).toHaveLength(0);
  });
});

