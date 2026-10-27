// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./news";
import { authedRequest, makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "./_lib/testHelpers";
import { clearRateLimits } from "./_lib/ratelimit";

const URL = "https://zenfolio.pages.dev/api/news";

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearRateLimits();
});

const newsApiBody = {
  status: "ok",
  articles: [
    {
      title: "Reliance Industries profits surge to record high",
      description: "Strong refining margins drive growth",
      url: "https://example.test/reliance-record",
      publishedAt: "2026-10-26T09:00:00Z",
      source: { name: "Economic Times" },
    },
  ],
};

describe("POST /api/news", () => {
  it("requires authentication", async () => {
    const res = await onRequestPost({
      request: new Request(URL, { method: "POST", body: JSON.stringify({ tickers: ["RELIANCE"] }) }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("serves real NewsAPI articles with derived metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("newsapi.org");
      return upstreamJson(newsApiBody);
    }));

    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["reliance.ns"] }),
      env: makeEnv({ NEWS_API_KEY: "news-secret" }),
      params: {},
    });
    const body = (await res.json()) as { source: string; count: number; items: Array<{ ticker: string; sentiment: string; headline: string }> };

    expect(res.status).toBe(200);
    expect(body.source).toBe("newsapi");
    expect(body.count).toBe(1);
    expect(body.items[0].ticker).toBe("RELIANCE");
    expect(body.items[0].sentiment).toBe("positive");
    expect(JSON.stringify(body)).not.toContain("news-secret");
  });

  it("falls back to Finnhub, then reports honest unavailability", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("newsapi.org")) return upstreamJson({}, 500);
      if (url.includes("finnhub.io")) {
        return upstreamJson([{ id: 7, headline: "TCS wins large deal", summary: "Growth continues", url: "https://example.test/tcs", datetime: 1793000000, source: "Reuters" }]);
      }
      return upstreamJson({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["TCS"] }),
      env: makeEnv({ FINNHUB_API_KEY: "f" }),
      params: {},
    });
    const body = (await res.json()) as { source: string; items: Array<{ id: string }> };
    expect(body.source).toBe("finnhub");
    expect(body.items[0].id).toBe("finnhub-7");
  });

  it("never fabricates headlines: 503 when providers fail, Groq never called", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("newsapi.org") || url.includes("finnhub.io")) return upstreamJson({}, 500);
      return upstreamJson({}, 200);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await onRequestPost({
      request: authedRequest(URL, { tickers: ["RELIANCE"] }),
      env: makeEnv({ NEWS_API_KEY: "n", FINNHUB_API_KEY: "f", GROQ_API_KEY: "g" }),
      params: {},
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; items?: unknown };
    expect(body.items).toBeUndefined();
    // The fabricated-headlines fallback is gone — no LLM endpoint contacted.
    expect(fetchMock.mock.calls.every((call) => !String(call[0]).includes("api.groq.com"))).toBe(true);
  });

  it("caps tickers at 10 and rejects oversized input", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson(newsApiBody)));

    const tooMany = await onRequestPost({
      request: authedRequest(URL, { tickers: Array.from({ length: 11 }, (_, i) => `T${i}`) }),
      env: makeEnv(),
      params: {},
    });
    expect(tooMany.status).toBe(400);

    const oversized = new Request(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good-token" },
      body: JSON.stringify({ tickers: ["X".repeat(5000)] }),
    });
    const res = await onRequestPost({ request: oversized, env: makeEnv(), params: {} });
    expect(res.status).toBe(413);
  });
});
