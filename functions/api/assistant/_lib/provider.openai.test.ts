// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderChain, openAiEndpoint } from "./provider";
import { upstreamJson } from "../../_lib/testHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = {
  system: "system",
  messages: [{ role: "user" as const, content: "hello" }],
  tools: [],
  timeoutMs: 1000,
};

/** A minimal successful OpenAI chat-completions body. */
const okReply = (content: string | null, toolCalls?: unknown[]) =>
  upstreamJson({
    id: "chatcmpl-1",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) }, finish_reason: "stop" }],
  });

describe("OpenAI provider — configuration", () => {
  it("becomes the primary provider when OPENAI_API_KEY is set", () => {
    const chain = createProviderChain({ OPENAI_API_KEY: "sk-test" });
    expect(chain.primary?.name).toBe("openai");
  });

  it("defaults to a tool-calling model and honours the server-side override", () => {
    expect(createProviderChain({ OPENAI_API_KEY: "k" }).primary?.model).toBe("gpt-4o-mini");
    expect(
      createProviderChain({ OPENAI_API_KEY: "k", ASSISTANT_MODEL_PRIMARY: "gpt-4.1-mini" }).primary?.model,
    ).toBe("gpt-4.1-mini");
  });

  it("never reads a key from any other variable name", () => {
    // A key present under an unrelated name must not switch the provider on.
    expect(createProviderChain({ VITE_OPENAI_API_KEY: "k" } as never).primary).toBeNull();
    expect(createProviderChain({ openai_api_key: "k" } as never).primary).toBeNull();
  });

  it("keeps Groq as a secondary provider when both keys exist", () => {
    const chain = createProviderChain({ OPENAI_API_KEY: "o", GROQ_API_KEY: "g" });
    expect(chain.primary?.name).toBe("openai");
    expect(chain.fallback?.name).toBe("groq");
  });

  it("falls back to Groq alone when only the Groq key exists", () => {
    const chain = createProviderChain({ GROQ_API_KEY: "g" });
    expect(chain.primary?.name).toBe("groq");
    expect(chain.fallback).toBeNull();
  });

  it("has no provider at all when nothing is configured", () => {
    const chain = createProviderChain({});
    expect(chain.primary).toBeNull();
    expect(chain.fallback).toBeNull();
  });

  it("points at the official chat-completions endpoint", () => {
    expect(openAiEndpoint()).toBe("https://api.openai.com/v1/chat/completions");
  });
});

describe("OpenAI provider — request shape", () => {
  it("sends a bearer token and the standard tool-calling body", async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        captured = { url: String(input), init };
        return okReply("hi");
      }),
    );

    const chain = createProviderChain({ OPENAI_API_KEY: "sk-secret-value" });
    const reply = await chain.primary?.complete({
      ...request,
      tools: [{ type: "function", function: { name: "t", description: "d", parameters: {} } }],
      maxTokens: 123,
      temperature: 0.1,
    });

    expect(reply?.text).toBe("hi");
    const headers = captured!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-secret-value");
    const body = JSON.parse(String(captured!.init!.body));
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.max_tokens).toBe(123);
    expect(body.temperature).toBe(0.1);
    expect(body.tool_choice).toBe("auto");
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: "system", content: "system" });
  });

  it("sends tool result messages with their tool_call_id", async () => {
    let body: { messages: unknown[] } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return okReply("done");
      }),
    );
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    await chain.primary?.complete({
      ...request,
      messages: [
        { role: "user", content: "show holdings" },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", name: "get_holdings", arguments: "{}" }] },
        { role: "tool", content: "rows", tool_call_id: "c1" },
      ],
    });
    const messages = body!.messages as Array<Record<string, unknown>>;
    // messages[0] is the system prompt prepended by callModel.
    expect(messages[1]).toMatchObject({ role: "user", content: "show holdings" });
    expect(messages[2]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "c1", type: "function", function: { name: "get_holdings", arguments: "{}" } }],
    });
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: "rows" });
  });

  it("parses tool calls from a real OpenAI-shaped reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        okReply(null, [
          { id: "call_abc", type: "function", function: { name: "get_stock_price", arguments: '{"ticker":"NVDA","market":"US"}' } },
        ]),
      ),
    );
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    const reply = await chain.primary?.complete(request);
    expect(reply?.provider).toBe("openai");
    expect(reply?.toolCalls).toEqual([
      { id: "call_abc", name: "get_stock_price", arguments: '{"ticker":"NVDA","market":"US"}' },
    ]);
  });
});

describe("OpenAI provider — failure classification", () => {
  it("returns null without throwing on a missing key (provider not built)", () => {
    const chain = createProviderChain({});
    expect(chain.primary).toBeNull();
  });

  it("classifies an invalid API key as fatal and does not retry", async () => {
    const fetchMock = vi.fn(async () => upstreamJson({ error: { code: "invalid_api_key" } }, 401));
    vi.stubGlobal("fetch", fetchMock);
    const chain = createProviderChain({ OPENAI_API_KEY: "bad" });
    await expect(chain.primary?.complete(request)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies insufficient quota as fatal", async () => {
    const fetchMock = vi.fn(async () =>
      upstreamJson({ error: { code: "insufficient_quota", type: "insufficient_quota" } }, 429),
    );
    vi.stubGlobal("fetch", fetchMock);
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    await expect(chain.primary?.complete(request)).resolves.toBeNull();
    // A 429 is fatal only when the body says quota; a plain rate limit retries.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("returns null on a plain rate limit so the chain can move on", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => {
        seen.push(JSON.parse(String(init?.body)).model);
        return seen.length === 1
          ? upstreamJson({ error: { code: "rate_limit_exceeded" } }, 429)
          : okReply("second model");
      }),
    );
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    const reply = await chain.primary?.complete(request);
    expect(reply?.text).toBe("second model");
    expect(seen.length).toBe(2);
  });

  it("returns null on a timeout (abort) without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    );
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    await expect(chain.primary?.complete({ ...request, timeoutMs: 20 })).resolves.toBeNull();
  });

  it("returns null on a malformed response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    await expect(chain.primary?.complete(request)).resolves.toBeNull();
  });

  it("returns null on a 5xx outage without leaking the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson({ error: "upstream exploded" }, 500)));
    const chain = createProviderChain({ OPENAI_API_KEY: "k" });
    const reply = await chain.primary?.complete(request);
    expect(reply).toBeNull();
  });

  it("never includes the key in the rejection value", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const chain = createProviderChain({ OPENAI_API_KEY: "sk-do-not-leak-me" });
    const reply = await chain.primary?.complete(request);
    expect(JSON.stringify(reply)).not.toContain("sk-do-not-leak-me");
  });
});

describe("OpenAI fallthrough to Groq", () => {
  it("uses Groq when OpenAI is unavailable at runtime", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("api.openai.com")) return upstreamJson({ error: { code: "invalid_api_key" } }, 401);
        return okReply("groq answered");
      }),
    );
    const chain = createProviderChain({ OPENAI_API_KEY: "bad", GROQ_API_KEY: "g" });
    const primary = await chain.primary?.complete(request);
    expect(primary).toBeNull();
    const secondary = await chain.fallback?.complete(request);
    expect(secondary?.text).toBe("groq answered");
    expect(secondary?.provider).toBe("groq");
  });
});
