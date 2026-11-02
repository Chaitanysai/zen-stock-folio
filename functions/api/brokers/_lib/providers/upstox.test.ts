import { afterEach, describe, expect, it, vi } from "vitest";
import { upstoxAdapter } from "./upstox.ts";
import type { AdapterContext } from "../adapter.ts";
import { nextThreeThirtyAmIst } from "../time.ts";
import { brokerEnv } from "../testKit.ts";
import type { NormalizedOrder } from "../../../../../src/lib/brokers/contracts.ts";

const now = new Date("2026-10-28T04:00:00.000Z");

const context = (accessToken = "upstox-token"): AdapterContext => ({
  env: brokerEnv(),
  now,
  credentials: { apiKey: "upstox-key", apiSecret: "upstox-secret", accessToken },
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (handler: (url: string, init?: RequestInit) => Response) => {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", mock);
  return mock;
};

const order = (over: Partial<NormalizedOrder> = {}): NormalizedOrder => ({
  orderId: "o1",
  ticker: "INFY",
  side: "BUY",
  quantity: 1,
  filledQuantity: 1,
  status: "complete",
  segment: "CASH",
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("Upstox API v2 adapter", () => {
  it("builds the documented authorization dialog URL", async () => {
    const start = await upstoxAdapter.beginAuthorization!(
      brokerEnv(),
      { apiKey: "upstox-key", apiSecret: "upstox-secret" },
      "state-1234567890",
      now,
    );

    const url = new URL(start.authorizationUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.upstox.com/v2/login/authorization/dialog");
    expect(url.searchParams.get("client_id")).toBe("upstox-key");
    expect(url.searchParams.get("redirect_uri")).toBe("https://zenfolio.pages.dev/api/brokers/callback/upstox");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-1234567890");
    expect(start.authorizationUrl).not.toContain("upstox-secret");
  });

  it("fails closed with setup_required when BROKER_PUBLIC_ORIGIN is unset", async () => {
    await expect(
      upstoxAdapter.beginAuthorization!(
        brokerEnv({ BROKER_PUBLIC_ORIGIN: undefined }),
        { apiKey: "upstox-key", apiSecret: "upstox-secret" },
        "state-1234567890",
        now,
      ),
    ).rejects.toMatchObject({ code: "setup_required" });
  });

  it("exchanges the authorization code with the documented form body", async () => {
    const fetchMock = stubFetch(() =>
      json({ access_token: "upstox-token", expiry_time: "2026-10-28T22:00:00+05:30" }),
    );

    const token = await upstoxAdapter.completeAuthorization!(
      brokerEnv(),
      { apiKey: "upstox-key", apiSecret: "upstox-secret" },
      "auth-code-1",
      now,
    );

    expect(token).toEqual({ accessToken: "upstox-token", tokenExpiresAt: "2026-10-28T16:30:00.000Z" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.upstox.com/v2/login/authorization/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("code")).toBe("auth-code-1");
    expect(body.get("client_id")).toBe("upstox-key");
    expect(body.get("client_secret")).toBe("upstox-secret");
    expect(body.get("redirect_uri")).toBe("https://zenfolio.pages.dev/api/brokers/callback/upstox");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("maps a rejected code to invalid_credentials", async () => {
    stubFetch(() => json({ error: "UDAPI100016" }, 400));
    await expect(
      upstoxAdapter.completeAuthorization!(
        brokerEnv(),
        { apiKey: "upstox-key", apiSecret: "upstox-secret" },
        "bad-code",
        now,
      ),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("falls back to the next 03:30 IST when the payload has no expiry", async () => {
    stubFetch(() => json({ access_token: "upstox-token" }));
    const token = await upstoxAdapter.completeAuthorization!(
      brokerEnv(),
      { apiKey: "upstox-key", apiSecret: "upstox-secret" },
      "auth-code-1",
      now,
    );
    expect(token.tokenExpiresAt).toBe(nextThreeThirtyAmIst(now));
  });

  it("honours expires_in when the payload uses it", async () => {
    stubFetch(() => json({ access_token: "upstox-token", expires_in: 3600 }));
    const token = await upstoxAdapter.completeAuthorization!(
      brokerEnv(),
      { apiKey: "upstox-key", apiSecret: "upstox-secret" },
      "auth-code-1",
      now,
    );
    expect(token.tokenExpiresAt).toBe("2026-10-28T05:00:00.000Z");
  });

  it("merges long-term and short-term holdings with ISIN as instrument id", async () => {
    stubFetch((url) => {
      if (url.includes("long-term-holdings")) {
        return json({
          status: "success",
          data: [
            {
              isin: "INE002A01018",
              company_name: "Reliance Industries",
              symbol: "RELIANCE",
              quantity: 7,
              average_price: 2500,
              last_price: 2550,
              exchange: "NSE",
            },
          ],
        });
      }
      return json({
        status: "success",
        data: [
          {
            isin: "INE009A01021",
            company_name: "Infosys",
            trading_symbol: "INFY",
            quantity: 3,
            average_price: 1800,
            exchange: "NSE",
          },
          { isin: "INE002A01018", symbol: "RELIANCE", quantity: 7, average_price: 2500 },
        ],
      });
    });

    const holdings = await upstoxAdapter.fetchHoldings(context());

    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({
      instrumentId: "INE002A01018",
      ticker: "RELIANCE",
      quantity: 7,
      averagePrice: 2500,
      lastPrice: 2550,
      currency: "INR",
    });
    expect(holdings[1]).toMatchObject({ instrumentId: "INE009A01021", ticker: "INFY" });
  });

  it("keeps a holding whose payload only lists isin and company name", async () => {
    stubFetch(() =>
      json({
        status: "success",
        data: [{ isin: "INE467I01027", company_name: "Tata Consultancy", quantity: 2, average_price: 3900 }],
      }),
    );

    const holdings = await upstoxAdapter.fetchHoldings(context());

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ instrumentId: "INE467I01027", ticker: "INE467I01027" });
  });

  it("merges short-term and overnight positions and skips zero rows", async () => {
    stubFetch((url) => {
      if (url.includes("short-term-positions")) {
        return json({
          status: "success",
          data: {
            net: [
              { symbol: "TCS", exchange: "NSE", quantity: 3, average_price: 4000, last_price: 4010, pnl: 30, product: "I" },
              { symbol: "FLAT", exchange: "NSE", quantity: 0, average_price: 100 },
            ],
            day: [],
          },
        });
      }
      return json({
        status: "success",
        data: [
          { symbol: "NIFTY28OCT", exchange: "NFO", quantity: 1, average_price: 25000, pnl: 500, product: "D" },
        ],
      });
    });

    const positions = await upstoxAdapter.fetchPositions(context());

    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({ instrumentId: "NSE:TCS", segment: "CASH", realisedPnl: 30 });
    expect(positions[1]).toMatchObject({ instrumentId: "NFO:NIFTY28OCT", segment: "FNO", realisedPnl: 500 });
  });

  it("surfaces an authorization failure on positions", async () => {
    stubFetch(() => json({ error: "expired" }, 401));
    await expect(upstoxAdapter.fetchPositions(context())).rejects.toMatchObject({
      code: "authentication_expired",
    });
  });

  it("maps the order book through v2 aliases", async () => {
    stubFetch(() =>
      json({
        status: "success",
        data: [
          {
            order_id: "o1",
            symbol: "INFY",
            side: "BUY",
            quantity: 1,
            filled_quantity: 1,
            average_price: 1890,
            status: "complete",
            exchange: "NSE",
            order_timestamp: 1769635200000,
          },
          { order_id: "o2", symbol: "TCS", side: "SELL", quantity: 2, status: "open" },
        ],
      }),
    );

    const orders = await upstoxAdapter.fetchOrders(context());

    expect(orders).toHaveLength(2);
    expect(orders[0]).toMatchObject({
      orderId: "o1",
      ticker: "INFY",
      side: "BUY",
      averagePrice: 1890,
      status: "complete",
      placedAt: "2026-01-28T21:20:00.000Z",
    });
    expect(orders[1]).toMatchObject({ orderId: "o2", side: "SELL", status: "open" });
  });

  it("reads the day's trades in one call", async () => {
    stubFetch(() =>
      json({
        status: "success",
        data: [
          {
            trade_id: "t1",
            order_id: "o1",
            symbol: "INFY",
            side: "BUY",
            quantity: 1,
            average_price: 1890,
            trade_timestamp: 1769635500000,
          },
        ],
      }),
    );

    const result = await upstoxAdapter.fetchTrades(context(), [order()]);

    expect(result.partial).toBe(false);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      tradeId: "t1",
      orderId: "o1",
      ticker: "INFY",
      side: "BUY",
      price: 1890,
    });
  });

  it("uses the profile read as the connection test", async () => {
    stubFetch(() => json({ status: "success", data: { user_id: "u1", user_name: "Test" } }));
    await expect(upstoxAdapter.testConnection(context())).resolves.toBeUndefined();

    stubFetch(() => json({ error: "forbidden" }, 403));
    await expect(upstoxAdapter.testConnection(context())).rejects.toMatchObject({
      code: "permission_missing",
    });
  });
});
