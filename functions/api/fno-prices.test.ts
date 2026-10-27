// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./fno-prices";
import { authedRequest, makeEnv, restoreIdentity, stubIdentity, upstreamJson } from "./_lib/testHelpers";
import { clearRateLimits } from "./_lib/ratelimit";

const URL = "https://zenfolio.pages.dev/api/fno-prices";

const ceTrade = {
  id: "trade-1",
  symbol: "NIFTY",
  instrumentType: "CE",
  strike: 25000,
  expiry: "27-11-2026",
  lotSize: 75,
  lots: 1,
};

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearRateLimits();
});

describe("POST /api/fno-prices", () => {
  it("requires authentication", async () => {
    const res = await onRequestPost({
      request: new Request(URL, { method: "POST", body: JSON.stringify({ trades: [ceTrade] }) }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("fetches option premiums from Upstox with correctly built instrument keys", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("NFO_OPT%7CNIFTY%7C2026-11-27%7C25000%7CCE");
      return upstreamJson({
        status: "success",
        data: { "NFO_OPT:NIFTY:2026-11-27:25000:CE": { last_price: 120.5, ohlc: { close: 110 }, option_greeks: { iv: 12.5, delta: 0.42 }, oi: 1000 } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await onRequestPost({
      request: authedRequest(URL, { trades: [ceTrade] }),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const body = (await res.json()) as { ltpMap: Record<string, { ltp: number; iv?: number }>; source: string };

    expect(res.status).toBe(200);
    expect(body.source).toBe("upstox-nfo");
    expect(body.ltpMap["trade-1"].ltp).toBe(120.5);
    expect(body.ltpMap["trade-1"].iv).toBe(12.5);
    expect(JSON.stringify(body)).not.toContain("upstox-secret-token");
  });

  it("falls back to Yahoo spot for futures only", async () => {
    const futTrade = { id: "fut-1", symbol: "NIFTY", instrumentType: "FUT", expiry: "27-11-2026", lotSize: 75, lots: 1 };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.upstox.com")) return upstreamJson({ status: "error" }, 200);
      expect(url).toContain("v7/finance/quote");
      return upstreamJson({ quoteResponse: { result: [{ symbol: "NIFTY.NS", regularMarketPrice: 25010, regularMarketPreviousClose: 24900 }] } });
    }));

    const res = await onRequestPost({
      request: authedRequest(URL, { trades: [futTrade, ceTrade] }),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "t" }),
      params: {},
    });
    const body = (await res.json()) as { source: string; ltpMap: Record<string, { ltp: number }> };
    expect(body.source).toBe("yahoo-spot-futures-only");
    expect(body.ltpMap["fut-1"].ltp).toBe(25010);
    expect(body.ltpMap["trade-1"]).toBeUndefined(); // options never get a spot price
  });

  it("validates the trades schema", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const bad = await onRequestPost({
      request: authedRequest(URL, { trades: [{ id: "x", symbol: "NIFTY!!", instrumentType: "ZZ", expiry: "27-11-2026", lotSize: 75, lots: 1 }] }),
      env: makeEnv(),
      params: {},
    });
    expect(bad.status).toBe(400);

    const tooMany = await onRequestPost({
      request: authedRequest(URL, { trades: Array.from({ length: 51 }, (_, i) => ({ ...ceTrade, id: `t${i}` })) }),
      env: makeEnv(),
      params: {},
    });
    expect(tooMany.status).toBe(400);
  });

  it("returns 503 when no provider can serve", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => upstreamJson({ status: "error" }, 200)));
    const res = await onRequestPost({
      request: authedRequest(URL, { trades: [ceTrade] }),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(503);
  });
});
