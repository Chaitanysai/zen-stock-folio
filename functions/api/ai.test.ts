// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./ai";
import { authedRequest, makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "./_lib/testHelpers";
import { clearRateLimits } from "./_lib/ratelimit";

const URL = "https://zenfolio.pages.dev/api/ai";

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearRateLimits();
});

const chatRequest = (env: Record<string, unknown> = {}) =>
  onRequestPost({
    request: authedRequest(URL, {
      type: "chat",
      messages: [{ role: "user", content: "How is my portfolio doing?" }],
      portfolioContext: "Invested ₹100,000; P&L +8%.",
    }),
    env: makeEnv(env),
    params: {},
  });

describe("POST /api/ai", () => {
  it("requires authentication (no open LLM proxy)", async () => {
    const res = await onRequestPost({
      request: new Request(URL, { method: "POST", body: JSON.stringify({ type: "chat", messages: [] }) }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("serves Groq first and returns the preserved contract", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("api.groq.com");
      return upstreamJson({ choices: [{ message: { content: "You are up 8%." } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await chatRequest({ GROQ_API_KEY: "groq-secret" });
    const body = (await res.json()) as { response: string; insights: string; source: string };

    expect(res.status).toBe(200);
    expect(body.response).toBe("You are up 8%.");
    expect(body.insights).toBe("You are up 8%.");
    expect(body.source).toBe("groq");
    expect(JSON.stringify(body)).not.toContain("groq-secret");
  });

  it("falls back to OpenRouter when Groq is rate-limited on both models", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.groq.com")) return upstreamJson({ error: { message: "rate" } }, 429);
      return upstreamJson({ choices: [{ message: { content: "From OpenRouter." } }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await chatRequest({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" });
    const body = (await res.json()) as { source: string; response: string };
    expect(body.source).toBe("openrouter");
    expect(body.response).toBe("From OpenRouter.");
  });

  it("returns 503 when the whole finite chain fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson({}, 500)));
    const res = await chatRequest({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" });
    expect(res.status).toBe(503);
  });

  it("enforces input bounds and stops after a bounded number of attempts", async () => {
    const fetchMock = vi.fn(async () => upstreamJson({}, 500));
    vi.stubGlobal("fetch", fetchMock);
    await chatRequest({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" });
    // 2 Groq models + 2 OpenRouter models — the chain is finite.
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const oversizedContext = await onRequestPost({
      request: authedRequest(URL, {
        type: "analysis",
        portfolioContext: "x".repeat(17_000),
      }),
      env: makeEnv({ GROQ_API_KEY: "g" }),
      params: {},
    });
    expect(oversizedContext.status).toBe(400);
  });

  it("rate-limits at 10/min per user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson({ choices: [{ message: { content: "ok" } }] })));
    const env = makeEnv({ GROQ_API_KEY: "g" });
    let last: Response | null = null;
    for (let i = 0; i < 12; i++) {
      last = await chatRequest({ GROQ_API_KEY: "g" });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    void env;
  });
});
