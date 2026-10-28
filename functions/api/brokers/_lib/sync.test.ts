import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSync } from "./sync.ts";
import { connectionRecord, brokerEnv } from "./testKit.ts";
import type { BrokerLedger } from "./store.ts";
import { resetProviderSleep, setProviderSleep } from "./providerHttp.ts";

const now = new Date("2026-10-28T04:00:00.000Z");

const holdings = [
  { tradingsymbol: "INFY", exchange: "NSE", isin: "INE009A01021", quantity: 10, average_price: 1500 },
  { tradingsymbol: "TCS", exchange: "NSE", quantity: 5, average_price: 4000 },
];

const positions = {
  net: [{ tradingsymbol: "TCS", exchange: "NSE", quantity: 5, average_price: 4000 }],
  day: [],
};

const orders = [
  {
    order_id: "o1",
    tradingsymbol: "INFY",
    transaction_type: "BUY",
    quantity: 10,
    filled_quantity: 10,
    average_price: 1500,
    status: "COMPLETE",
    order_timestamp: "2026-10-28 09:30:00",
  },
];

const trades = [
  {
    trade_id: "t1",
    order_id: "o1",
    tradingsymbol: "INFY",
    transaction_type: "BUY",
    quantity: 10,
    average_price: 1500,
    trade_timestamp: "2026-10-28 09:31:00",
  },
];

const stubKite = (over: Record<string, { body: unknown; status?: number }> = {}) => {
  const routes: Record<string, { body: unknown; status?: number }> = {
    "/portfolio/holdings": { body: { data: holdings } },
    "/portfolio/positions": { body: { data: positions } },
    "/orders": { body: { data: orders } },
    "/trades": { body: { data: trades } },
    ...over,
  };
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = Object.keys(routes).find((path) => url.endsWith(`/api${path}`) || url.includes(path));
    const route = match ? routes[match] : undefined;
    return new Response(JSON.stringify(route?.body ?? {}), {
      status: route?.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

const emptyLedger = (): BrokerLedger => ({ entries: {} });

const run = (ledger: BrokerLedger, recordOverrides = {}) =>
  runSync({
    env: brokerEnv(),
    record: connectionRecord({ tokenExpiresAt: "2026-10-29T00:30:00.000Z", ...recordOverrides }),
    credentials: { apiKey: "api-key-1", apiSecret: "api-secret-1", accessToken: "kite-token" },
    now,
    ledger,
  });

beforeEach(() => setProviderSleep(async () => {}));
afterEach(() => {
  resetProviderSleep();
  vi.unstubAllGlobals();
});

describe("broker sync", () => {
  it("reports a first sync as all-new with current-day coverage", async () => {
    stubKite();
    const outcome = await run(emptyLedger());

    expect(outcome.summary.status).toBe("success");
    expect(outcome.summary.counts).toEqual({ fetched: 5, new: 5, updated: 0, unchanged: 0 });
    expect(outcome.summary.categories.holdings).toMatchObject({ status: "ok", count: 2 });
    expect(outcome.summary.categories.positions).toMatchObject({ status: "ok", count: 1 });
    expect(outcome.summary.categories.orders).toMatchObject({ status: "ok", count: 1 });
    expect(outcome.summary.categories.trades).toMatchObject({ status: "ok", count: 1 });
    expect(outcome.summary.coverage).toMatchObject({
      start: "2026-10-28T04:00:00.000Z",
      end: "2026-10-28T04:01:00.000Z",
      currentDayOnly: true,
      statementImportRecommended: true,
    });
    expect(outcome.summary.coverage.note).toContain("2026-10-28");
    expect(outcome.summary.safeErrorCode).toBeNull();
    expect(outcome.records.holdings).toHaveLength(2);
  });

  it("dedupes repeat syncs through the ledger", async () => {
    stubKite();
    const first = await run(emptyLedger());
    const second = await run(first.ledger);

    expect(second.summary.counts).toEqual({ fetched: 5, new: 0, updated: 0, unchanged: 5 });
  });

  it("counts a changed holding as updated", async () => {
    stubKite();
    const first = await run(emptyLedger());
    stubKite({
      "/portfolio/holdings": {
        body: { data: [{ ...holdings[0], quantity: 12 }, holdings[1]] },
      },
    });
    const second = await run(first.ledger);

    expect(second.summary.counts).toMatchObject({ new: 0, updated: 1, unchanged: 4 });
  });

  it("keeps a failed category failed and skips trades when orders fail", async () => {
    stubKite({ "/orders": { body: { message: "boom" }, status: 500 } });
    const outcome = await run(emptyLedger());

    expect(outcome.summary.status).toBe("partial");
    expect(outcome.summary.categories.orders).toMatchObject({
      status: "failed",
      safeErrorCode: "provider_unavailable",
    });
    expect(outcome.summary.categories.trades).toMatchObject({
      status: "failed",
      safeErrorCode: "provider_unavailable",
    });
    expect(outcome.summary.categories.holdings.status).toBe("ok");
    expect(outcome.summary.counts.fetched).toBe(3);
    expect(outcome.summary.safeErrorCode).toBe("provider_unavailable");
    expect(outcome.records.trades).toEqual([]);
  });

  it("aborts on an authentication failure instead of reporting empty data", async () => {
    stubKite({ "/portfolio/holdings": { body: {}, status: 401 } });
    await expect(run(emptyLedger())).rejects.toMatchObject({ code: "authentication_expired" });
  });

  it("aborts on a rate limit", async () => {
    stubKite({ "/portfolio/holdings": { body: {}, status: 429 } });
    await expect(run(emptyLedger())).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("refreshes an expired Groww token before syncing", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/token/api/access")) {
        return new Response(JSON.stringify({ payload: { token: "fresh-groww-token" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ payload: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", mock);

    const outcome = await runSync({
      env: brokerEnv(),
      record: connectionRecord({
        provider: "groww",
        method: "api_keys",
        tokenExpiresAt: "2026-10-27T00:30:00.000Z",
      }),
      credentials: { apiKey: "rk_live_key", apiSecret: "groww-secret", accessToken: "stale-token" },
      now,
      ledger: emptyLedger(),
    });

    expect(outcome.credentials.accessToken).toBe("fresh-groww-token");
    expect(mock.mock.calls.some(([url]) => String(url).includes("/v1/token/api/access"))).toBe(true);
    expect(outcome.summary.status).toBe("success");
    expect(outcome.summary.categories.holdings.status).toBe("empty");
  });

  it("refuses an expired Kite token because Kite has no refresh flow", async () => {
    const mock = stubKite();
    await expect(
      run(emptyLedger(), { tokenExpiresAt: "2026-10-27T00:30:00.000Z" }),
    ).rejects.toMatchObject({ code: "authentication_expired" });
    expect(mock).not.toHaveBeenCalled();
  });
});
