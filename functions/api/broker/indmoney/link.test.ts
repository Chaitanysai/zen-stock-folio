import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./link";
import { decryptBrokerToken } from "../../_lib/brokerToken";
import { dailyKey } from "../../_lib/dailyLimit";
import { clearIdentityCache } from "../../_lib/auth";
import { API_ORIGIN, authedRequest, makeEnv, restoreIdentity, stubIdentity, stubUpstreamRoutes } from "../../_lib/testHelpers";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const TOKEN = "tok_1234567890abcdef";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Local in-memory KV: `testHelpers.kvBinding` models the batch FX read and its
 * `put` is a no-op, so it cannot show whether the daily counter moved.
 */
const memoryKv = () => {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
};

const env = (over: Record<string, unknown> = {}) => makeEnv({
  INDSTOCKS_BASE_URL: "https://api.indstocks.test",
  INDSTOCKS_API_KEY: "broker-api-key",
  BROKER_TOKEN_KEY: KEY,
  ...over,
});

const call = (body: unknown, over: Record<string, unknown> = {}) => onRequestPost({
  request: authedRequest(`${API_ORIGIN}/api/broker/indmoney/link`, body),
  env: env(over),
  params: {},
});

beforeEach(() => {
  stubIdentity();
});

afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearIdentityCache();
});

describe("POST /api/broker/indmoney/link", () => {
  it("validates the token with the broker and returns only sealed material", async () => {
    stubUpstreamRoutes([{ match: "/user/profile", body: { data: { user_id: "AB1234" } } }]);

    const before = Date.now();
    const response = await call({ token: TOKEN });
    const after = Date.now();
    expect(response.status).toBe(200);
    const body = await response.json() as { ciphertext: string; iv: string; keyVersion: number; expiresAt: string };

    // Exactly the sealed envelope: an extra (e.g. base64-encoded) field that
    // happened to decode to the token would sail past a `not.toContain` check.
    expect(Object.keys(body).sort()).toEqual(["ciphertext", "expiresAt", "iv", "keyVersion"]);
    expect(body.keyVersion).toBe(1);
    expect(body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(before + DAY_MS - 60_000);
    expect(Date.parse(body.expiresAt)).toBeLessThanOrEqual(after + DAY_MS + 60_000);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(await decryptBrokerToken(body, "user-1", KEY)).toBe(TOKEN);
  });

  it("reports an expired broker token as TOKEN_EXPIRED and stores nothing", async () => {
    stubUpstreamRoutes([{ match: "/user/profile", status: 401, body: { error: "invalid token" } }]);

    const response = await call({ token: TOKEN });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(JSON.stringify(body)).not.toContain("ciphertext");
  });

  it("is disabled until the broker environment exists", async () => {
    const response = await onRequestPost({
      request: authedRequest(`${API_ORIGIN}/api/broker/indmoney/link`, { token: TOKEN }),
      env: makeEnv(),
      params: {},
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
  });

  it("is disabled when only the sealing key is missing", async () => {
    const response = await onRequestPost({
      request: authedRequest(`${API_ORIGIN}/api/broker/indmoney/link`, { token: TOKEN }),
      env: env({ BROKER_TOKEN_KEY: undefined }),
      params: {},
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
  });

  it("is disabled when only the operator API key is missing", async () => {
    const response = await call({ token: TOKEN }, { INDSTOCKS_API_KEY: undefined });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
  });

  it("treats malformed key material as disabled before spending a daily unit", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();
    // 24 bytes, not the required 32. The presence gate alone accepts it.
    const response = await call(
      { token: TOKEN },
      { BROKER_TOKEN_KEY: btoa("a".repeat(24)), PRICE_CACHE },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("rejects a missing or absurd token before calling the broker", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const missing = await call({ token: "" });
    expect(missing.status).toBe(400);
    const huge = await call({ token: "x".repeat(5000) });
    expect(huge.status).toBe(400);
    const wrongType = await call({ token: 42 });
    expect(wrongType.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a verified caller", async () => {
    const response = await onRequestPost({
      request: new Request(`${API_ORIGIN}/api/broker/indmoney/link`, { method: "POST" }),
      env: env(),
      params: {},
    });
    expect(response.status).toBe(401);
  });

  it("caps link attempts per minute", async () => {
    stubUpstreamRoutes([{ match: "/user/profile", body: { data: { user_id: "AB1234" } } }]);

    for (let i = 0; i < 6; i += 1) {
      expect((await call({ token: TOKEN })).status).toBe(200);
    }
    const response = await call({ token: TOKEN });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("refuses once the daily broker budget is spent, without calling the broker", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = {
      get: vi.fn(async () => "20"),
      put: vi.fn(async () => undefined),
    };
    const response = await call({ token: TOKEN }, { PRICE_CACHE });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not spend a daily unit when the deployment is unconfigured", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();
    const response = await call({ token: TOKEN }, { INDSTOCKS_BASE_URL: undefined, PRICE_CACHE });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
    expect(PRICE_CACHE.store.size).toBe(0);
  });

  it("does not spend a daily unit on a malformed, over-long, or oversized body", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    expect((await call({ token: "" }, { PRICE_CACHE })).status).toBe(400);
    expect((await call({ token: 42 }, { PRICE_CACHE })).status).toBe(400);
    // 5001-char paste: under the body cap, over the token cap.
    expect((await call({ token: "x".repeat(5001) }, { PRICE_CACHE })).status).toBe(400);
    // Over the 8 KiB body cap.
    expect((await call({ token: "x".repeat(9000) }, { PRICE_CACHE })).status).toBe(413);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("spends one daily unit when the broker is actually called", async () => {
    stubUpstreamRoutes([{ match: "/user/profile", body: { data: { user_id: "AB1234" } } }]);
    const PRICE_CACHE = memoryKv();

    const response = await call({ token: TOKEN }, { PRICE_CACHE });

    expect(response.status).toBe(200);
    expect(PRICE_CACHE.put).toHaveBeenCalledTimes(1);
    expect(PRICE_CACHE.store.get(dailyKey("user-1"))).toBe("1");
  });

  it("spends one daily unit on a broker-auth rejection, because the call happened", async () => {
    stubUpstreamRoutes([{ match: "/user/profile", status: 401, body: { error: "invalid token" } }]);
    const PRICE_CACHE = memoryKv();

    const response = await call({ token: TOKEN }, { PRICE_CACHE });

    expect(response.status).toBe(409);
    expect(PRICE_CACHE.put).toHaveBeenCalledTimes(1);
    expect(PRICE_CACHE.store.get(dailyKey("user-1"))).toBe("1");
  });

  it("returns 502 and no sealed material when the broker is unreachable", async () => {
    stubUpstreamRoutes([{ match: "/user/profile", status: 500, body: { error: "upstream exploded" } }]);

    const response = await call({ token: TOKEN });
    expect(response.status).toBe(502);
    const body = await response.json() as { code?: string };
    expect(body.code).toBe("BROKER_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });
});
