import { afterEach, describe, expect, it, vi } from "vitest";
import { growwAdapter } from "./groww.ts";
import type { AdapterContext } from "../adapter.ts";
import { nextSixAmIst } from "../time.ts";
import { brokerEnv } from "../testKit.ts";
import type { NormalizedOrder } from "../../../../../src/lib/brokers/contracts.ts";

const now = new Date("2026-10-28T04:00:00.000Z");

const context = (accessToken = "groww-token"): AdapterContext => ({
  env: brokerEnv(),
  now,
  credentials: { apiKey: "rk_live_key", apiSecret: "groww-secret", accessToken },
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (handler: (url: string, init?: RequestInit) => Response) => {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", mock);
  return mock;
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const order = (over: Partial<NormalizedOrder> = {}): NormalizedOrder => ({
  orderId: "o1",
  ticker: "INFY",
  side: "BUY",
  quantity: 1,
  filledQuantity: 1,
  status: "COMPLETE",
  segment: "CASH",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("Groww Trading API adapter", () => {
  it("mints a token with the documented approval checksum", async () => {
    const fetchMock = stubFetch(() =>
      json({ status: "SUCCESS", payload: { accessToken: "groww-token", expiry: "2026-10-29T00:30:00.000Z" } }),
    );

    const token = await growwAdapter.validateCredentials!(brokerEnv(), "rk_live_key", "groww-secret", now);

    expect(token).toEqual({ accessToken: "groww-token", tokenExpiresAt: "2026-10-29T00:30:00.000Z" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groww.in/v1/token/api/access");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer rk_live_key");
    expect(headers["X-API-VERSION"]).toBe("1.0");

    const body = JSON.parse(String(init.body)) as { key_type: string; checksum: string; timestamp: string };
    expect(body.key_type).toBe("approval");
    expect(body.timestamp).toBe(String(Math.floor(now.getTime() / 1000)));
    expect(body.checksum).toBe(await sha256(`groww-secret${body.timestamp}`));
    expect(JSON.stringify(init)).not.toContain("groww-secret");
  });

  it("falls back to the next 06:00 IST when the token payload has no expiry", async () => {
    stubFetch(() => json({ payload: { token: "groww-token" } }));
    const token = await growwAdapter.validateCredentials!(brokerEnv(), "rk_live_key", "groww-secret", now);
    expect(token.tokenExpiresAt).toBe(nextSixAmIst(now));
  });

  it("maps a rejected key or missing approval to invalid_credentials", async () => {
    stubFetch(() => json({ error: "denied" }, 403));
    await expect(
      growwAdapter.validateCredentials!(brokerEnv(), "rk_live_key", "groww-secret", now),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("parses holdings through documented field aliases", async () => {
    stubFetch(() =>
      json({
        status: "SUCCESS",
        payload: {
          holdings: [
            {
              trading_symbol: "RELIANCE",
              quantity: "7",
              average_price: "2500",
              exchange: "NSE",
              isin: "INE002A01018",
              ltp: "2550",
            },
            { trading_symbol: "NO-PRICE", quantity: 2 },
          ],
        },
      }),
    );

    const holdings = await growwAdapter.fetchHoldings(context());

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      instrumentId: "INE002A01018",
      ticker: "RELIANCE",
      quantity: 7,
      averagePrice: 2500,
      lastPrice: 2550,
      currency: "INR",
    });
  });

  it("walks both position segments and skips unsupported ones", async () => {
    stubFetch((url) => {
      if (url.includes("segment=CASH")) {
        return json({
          payload: [{ trading_symbol: "TCS", quantity: 3, average_price: 4000, exchange: "NSE", pnl: 25 }],
        });
      }
      return json({ message: "segment not enabled" }, 422);
    });

    const positions = await growwAdapter.fetchPositions(context());

    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ segment: "CASH", instrumentId: "NSE:TCS", realisedPnl: 25 });
  });

  it("surfaces an authorization failure on positions", async () => {
    stubFetch(() => json({ message: "forbidden" }, 403));
    await expect(growwAdapter.fetchPositions(context())).rejects.toMatchObject({
      code: "permission_missing",
    });
  });

  it("paginates orders, stops on a short page and dedupes ids", async () => {
    const fetchMock = stubFetch((url) => {
      if (url.includes("segment=CASH")) {
        return json({
          payload: {
            order_list: [
              { order_id: "o1", trading_symbol: "INFY", transaction_type: "B", quantity: 1, order_status: "COMPLETE" },
              { order_id: "o2", trading_symbol: "TCS", transaction_type: "SELL", quantity: 2, status: "OPEN" },
            ],
          },
        });
      }
      return json({
        orders: [{ order_id: "o1", trading_symbol: "INFY", side: "BUY", quantity: 1, status: "COMPLETE" }],
      });
    });

    const orders = await growwAdapter.fetchOrders(context());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(orders.map((row) => row.orderId)).toEqual(["o1", "o2"]);
    expect(orders[0]).toMatchObject({ side: "BUY", ticker: "INFY" });
    expect(orders[1]).toMatchObject({ side: "SELL", ticker: "TCS" });
  });

  it("reads trades per order and marks a missing order as partial", async () => {
    stubFetch((url) => {
      if (url.includes("/v1/order/trades/o1")) {
        return json({
          payload: [
            {
              trade_id: "t1",
              trading_symbol: "INFY",
              transaction_type: "BUY",
              quantity: 1,
              price: 1500,
              trade_timestamp: "2026-10-28 09:35:00",
            },
          ],
        });
      }
      return json({ message: "not found" }, 404);
    });

    const result = await growwAdapter.fetchTrades(context(), [order(), order({ orderId: "o2" })]);

    expect(result.partial).toBe(true);
    expect(result.note).toBe("Some orders did not return trade details.");
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      tradeId: "t1",
      orderId: "o1",
      ticker: "INFY",
      side: "BUY",
      price: 1500,
      tradedAt: "2026-10-28T04:05:00.000Z",
    });
  });

  it("caps the per-order trade walk and says so", async () => {
    const fetchMock = stubFetch(() => json({ payload: [] }));
    const orders = Array.from({ length: 41 }, (_, index) => order({ orderId: `o${index}` }));

    const result = await growwAdapter.fetchTrades(context(), orders);

    expect(fetchMock).toHaveBeenCalledTimes(40);
    expect(result.partial).toBe(true);
    expect(result.note).toBe("Trade details were read for the first 40 of 41 orders today.");
  });

  it("uses the holdings read as the connection test", async () => {
    stubFetch(() => json({ payload: [] }));
    await expect(growwAdapter.testConnection(context())).resolves.toBeUndefined();

    stubFetch(() => json({ message: "expired" }, 401));
    await expect(growwAdapter.testConnection(context())).rejects.toMatchObject({
      code: "authentication_expired",
    });
  });
});
