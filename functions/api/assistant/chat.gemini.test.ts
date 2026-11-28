// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./chat";
import { authedRequest, makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "../_lib/testHelpers";
import { clearRateLimits } from "../_lib/ratelimit";
import { encodeValue } from "../_lib/firestore";

const URL = "https://zenfolio.pages.dev/api/assistant/chat";
const payload = (text: string) => ({
  candidates: [{ content: { role: "model", parts: [{ text }] } }],
});
const firestoreDocument = {
  updateTime: "2026-11-10T00:00:00.000000Z",
  fields: {
    uid: { stringValue: "user-1" },
    snapshot: encodeValue({ stocks: [], trades: [], watchlist: [], alerts: [], fnoTrades: [], executions: [] }),
  },
};
const post = (env: Record<string, unknown>) =>
  onRequestPost({
    request: authedRequest(URL, {
      conversationId: "conv-gemini-test",
      messages: [{ role: "user", content: "hello" }],
    }),
    env: makeEnv(env),
    params: {},
  });

beforeEach(() => {
  stubIdentity("user-1");
  clearRateLimits();
});

afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearRateLimits();
});

describe("Gemini provider orchestration", () => {
  it("uses Gemini as primary and keeps the provider identity on its response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("generativelanguage.googleapis.com")) return upstreamJson(payload("Hello from Gemini."));
      throw new Error("unexpected provider call");
    }));

    const response = await post({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o", GROQ_API_KEY: "r" });
    const body = (await response.json()) as { provider: string; model: string; degraded: boolean; reply: string };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      degraded: false,
      reply: "Hello from Gemini.",
    });
  });

  it("falls back from Gemini to OpenAI and reports OpenAI, not Gemini", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) return upstreamJson({ error: { status: "UNAUTHENTICATED" } }, 401);
      if (url.includes("api.openai.com")) {
        return upstreamJson({ choices: [{ message: { content: "OpenAI answered." } }] });
      }
      throw new Error("unexpected provider call");
    }));

    const response = await post({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o" });
    const body = (await response.json()) as { provider: string; degraded: boolean; reply: string };

    expect(body).toMatchObject({ provider: "openai", degraded: false, reply: "OpenAI answered." });
  });

  it("falls through Gemini and OpenAI to Groq, reporting the provider that answered", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("generativelanguage.googleapis.com")) return upstreamJson({ error: { status: "PERMISSION_DENIED" } }, 403);
      if (url.includes("api.openai.com")) return upstreamJson({ error: { code: "invalid_api_key" } }, 401);
      if (url.includes("api.groq.com")) return upstreamJson({ choices: [{ message: { content: "Groq answered." } }] });
      throw new Error("unexpected request");
    }));

    const response = await post({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o", GROQ_API_KEY: "r" });
    const body = (await response.json()) as { provider: string; degraded: boolean; reply: string };

    expect(body).toMatchObject({ provider: "groq", degraded: false, reply: "Groq answered." });
    expect(calls.map((url) => url.includes("generativelanguage.googleapis.com") ? "gemini" : url.includes("api.openai.com") ? "openai" : "groq"))
      .toEqual(["gemini", "openai", "groq"]);
  });

  it("uses the existing validated registry for Gemini function calls and sends its result back", async () => {
    const providerBodies: Record<string, unknown>[] = [];
    let geminiRound = 0;
    let firestoreReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("firestore.googleapis.com")) {
        firestoreReads += 1;
        return upstreamJson(firestoreDocument);
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        geminiRound += 1;
        if (geminiRound === 1) {
          return upstreamJson({
            candidates: [{
              content: {
                role: "model",
                parts: [{
                  functionCall: {
                    name: "get_portfolio_summary",
                    args: {},
                    id: "provider-call-id",
                  },
                  thoughtSignature: "opaque-model-signature",
                }],
              },
            }],
          });
        }
        return upstreamJson(payload("The portfolio lookup found no positions."));
      }
      throw new Error("unexpected request");
    }));

    const response = await onRequestPost({
      request: authedRequest(URL, {
        conversationId: "conv-gemini-tool",
        messages: [{ role: "user", content: "How is my portfolio doing?" }],
      }),
      env: makeEnv({ GEMINI_API_KEY: "g" }),
      params: {},
    });
    const body = (await response.json()) as {
      provider: string;
      degraded: boolean;
      usage: { toolCalls: number };
      toolTrace: Array<{ name: string; status: string }>;
    };
    const secondTurn = providerBodies[1].contents as Array<{ parts: Array<Record<string, unknown>> }>;

    expect(body).toMatchObject({
      provider: "gemini",
      degraded: false,
      usage: { toolCalls: 1 },
      toolTrace: [{ name: "get_portfolio_summary", status: "ok" }],
    });
    expect(firestoreReads).toBe(1);
    expect(JSON.stringify(secondTurn)).toContain('"functionResponse":{"name":"get_portfolio_summary"');
    expect(JSON.stringify(secondTurn)).toContain('"id":"provider-call-id"');
    expect(JSON.stringify(secondTurn)).toContain('"thoughtSignature":"opaque-model-signature"');
    expect(JSON.stringify(secondTurn)).toContain("<<<UNTRUSTED tool result");
  });

  it("returns no fabricated quote when the market-data source has no price", async () => {
    let quoteLookups = 0;
    let geminiRound = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("query1.finance.yahoo.com")) {
        quoteLookups += 1;
        return upstreamJson({ chart: { result: null, error: null } });
      }
      if (url.includes("generativelanguage.googleapis.com")) {
        geminiRound += 1;
        if (geminiRound === 1) {
          return upstreamJson({
            candidates: [{
              content: {
                role: "model",
                parts: [{ functionCall: { name: "get_stock_price", args: { ticker: "NVDA", market: "US" } } }],
              },
            }],
          });
        }
        return upstreamJson(payload("No live price is available for US:NVDA right now."));
      }
      throw new Error("unexpected request");
    }));

    const response = await onRequestPost({
      request: authedRequest(URL, {
        conversationId: "conv-gemini-no-quote",
        messages: [{ role: "user", content: "What is Nvidia's price?" }],
      }),
      env: makeEnv({ GEMINI_API_KEY: "g" }),
      params: {},
    });
    const body = (await response.json()) as {
      reply: string;
      cards: Array<{ kind: string }>;
      toolTrace: Array<{ name: string; status: string }>;
    };

    expect(quoteLookups).toBe(1);
    expect(body.reply).toContain("No live price is available");
    expect(body.cards).toHaveLength(0);
    expect(body.toolTrace).toEqual([expect.objectContaining({ name: "get_stock_price", status: "error" })]);
  });

  it("preserves deterministic fallback when Gemini, OpenAI, and Groq all fail", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("generativelanguage.googleapis.com")) return upstreamJson({ error: "unavailable" }, 503);
      if (url.includes("api.openai.com")) return upstreamJson({ error: "unavailable" }, 503);
      if (url.includes("api.groq.com")) return upstreamJson({ error: "unavailable" }, 503);
      throw new Error("unexpected request");
    }));

    const response = await post({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o", GROQ_API_KEY: "r" });
    const body = (await response.json()) as { provider: string | null; degraded: boolean; reply: string };

    expect(body.provider).toBeNull();
    expect(body.degraded).toBe(true);
    expect(body.reply).toContain("AI service is unavailable");
    expect(calls.map((url) => url.includes("generativelanguage.googleapis.com") ? "gemini" : url.includes("api.openai.com") ? "openai" : "groq"))
      .toEqual(["gemini", "openai", "openai", "groq", "groq"]);
  });

  it("enforces the existing maximum tool-call and model-round budgets", async () => {
    let geminiCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (!String(input).includes("generativelanguage.googleapis.com")) throw new Error("unexpected request");
      geminiCalls += 1;
      return upstreamJson({
        candidates: [{
          content: {
            role: "model",
            parts: Array.from({ length: 6 }, () => ({
              functionCall: { name: "get_market_status", args: {} },
            })),
          },
        }],
      });
    }));

    const response = await onRequestPost({
      request: authedRequest(URL, {
        conversationId: "conv-gemini-limits",
        messages: [{ role: "user", content: "Is the market open?" }],
      }),
      env: makeEnv({ GEMINI_API_KEY: "g" }),
      params: {},
    });
    const body = (await response.json()) as { usage: { rounds: number; toolCalls: number } };

    expect(body.usage.toolCalls).toBe(8);
    expect(body.usage.rounds).toBe(4);
    expect(geminiCalls).toBe(4);
  });
});
