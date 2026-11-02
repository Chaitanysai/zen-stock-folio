import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestOptions, onRequestPost } from "./sync";
import { encryptBrokerToken } from "../../_lib/brokerToken";
import { clearIdentityCache } from "../../_lib/auth";
import { dailyKey } from "../../_lib/dailyLimit";
import { encodeFields } from "../../_lib/firestore";
import { API_ORIGIN, authedRequest, makeEnv, restoreIdentity, stubIdentity, stubUpstreamRoutes } from "../../_lib/testHelpers";
import { holdingsFixture } from "../../_lib/__fixtures__/indstocks/holdings";
import { tradeBookFixture } from "../../_lib/__fixtures__/indstocks/tradeBook";
import type { PortfolioSnapshot } from "../../../../src/lib/data/snapshotTypes.ts";
import type { PortfolioStock } from "../../../../src/data/sampleData.ts";

const KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const TOKEN = "tok_1234567890abcdef";
const PREVIEWED_AT = "2026-11-01T00:00:00.000Z";
const COMMITTED_AT = "2026-11-01T01:00:00.000Z";

/** Local in-memory KV: `testHelpers.kvBinding` cannot show whether a counter moved. */
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
  FIREBASE_PROJECT_ID: "demo-project",
  INDSTOCKS_BASE_URL: "https://api.indstocks.test",
  INDSTOCKS_API_KEY: "broker-api-key",
  BROKER_TOKEN_KEY: KEY,
  ...over,
});

const emptySnapshot: PortfolioSnapshot = {
  stocks: [],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
  executions: [],
};

const portfolioDoc = (snapshot: PortfolioSnapshot, updateTime = PREVIEWED_AT) => ({
  fields: encodeFields({ uid: "user-1", snapshot }),
  updateTime,
});

const committed = { writeResults: [{ updateTime: COMMITTED_AT }] };

const happyRoutes = (read: unknown) => [
  { match: "/portfolio/holdings", body: holdingsFixture },
  { match: "/trade-book", body: tradeBookFixture },
  { match: "/documents/portfolios/user-1", body: read },
  { match: ":commit", body: committed },
];

const postSync = (body: unknown, over: Record<string, unknown> = {}) =>
  onRequestPost({
    request: authedRequest(`${API_ORIGIN}/api/broker/indmoney/sync`, body),
    env: env(over),
    params: {},
  });

