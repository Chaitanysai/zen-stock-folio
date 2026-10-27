// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./health";
import {
  API_ORIGIN,
  kvBinding,
  makeEnv,
  restoreIdentity,
  stubIdentity,
  stubUpstreamRoutes,
} from "./_lib/testHelpers";

const URL = `${API_ORIGIN}/api/health`;

const quoteBody = (price: number, prevClose: number) => ({
  chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prevClose } }] },
});

const deepHappyRoutes = [
  { match: "identitytoolkit.googleapis.com", status: 400, body: { error: { message: "INVALID_ID_TOKEN" } } },
  {
    match: "api.upstox.com",
    body: { data: { "NSE_EQ:INE002A01018": { last_price: 2501, ohlc: { close: 2451 }, volume: 100 } } },
  },
  { match: "query1.finance.yahoo.com", body: quoteBody(2501, 2450) },
  { match: "api.twelvedata.com", body: { data: [{ symbol: "RELIANCE" }] } },
];

const get = (query = "", token = "good-token"): Request => {
  const target = query ? `${URL}?${query}` : URL;
  return new Request(target, { headers: { Authorization: `Bearer ${token}` } });
};

interface Envelope {
  state: string;
  latencyMs: number | null;
  detail: string;
  facts: Record<string, unknown>;
}
interface HealthBody {
  generatedAt: string;
  integrations: Array<{ id: string; state: string; requiredEnv: string[]; configuredEnv: string[]; detail: string } & Envelope>;
  summary: string;
}

beforeEach(() => stubIdentity("user-1"));
afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
});

const byId = (body: HealthBody, id: string) => body.integrations.find((i) => i.id === id);

describe("GET /api/health", () => {
  it("requires authentication (401 without a bearer token)", async () => {
    stubUpstreamRoutes([]);
    const res = await onRequestGet({ request: new Request(URL), env: makeEnv(), params: {} });
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

  it("shallow mode performs no upstream calls and never echoes env values", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const res = await onRequestGet({
      request: get(),
      env: makeEnv({ GROQ_API_KEY: "groq-secret-value" }),
      params: {},
    });
    const body = (await res.json()) as HealthBody;
    const text = JSON.stringify(body);

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled(); // diagnostics only
    expect(body.generatedAt).toBeTruthy();
    expect(body.summary).toBe("connected");

    const identity = byId(body, "firebase-identity");
    expect(identity?.requiredEnv).toEqual(["FIREBASE_API_KEY"]); // NAMES only
    expect(identity?.configuredEnv).toEqual(["FIREBASE_API_KEY"]);
    expect(identity?.detail).not.toContain("test-api-key");

    const groq = byId(body, "groq");
    expect(groq?.state).toBe("connected");
    expect(groq?.configuredEnv).toEqual(["GROQ_API_KEY"]);
    expect(text).not.toContain("groq-secret-value");
    expect(text).not.toContain("test-api-key");

    const groupIds = body.integrations.map((i) => i.id);
    for (const id of ["yahoo-chart", "upstox-market-quote", "upstox-instrument-master", "price-cache-kv", "firebase-identity", "twelvedata-directory", "newsapi", "finnhub", "groq", "openrouter"]) {
      expect(groupIds).toContain(id);
    }
  });

  it("deep mode probes every configured integration and reports connected", async () => {
    stubUpstreamRoutes(deepHappyRoutes);
    const res = await onRequestGet({
      request: get("deep=1"),
      env: makeEnv({ UPSTOX_ACCESS_TOKEN: "upstox-secret-token", PRICE_CACHE: kvBinding() as never }),
      params: {},
    });
    const body = (await res.json()) as HealthBody;
    expect(res.status).toBe(200);
    expect(byId(body, "yahoo-chart")?.state).toBe("connected");
    expect(byId(body, "upstox-market-quote")?.state).toBe("connected");
    expect(byId(body, "firebase-identity")?.state).toBe("connected");
    expect(byId(body, "twelvedata-directory")?.state).toBe("connected");
    expect(byId(body, "price-cache-kv")?.state).toBe("connected");
    expect(body.summary).toBe("connected");
    // No secret ever appears, and the Firebase key is never echoed.
    const text = JSON.stringify(body);
    expect(text).not.toContain("upstox-secret-token");
    expect(text).not.toContain("test-api-key");
  });

  it("deep mode degrades gracefully: probe failures become `degraded`, never a 5xx", async () => {
    stubUpstreamRoutes([
      { match: "identitytoolkit.googleapis.com", status: 500, body: {} },
      { match: "api.upstox.com", status: 500, body: {} },
      { match: "query1.finance.yahoo.com", status: 500, body: {} },
      { match: "api.twelvedata.com", status: 500, body: {} },
    ]);
    const res = await onRequestGet({ request: get("deep=1"), env: makeEnv(), params: {} });
    const body = (await res.json()) as HealthBody;

    expect(res.status).toBe(200); // diagnostics survive a provider outage
    expect(byId(body, "yahoo-chart")?.state).toBe("degraded");
    expect(byId(body, "upstox-market-quote")?.state).toBe("unconfigured"); // no token set
    expect(byId(body, "firebase-identity")?.state).toBe("degraded");
    expect(byId(body, "twelvedata-directory")?.state).toBe("degraded");
    expect(byId(body, "price-cache-kv")?.state).toBe("unconfigured"); // no binding
    expect(body.summary).toBe("degraded");
  });

  it("flags a rejected API key as degraded rather than connected", async () => {
    stubUpstreamRoutes([
      {
        match: "identitytoolkit.googleapis.com",
        status: 400,
        body: { error: { message: "API key not valid. Please pass a valid API key." } },
      },
    ]);
    const res = await onRequestGet({ request: get("deep=1"), env: makeEnv(), params: {} });
    const body = (await res.json()) as HealthBody;
    expect(byId(body, "firebase-identity")?.state).toBe("degraded");
  });

  it("rate-limits per user at 10/min", async () => {
    stubUpstreamRoutes([]);
    const env = makeEnv();
    let last: Response | null = null;
    for (let i = 0; i < 20; i++) {
      last = await onRequestGet({ request: get(`bust=${i}`), env, params: {} });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });
});
