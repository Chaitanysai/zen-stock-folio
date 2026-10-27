// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onRequestGet } from "./market";
import {
  API_ORIGIN,
  kvBinding,
  makeEnv,
  restoreIdentity,
  stubIdentity,
  stubUpstreamRoutes,
} from "./_lib/testHelpers";
import { resetMarketCache } from "./_lib/marketCache";

const URL = `${API_ORIGIN}/api/market`;

const indexBody = (price: number, prevClose: number) => ({
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: price,
          chartPreviousClose: prevClose,
          regularMarketTime: Math.floor(Date.now() / 1000) - 300,
        },
      },
    ],
  },
});

const happyRoutes = [
  { match: "%5ENSEI", body: indexBody(24_000, 23_800) },
  { match: "%5EBSESN", body: indexBody(79_000, 78_500) },
  { match: "%5ENSEBANK", body: indexBody(51_000, 50_800) },
];

const get = (query = "", token = "good-token"): Request =>
  new Request(query ? `${URL}?${query}` : URL, { headers: { Authorization: `Bearer ${token}` } });

beforeEach(() => {
  stubIdentity("user-1");
  resetMarketCache();
});
afterEach(() => {
  restoreIdentity();
  resetMarketCache();
});

describe("GET /api/market", () => {
  it("requires authentication (401 without a bearer token)", async () => {
    stubUpstreamRoutes([]);
    const res = await onRequestGet({
      request: new Request(URL),
      env: makeEnv(),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("refuses unverified identities (403)", async () => {
    stubIdentity("user-1", false);
    stubUpstreamRoutes([]);
    const res = await onRequestGet({ request: get(), env: makeEnv(), params: {} });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Email verification required");
  });

  it("returns the index strip with the weakest freshness label", async () => {
    stubUpstreamRoutes(happyRoutes);
    const res = await onRequestGet({ request: get(), env: makeEnv(), params: {} });
    const body = (await res.json()) as {
      indices: Array<{ label: string; providerSymbol: string; price: number | null; previousClose: number | null; exchangeTimestamp: string | null }>;
      provider: string;
      dataMode: string;
      fetchedAt: string;
      cached: boolean;
      stale: boolean;
      warnings: string[];
    };

    expect(res.status).toBe(200);
    expect(body.indices).toHaveLength(3);
    expect(body.indices[0].label).toBe("NIFTY 50");
    expect(body.indices[0].price).toBe(24_000);
    expect(body.indices[0].previousClose).toBe(23_800);
    expect(typeof body.indices[0].exchangeTimestamp).toBe("string");
    expect(body.provider).toBe("yahoo");
    expect(["realtime", "delayed", "eod"]).toContain(body.dataMode);
    expect(body.cached).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.warnings).toEqual([]);
  });

  it("keeps a failed index as a null-priced row with a warning (never dropped, never fabricated)", async () => {
    stubUpstreamRoutes([
      { match: "%5ENSEI", body: indexBody(24_000, 23_800) },
      { match: "%5EBSESN", status: 500, body: {} },
      { match: "%5ENSEBANK", body: indexBody(51_000, 50_800) },
    ]);
    const res = await onRequestGet({ request: get(), env: makeEnv(), params: {} });
    const body = (await res.json()) as { indices: Array<{ label: string; price: number | null }>; warnings: string[] };
    expect(res.status).toBe(200);
    expect(body.indices).toHaveLength(3);
    const sensex = body.indices.find((i) => i.label === "SENSEX");
    expect(sensex?.price).toBeNull();
    expect(body.warnings.some((w) => w.includes("SENSEX"))).toBe(true);
  });

  it("fails closed with 502 when NO index could be served", async () => {
    stubUpstreamRoutes([
      { match: "query1.finance.yahoo.com", status: 500, body: {} },
    ]);
    const res = await onRequestGet({ request: get(), env: makeEnv(), params: {} });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string; indices?: unknown };
    expect(body.code).toBe("provider_unavailable");
    expect(body.indices).toBeUndefined(); // never a strip of nulls that looks like "no data"
  });

  it("serves the second request from the 30 s per-isolate cache; refresh=1 bypasses it", async () => {
    const fetchMock = stubUpstreamRoutes(happyRoutes);
    const env = makeEnv();

    await onRequestGet({ request: get(), env, params: {} });
    const second = await onRequestGet({ request: get(), env, params: {} });
    const secondBody = (await second.json()) as { cached: boolean };
    expect(fetchMock).toHaveBeenCalledTimes(3); // 3 indices, once
    expect(secondBody.cached).toBe(true);

    const refreshed = await onRequestGet({ request: get("refresh=1"), env, params: {} });
    const refreshedBody = (await refreshed.json()) as { cached: boolean };
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(refreshedBody.cached).toBe(false);
  });

  it("rate-limits per user at 30/min", async () => {
    stubUpstreamRoutes(happyRoutes);
    const env = makeEnv();
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await onRequestGet({ request: get(`bust=${i}`), env, params: {} });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });

  it("never echoes secrets or env values", async () => {
    stubUpstreamRoutes(happyRoutes);
    const res = await onRequestGet({
      request: get(),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token" }),
      params: {},
    });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("upstox-secret-token");
    expect(text).not.toContain("test-api-key");
  });

  it("degrades gracefully without a KV binding (no cache layer required)", async () => {
    stubUpstreamRoutes(happyRoutes);
    const res = await onRequestGet({ request: get(), env: { ...makeEnv(), PRICE_CACHE: kvBinding() } as never, params: {} });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { indices: unknown[] };
    expect(body.indices).toHaveLength(3);
  });
});
