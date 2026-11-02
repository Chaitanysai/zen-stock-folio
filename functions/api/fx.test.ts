// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./fx";
import { API_ORIGIN, authedRequest, kvBinding, makeEnv, restoreIdentity, stubIdentity, stubUpstreamRoutes } from "./_lib/testHelpers";

beforeEach(() => {
  stubIdentity();
});

afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
});

const fxBody = {
  chart: { result: [{ meta: { symbol: "USDINR=X", regularMarketPrice: 84.25, regularMarketTime: 1793008688 } }], error: null },
};

const fxBodyWithoutTimestamp = {
  chart: { result: [{ meta: { symbol: "USDINR=X", regularMarketPrice: 84.25 } }], error: null },
};

/** The provider stamp for `regularMarketTime: 1793008688`. */
const FX_AS_OF = new Date(1793008688 * 1000).toISOString();

describe("GET /api/fx", () => {
  it("requires authentication", async () => {
    const response = await onRequestGet({
      request: new Request(`${API_ORIGIN}/api/fx`),
      env: makeEnv(),
      params: {},
    });
    expect(response.status).toBe(401);
  });

  it("returns a fresh rate stamped with the provider's observation time", async () => {
    stubUpstreamRoutes([{ match: "USDINR=X", body: fxBody }]);
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx`, undefined, "good-token", "GET"),
      env: makeEnv({ PRICE_CACHE: kvBinding() }),
      params: {},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { rate: number; asOf: string | null; stale: boolean; provider: string };
    expect(body).toMatchObject({ rate: 84.25, asOf: FX_AS_OF, stale: false, provider: "yahoo" });
  });

  it("returns asOf: null and stale: true when the provider supplies no observation time", async () => {
    stubUpstreamRoutes([{ match: "USDINR=X", body: fxBodyWithoutTimestamp }]);
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx`, undefined, "good-token", "GET"),
      env: makeEnv({ PRICE_CACHE: kvBinding() }),
      params: {},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { rate: number; asOf: string | null; stale: boolean };
    expect(body).toMatchObject({ rate: 84.25, asOf: null, stale: true });
  });

  it("writes the fresh rate to KV with a 900-second TTL", async () => {
    stubUpstreamRoutes([{ match: "USDINR=X", body: fxBody }]);
    const cache = kvBinding();
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx`, undefined, "good-token", "GET"),
      env: makeEnv({ PRICE_CACHE: cache }),
      params: {},
    });

    expect(response.status).toBe(200);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const call = cache.put.mock.calls[0];
    expect(call?.[0]).toBe("fx:USDINR");
    expect(call?.[2]).toEqual({ expirationTtl: 900 });
    expect(JSON.parse(String(call?.[1]))).toMatchObject({ rate: 84.25, asOf: FX_AS_OF });
  });

  it("rejects a pair other than USD→INR with 400 invalid_pair", async () => {
    const upstream = stubUpstreamRoutes([{ match: "USDINR=X", body: fxBody }]);
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx?base=EUR&quote=INR`, undefined, "good-token", "GET"),
      env: makeEnv({ PRICE_CACHE: kvBinding() }),
      params: {},
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("invalid_pair");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves a stale cached rate when the provider fails, preserving the cached asOf", async () => {
    stubUpstreamRoutes([{ match: "USDINR=X", status: 500, body: {} }]);
    const cached = { rate: 83.5, asOf: "2026-11-01T04:00:00.000Z", fetchedAt: "2026-11-01T04:00:00.000Z" };
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx`, undefined, "good-token", "GET"),
      env: makeEnv({ PRICE_CACHE: kvBinding({ "fx:USDINR": cached }) }),
      params: {},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { rate: number; asOf: string | null; stale: boolean; provider: string };
    expect(body).toMatchObject({
      rate: 83.5,
      asOf: "2026-11-01T04:00:00.000Z",
      stale: true,
      provider: "cache",
    });
  });

  it("preserves a null cached asOf on the cache fallback", async () => {
    stubUpstreamRoutes([{ match: "USDINR=X", status: 500, body: {} }]);
    const cached = { rate: 83.5, asOf: null, fetchedAt: "2026-11-01T04:00:00.000Z" };
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx`, undefined, "good-token", "GET"),
      env: makeEnv({ PRICE_CACHE: kvBinding({ "fx:USDINR": cached }) }),
      params: {},
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { rate: number; asOf: string | null; stale: boolean; provider: string };
    expect(body).toMatchObject({ rate: 83.5, asOf: null, stale: true, provider: "cache" });
  });

  it("fails closed with 502 when there is no rate anywhere", async () => {
    stubUpstreamRoutes([{ match: "USDINR=X", status: 500, body: {} }]);
    const response = await onRequestGet({
      request: authedRequest(`${API_ORIGIN}/api/fx`, undefined, "good-token", "GET"),
      env: makeEnv(),
      params: {},
    });
    expect(response.status).toBe(502);
  });
});