const call = async (body: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  postSync({ ...(await encryptBrokerToken(TOKEN, "user-1", KEY)), ...body }, over);

const commitCalls = (mock: ReturnType<typeof stubUpstreamRoutes>) =>
  mock.mock.calls.filter(([input]) => String(input).includes(":commit"));

/** The single write body from the commit call the route made. */
const commitWrite = (mock: ReturnType<typeof stubUpstreamRoutes>) => {
  const [call] = commitCalls(mock);
  const init = (call as unknown as [unknown, RequestInit])[1];
  return JSON.parse(String(init.body)).writes[0] as {
    currentDocument: unknown;
    updateMask: { fieldPaths: string[] };
  };
};

const manualRow = (index: number): PortfolioStock => ({
  ticker: `M${index}`,
  stockName: `Manual ${index}`,
  entryDate: "01-Jan-2026",
  entryPrice: 100,
  cmp: 100,
  quantity: 1,
  status: "Active",
});

const syncedRow: PortfolioStock = {
  ticker: "RELIANCE",
  stockName: "Reliance",
  entryDate: "10-Jan-2026",
  entryPrice: 2450,
  cmp: 2612,
  weekHigh52: 2800,
  quantity: 15,
  status: "Active",
  market: "NSE",
  currency: "INR",
  source: "indmoney",
};

beforeEach(() => {
  stubIdentity();
});

afterEach(() => {
  restoreIdentity();
  vi.unstubAllGlobals();
  clearIdentityCache();
});

describe("POST /api/broker/indmoney/sync", () => {
  it("previews the diff without leaking the token or returning the next snapshot", async () => {
    const mock = stubUpstreamRoutes(happyRoutes(portfolioDoc(emptySnapshot)));

    const response = await call({ mode: "preview" });
    expect(response.status).toBe(200);

    const body = await response.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "closedPositions",
      "conflicts",
      "executionsAdded",
      "executionsSeen",
      "generatedAt",
      "holdingsSeen",
      "mode",
      "openPositions",
      "provider",
      "requiresEmptyConfirmation",
      "snapshotUpdateTime",
      "unchangedPositions",
      "unmatched",
      "warnings",
    ]);
    expect(body).toMatchObject({
      mode: "preview",
      provider: "indmoney",
      holdingsSeen: 2,
      executionsSeen: 2,
      executionsAdded: 2,
      requiresEmptyConfirmation: false,
      snapshotUpdateTime: PREVIEWED_AT,
    });
    expect(body.nextSnapshot).toBeUndefined();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("ciphertext");
    // A preview must never write.
    expect(commitCalls(mock)).toHaveLength(0);
  });

  it("applies with the previewed updateTime as a compare-and-set precondition", async () => {
    const mock = stubUpstreamRoutes(happyRoutes(portfolioDoc(emptySnapshot)));

    const response = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "apply",
      provider: "indmoney",
      appliedAt: expect.any(String),
      openPositions: 2,
      closedPositions: 0,
      executions: 2,
      snapshotUpdateTime: COMMITTED_AT,
    });

    const write = commitWrite(mock);
    expect(write.currentDocument).toEqual({ updateTime: PREVIEWED_AT });
    expect(write.updateMask.fieldPaths).toEqual(["uid", "snapshot"]);
  });

  it("writes nothing when the snapshot changed after the preview", async () => {
    const mock = stubUpstreamRoutes(happyRoutes(portfolioDoc(emptySnapshot)));

    const response = await call({ mode: "apply", baseUpdateTime: "2026-10-01T00:00:00.000Z" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SNAPSHOT_CHANGED" });
    expect(commitCalls(mock)).toHaveLength(0);
  });

  it("requires baseUpdateTime before doing any work", async () => {
    const mock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    const response = await call({ mode: "apply" }, { PRICE_CACHE });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "MISSING_BASE_UPDATE_TIME" });
    expect(mock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("rejects unreadable sealed material before calling the broker or Firestore", async () => {
    const mock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    const response = await call(
      { mode: "preview", ciphertext: "AAAA", iv: "AAAA", keyVersion: 1 },
      { PRICE_CACHE },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_CIPHERTEXT" });
    expect(mock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("maps an expired broker token to TOKEN_EXPIRED and writes nothing", async () => {
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", status: 401, body: {} },
      { match: "/trade-book", status: 401, body: {} },
      { match: "/documents/portfolios/user-1", body: portfolioDoc(emptySnapshot) },
      { match: ":commit", body: committed },
    ]);

    const response = await call({ mode: "preview" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(commitCalls(mock)).toHaveLength(0);
  });

  it("will not wipe synced positions without explicit confirmation", async () => {
    const synced: PortfolioSnapshot = { ...emptySnapshot, stocks: [syncedRow] };
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: { data: [] } },
      { match: "/trade-book", body: { data: { trades: [] } } },
      { match: "/documents/portfolios/user-1", body: portfolioDoc(synced) },
      { match: ":commit", body: committed },
    ]);

    // The preview itself reports the flag the browser must surface.
    const preview = await call({ mode: "preview" });
    expect(await preview.json()).toMatchObject({ requiresEmptyConfirmation: true });

    const refused = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "EMPTY_HOLDINGS_CONFIRMATION_REQUIRED" });
    expect(commitCalls(mock)).toHaveLength(0);

    const confirmed = await call({
      mode: "apply",
      baseUpdateTime: PREVIEWED_AT,
      confirmEmpty: true,
    });
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({ openPositions: 1, closedPositions: 0 });
    expect(commitCalls(mock)).toHaveLength(1);
  });

  it("is disabled until the broker and Firestore environment exists", async () => {
    const response = await onRequestPost({
      request: authedRequest(`${API_ORIGIN}/api/broker/indmoney/sync`, { mode: "preview" }),
      env: makeEnv(),
      params: {},
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
  });

  it("requires a verified caller", async () => {
    const response = await onRequestPost({
      request: new Request(`${API_ORIGIN}/api/broker/indmoney/sync`, { method: "POST" }),
      env: env(),
      params: {},
    });
    expect(response.status).toBe(401);
  });

  it("does not spend a daily unit when the deployment is unconfigured", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    const response = await call({ mode: "preview" }, { INDSTOCKS_BASE_URL: undefined, PRICE_CACHE });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
    expect(PRICE_CACHE.store.size).toBe(0);
  });

  it("is disabled when only the Firestore project is missing, without spending a unit", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    const response = await call({ mode: "preview" }, { FIREBASE_PROJECT_ID: undefined, PRICE_CACHE });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("treats malformed key material as disabled before spending a daily unit", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    // 24 bytes, not the required 32: the presence gate alone accepts it.
    const response = await call(
      { mode: "preview" },
      { BROKER_TOKEN_KEY: btoa("a".repeat(24)), PRICE_CACHE },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "BROKER_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("rejects an unknown mode or a non-string baseUpdateTime without spending a unit", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = memoryKv();

    const badMode = await call({ mode: "delete" }, { PRICE_CACHE });
    expect(badMode.status).toBe(400);
    expect(await badMode.json()).toMatchObject({ code: "INVALID_REQUEST" });

    const badBase = await call({ mode: "apply", baseUpdateTime: 42 }, { PRICE_CACHE });
    expect(badBase.status).toBe(400);
    expect(await badBase.json()).toMatchObject({ code: "INVALID_REQUEST" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(PRICE_CACHE.put).not.toHaveBeenCalled();
  });

  it("refuses once the daily broker budget is spent, without calling the broker", async () => {
    const fetchMock = stubUpstreamRoutes([]);
    const PRICE_CACHE = {
      get: vi.fn(async () => "20"),
      put: vi.fn(async () => undefined),
    };

    const response = await call({ mode: "preview" }, { PRICE_CACHE });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps sync attempts per minute", async () => {
    stubUpstreamRoutes(happyRoutes(portfolioDoc(emptySnapshot)));

    for (let i = 0; i < 6; i += 1) {
      expect((await call({ mode: "preview" })).status).toBe(200);
    }
    const response = await call({ mode: "preview" });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("creates the document with exists:false when the caller previewed against a missing snapshot", async () => {
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: holdingsFixture },
      { match: "/trade-book", body: tradeBookFixture },
      { match: "/documents/portfolios/user-1", status: 404, body: {} },
      { match: ":commit", body: committed },
    ]);

    const created = await call({ mode: "apply", baseUpdateTime: null });
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({ snapshotUpdateTime: COMMITTED_AT });

    expect(commitCalls(mock)).toHaveLength(1);
    expect(commitWrite(mock).currentDocument).toEqual({ exists: false });

    // A client that claims a version for a document that does not exist is stale.
    const stale = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "SNAPSHOT_CHANGED" });
  });

  it("maps a lost compare-and-set to SNAPSHOT_CHANGED", async () => {
    stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: holdingsFixture },
      { match: "/trade-book", body: tradeBookFixture },
      { match: "/documents/portfolios/user-1", body: portfolioDoc(emptySnapshot) },
      { match: ":commit", status: 412, body: { error: { status: "FAILED_PRECONDITION" } } },
    ]);

    const response = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SNAPSHOT_CHANGED" });
  });

  it("reports a failed write as SNAPSHOT_WRITE_FAILED", async () => {
    stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: holdingsFixture },
      { match: "/trade-book", body: tradeBookFixture },
      { match: "/documents/portfolios/user-1", body: portfolioDoc(emptySnapshot) },
      { match: ":commit", status: 500, body: {} },
    ]);

    const response = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(response.status).toBe(502);
    const body = await response.json() as { code?: string; error?: string };
    expect(body.code).toBe("SNAPSHOT_WRITE_FAILED");
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("reports an unreadable snapshot as SNAPSHOT_UNAVAILABLE and writes nothing", async () => {
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: holdingsFixture },
      { match: "/trade-book", body: tradeBookFixture },
      { match: "/documents/portfolios/user-1", status: 500, body: {} },
      { match: ":commit", body: committed },
    ]);

    const response = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "SNAPSHOT_UNAVAILABLE" });
    expect(commitCalls(mock)).toHaveLength(0);
  });

  it("maps an unreachable broker to BROKER_UNAVAILABLE without reading the snapshot", async () => {
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", status: 500, body: {} },
      { match: "/trade-book", status: 500, body: {} },
    ]);

    const response = await call({ mode: "preview" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "BROKER_UNAVAILABLE" });
    expect(mock.mock.calls.some(([input]) => String(input).includes("/documents/"))).toBe(false);
  });

  it("maps a broker contract break to BROKER_CONTRACT", async () => {
    stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: { data: { holdings: "not-a-list" } } },
      { match: "/trade-book", body: tradeBookFixture },
    ]);

    const response = await call({ mode: "preview" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "BROKER_CONTRACT" });
  });

  it("refuses a plan over the storage limit before the empty-holdings guard", async () => {
    // 1001 manual rows plus one synced open row: the plan both overflows the
    // stock limit and would remove the synced position, so the panic guards
    // would overlap. The limit must win, and neither may write.
    const manual = Array.from({ length: 1001 }, (_, index) => manualRow(index));
    const crowded: PortfolioSnapshot = { ...emptySnapshot, stocks: [...manual, syncedRow] };
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: { data: [] } },
      { match: "/trade-book", body: { data: { trades: [] } } },
      { match: "/documents/portfolios/user-1", body: portfolioDoc(crowded) },
      { match: ":commit", body: committed },
    ]);

    const response = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SNAPSHOT_LIMIT_EXCEEDED" });
    expect(commitCalls(mock)).toHaveLength(0);
  });

  it("refuses a stored snapshot whose encoded write exceeds the 1 MiB cap", async () => {
    // 9 990 stored fills with long ids stay inside the 10 000-execution schema
    // bound, but the encoded document is several MiB once the broker's two
    // fills are merged in. Firestore's cap, not the schema bound, must answer.
    const heavyExecution = (index: number) => ({
      id: `indmoney:${index}:${"x".repeat(180)}`,
      source: "indmoney" as const,
      market: "NSE" as const,
      ticker: "RELIANCE",
      side: "BUY" as const,
      quantity: 1,
      price: 100,
      executedAt: "2026-01-01T04:30:00.000Z",
      currency: "INR" as const,
    });
    const heavy: PortfolioSnapshot = {
      ...emptySnapshot,
      executions: Array.from({ length: 9_990 }, (_, index) => heavyExecution(index)),
    };
    const mock = stubUpstreamRoutes([
      { match: "/portfolio/holdings", body: holdingsFixture },
      { match: "/trade-book", body: tradeBookFixture },
      { match: "/documents/portfolios/user-1", body: portfolioDoc(heavy) },
      { match: ":commit", body: committed },
    ]);

    const response = await call({ mode: "apply", baseUpdateTime: PREVIEWED_AT });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "SNAPSHOT_LIMIT_EXCEEDED" });
    expect(commitCalls(mock)).toHaveLength(0);
  });

  it("accepts sealed material for a maximum-length token under the 8 KiB body cap", async () => {
    // The link route accepts 4096-character tokens; their sealed material is
    // ~5.5 KB, so a 4 KiB body cap would 413 valid stored material.
    const sealed = await encryptBrokerToken("t".repeat(4096), "user-1", KEY);
    const payload = { ...sealed, mode: "preview" };
    expect(JSON.stringify(payload).length).toBeGreaterThan(4096);
    expect(JSON.stringify(payload).length).toBeLessThan(8 * 1024);

    stubUpstreamRoutes(happyRoutes(portfolioDoc(emptySnapshot)));
    const response = await postSync(payload);
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("t".repeat(4096));

    const oversized = await postSync({ ...sealed, mode: "preview", pad: "x".repeat(9000) });
    expect(oversized.status).toBe(413);
  });

  it("spends one daily unit when the broker is actually called", async () => {
    stubUpstreamRoutes(happyRoutes(portfolioDoc(emptySnapshot)));
    const PRICE_CACHE = memoryKv();

    const response = await call({ mode: "preview" }, { PRICE_CACHE });
    expect(response.status).toBe(200);
    expect(PRICE_CACHE.put).toHaveBeenCalledTimes(1);
    expect(PRICE_CACHE.store.get(dailyKey("user-1"))).toBe("1");
  });

  it("answers CORS preflight with 204", async () => {
    const response = await onRequestOptions({
      request: new Request(`${API_ORIGIN}/api/broker/indmoney/sync`, { method: "OPTIONS" }),
      env: env(),
      params: {},
    });
    expect(response.status).toBe(204);
  });
});
