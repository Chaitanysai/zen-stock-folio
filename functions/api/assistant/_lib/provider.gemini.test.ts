// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyGeminiFailure, createProviderChain } from "./provider";
import { upstreamJson } from "../../_lib/testHelpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = {
  system: "Read-only financial assistant",
  messages: [
    { role: "user" as const, content: "What is Nvidia's price?" },
    {
      role: "assistant" as const,
      content: null,
      tool_calls: [{
        id: "call-1",
        name: "get_stock_price",
        arguments: '{"ticker":"NVDA","market":"US"}',
        providerId: "google-call-1",
        thoughtSignature: "thought-signature-1",
      }],
    },
    { role: "tool" as const, tool_call_id: "call-1", content: '{"status":"ok","price":178.2}' },
  ],
  tools: [
    {
      type: "function" as const,
      function: {
        name: "get_stock_price",
        description: "Look up a real quote.",
        parameters: {
          type: "object",
          properties: {
            ticker: { type: "string", description: "Symbol" },
            market: { type: "string", enum: ["NSE", "US"] },
          },
          required: ["ticker"],
          additionalProperties: false,
        },
      },
    },
  ],
  timeoutMs: 1000,
};

const geminiReply = (parts: unknown[]) =>
  upstreamJson({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }] });

describe("Gemini provider", () => {
  it("classifies authentication, permission, quota, rate, model, and upstream failures", () => {
    expect(classifyGeminiFailure(401, "")).toBe("invalid_api_key");
    expect(classifyGeminiFailure(403, "")).toBe("permission_denied");
    expect(classifyGeminiFailure(403, "RESOURCE_EXHAUSTED: quota")).toBe("quota_exhausted");
    expect(classifyGeminiFailure(429, "rate limit")).toBe("rate_limited");
    expect(classifyGeminiFailure(429, "quota exhausted")).toBe("quota_exhausted");
    expect(classifyGeminiFailure(404, "")).toBe("model_unavailable");
    expect(classifyGeminiFailure(400, "")).toBe("request_rejected");
    expect(classifyGeminiFailure(503, "")).toBe("upstream_unavailable");
  });

  it("uses the configured Gemini model, server-side key header, and returns text", async () => {
    const fetchMock = vi.fn(async () => geminiReply([{ text: "Nvidia is quoted below." }]));
    vi.stubGlobal("fetch", fetchMock);

    const chain = createProviderChain({ GEMINI_API_KEY: "gemini-secret-test" });
    const reply = await chain.primary?.complete(request);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];

    expect(chain.primary?.name).toBe("gemini");
    expect(reply).toMatchObject({
      text: "Nvidia is quoted below.",
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      toolCalls: [],
    });
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("gemini-secret-test");
    expect(url).not.toContain("gemini-secret-test");
  });

  it("translates function declarations and tool-result history, and keeps text beside calls", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return geminiReply([
          { text: "I checked the market-data source." },
          { functionCall: { name: "get_stock_price", args: { ticker: "NVDA", market: "US" } } },
          { functionCall: { name: "get_market_status", args: {} } },
        ]);
      }),
    );

    const reply = await createProviderChain({ GEMINI_API_KEY: "g" }).primary?.complete(request);
    const tool = (sent.tools as Array<{ functionDeclarations: Array<Record<string, unknown>> }>)[0];
    const contents = sent.contents as Array<{ role: string; parts: Array<Record<string, unknown>> }>;

    expect(tool.functionDeclarations[0]).toMatchObject({
      name: "get_stock_price",
      parameters: { type: "OBJECT", required: ["ticker"] },
    });
    expect(JSON.stringify(tool)).not.toContain("additionalProperties");
    expect(contents).toContainEqual({
      role: "model",
      parts: [{
        functionCall: {
          name: "get_stock_price",
          args: { ticker: "NVDA", market: "US" },
        },
        thoughtSignature: "thought-signature-1",
      }],
    });
    expect(contents).toContainEqual({
      role: "user",
      parts: [{
        functionResponse: {
          name: "get_stock_price",
          response: { status: "ok", price: 178.2 },
          id: "google-call-1",
        },
      }],
    });
    expect(reply?.text).toBe("I checked the market-data source.");
    expect(reply?.toolCalls).toEqual([
      { id: "gemini_call_0", name: "get_stock_price", arguments: '{"ticker":"NVDA","market":"US"}' },
      { id: "gemini_call_1", name: "get_market_status", arguments: "{}" },
    ]);
  });

  it("uses ASSISTANT_MODEL_GEMINI and omits Gemini when its key is missing", () => {
    const withoutKey = createProviderChain({ ASSISTANT_MODEL_GEMINI: "custom-model" });
    const configured = createProviderChain({
      GEMINI_API_KEY: "g",
      ASSISTANT_MODEL_GEMINI: "custom-model",
    });

    expect(withoutKey.primary).toBeNull();
    expect(configured.primary?.name).toBe("gemini");
    expect(configured.primary?.model).toBe("custom-model");
  });

  it("tries OpenAI and then Groq after Gemini rejects the request", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        seen.push(url);
        if (url.includes("generativelanguage.googleapis.com")) return upstreamJson({ error: { status: "UNAUTHENTICATED" } }, 401);
        if (url.includes("api.openai.com")) return upstreamJson({ error: { code: "invalid_api_key" } }, 401);
        return upstreamJson({ choices: [{ message: { content: "Groq answer." } }] });
      }),
    );

    const chain = createProviderChain({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o", GROQ_API_KEY: "r" });
    expect([chain.primary?.name, chain.fallback?.name, chain.tertiary?.name]).toEqual(["gemini", "openai", "groq"]);
    const first = await chain.primary?.complete(request);
    const second = first ?? (await chain.fallback?.complete(request)) ?? (await chain.tertiary?.complete(request));

    expect(second).toMatchObject({ text: "Groq answer.", provider: "groq" });
    expect(seen).toHaveLength(3);
  });

  it("fails closed on malformed, oversized, or unsupported function-call replies", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstreamJson({ candidates: [{ content: { parts: [{ functionCall: { args: {} } }] } }] }))
      .mockResolvedValueOnce(new Response("x".repeat(1_100_000), { status: 200 }))
      .mockResolvedValueOnce(new Response("{not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createProviderChain({ GEMINI_API_KEY: "g" }).primary;
    await expect(provider?.complete(request)).resolves.toBeNull();
    await expect(provider?.complete(request)).resolves.toBeNull();
    await expect(provider?.complete(request)).resolves.toBeNull();
  });

  it("does not expose provider error bodies, keys, or request content in logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorBody = "gemini-secret-test PRIVATE FINANCIAL PROMPT";
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson({ error: { message: errorBody } }, 403)));

    const reply = await createProviderChain({ GEMINI_API_KEY: "gemini-secret-test" }).primary?.complete(request);

    expect(reply).toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain("gemini-secret-test");
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE FINANCIAL PROMPT");
    log.mockRestore();
  });

  it("does not throw for timeout or network errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }));
    const provider = createProviderChain({ GEMINI_API_KEY: "g" }).primary;
    await expect(provider?.complete(request)).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    await expect(provider?.complete(request)).resolves.toBeNull();
  });
});
