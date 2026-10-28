import { afterEach, describe, expect, it, vi } from "vitest";
import { zerodhaAdapter } from "./zerodha.ts";
import type { AdapterContext } from "../adapter.ts";
import { nextSixAmIst } from "../time.ts";
import { brokerEnv } from "../testKit.ts";

const now = new Date("2026-10-28T04:00:00.000Z");

const context = (accessToken = "kite-token"): AdapterContext => ({
  env: brokerEnv(),
  now,
  credentials: { apiKey: "api-key-1", apiSecret: "api-secret-1", accessToken },
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const stubFetch = (routes: Array<{ match: string; body: unknown; status?: number }>) => {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const route = routes.find((entry) => url.includes(entry.match));
    return route ? json(route.body, route.status ?? 200) : json({}, 404);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

afterEach(() => vi.unstubAllGlobals());

describe("Zerodha Kite Connect adapter", () => {
  it("builds the documented login URL with the state inside redirect_params", async () => {
    const start = await zerodhaAdapter.beginAuthorization!(
      brokerEnv(),
      { apiKey: "api-key-1", apiSecret: "api-secret-1" },
      "state-value",
      now,
    );
    const url = new URL(start.authorizationUrl);

    expect(`${url.origin}${url.pathname}`).toBe("https://kite.zerodha.com/connect/login");
    expect(url.searchParams.get("v")).toBe("3");
    expect(url.searchParams.get("api_key")).toBe("api-key-1");
    expect(url.searchParams.get("redirect_params")).toBe("state=state-value");
    expect(start.expiresAt).toBe("2026-10-28T04:10:00.000Z");
    expect(start.authorizationUrl).not.toContain("api-secret-1");
  });

  it("exchanges a request token with the documented checksum", async () => {
    const fetchMock = stubFetch([
      { match: "/session/token", body: { data: { access_token: "fresh-token", expires_at: "2026-10-29T00:30:00.000Z" } } },
    ]);

    const token = await zerodhaAdapter.completeAuthorization!(
      brokerEnv(),
      { apiKey: "api-key-1", apiSecret: "api-secret-1" },
      "request-token-1",
      now,
    );

    expect(token).toEqual({ accessToken: "fresh-token", tokenExpiresAt: "2026-10-29T00:30:00.000Z" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.kite.trade/session/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("api_key")).toBe("api-key-1");
    expect(body.get("request_token")).toBe("request-token-1");
    expect(body.get("checksum")).toBe(await sha256("api-key-1request-token-1api-secret-1"));
  });

  it("falls back to the next 06:00 IST when Kite omits expires_at", async () => {
    stubFetch([{ match: "/session/token", body: { data: { access_token: "fresh-token" } } }]);
    const token = await zerodhaAdapter.completeAuthorization!(
      brokerEnv(),
      { apiKey: "api-key-1", apiSecret: "api-secret-1" },
      "request-token-1",
      now,
    );
    expect(token.tokenExpiresAt).toBe(nextSixAmIst(now));
  });

  it("maps a rejected request token to invalid_credentials", async () => {
    stubFetch([{ match: "/session/token", body: { error: "bad" }, status: 400 }]);
    await expect(
      zerodhaAdapter.completeAuthorization!(
        brokerEnv(),
        { apiKey: "api-key-1", apiSecret: "api-secret-1" },
        "request-token-1",
        now,
      ),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("parses holdings and derives a stable instrument id", async () => {
    const fetchMock = stubFetch([
      {
        match: "/portfolio/holdings",
        body: {
          data: [
            {
              tradingsymbol: "INFY-EQ",
              exchange: "NSE",
              isin: "INE009A01021",
              quantity: 10,
              average_price: 1500.5,
              last_price: 1600,
            },
            { tradingsymbol: "BROKEN", quantity: "n/a" },
          ],
        },
      },
    ]);

    const holdings = await zerodhaAdapter.fetchHoldings(context());

    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      instrumentId: "INE009A01021",
      isin: "INE009A01021",
      ticker: "INFY",
      exchange: "NSE",
      quantity: 10,
      averagePrice: 1500.5,
      lastPrice: 1600,
      currency: "INR",
      asOf: now.toISOString(),
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("token api-key-1:kite-token");
    expect((init.headers as Record<string, string>)["X-Kite-Version"]).toBe("3");
  });

  it("dedupes net/day positions and classifies derivatives", async () => {
    stubFetch([
      {
        match: "/portfolio/positions",
        body: {
          data: {
            net: [
              { tradingsymbol: "TCS", exchange: "NSE", quantity: 5, average_price: 4000, pnl: 50 },
              { tradingsymbol: "NIFTY25OCTFUT", exchange: "NFO", quantity: 50, average_price: 100 },
            ],
            day: [{ tradingsymbol: "TCS", exchange: "NSE", quantity: 5, average_price: 4000 }],
          },
        },
      },
    ]);

    const positions = await zerodhaAdapter.fetchPositions(context());

    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({ instrumentId: "NSE:TCS", segment: "CASH", realisedPnl: 50 });
    expect(positions[1]).toMatchObject({ instrumentId: "NFO:NIFTY25OCTFUT", segment: "FNO" });
  });

  it("parses the day's orders and trades", async () => {
    stubFetch([
      {
        match: "/orders",
        body: {
          data: [
            {
              order_id: "o1",
              tradingsymbol: "INFY",
              exchange: "NSE",
              product: "CNC",
              transaction_type: "BUY",
              quantity: 10,
              filled_quantity: 10,
              average_price: 1500,
              status: "COMPLETE",
              order_timestamp: "2026-10-28 09:30:00",
            },
            { tradingsymbol: "MISSING-ID", quantity: 1 },
          ],
        },
      },
      {
        match: "/trades",
        body: {
          data: [
            {
              trade_id: "t1",
              order_id: "o1",
              tradingsymbol: "INFY",
              exchange: "NSE",
              transaction_type: "SELL",
              quantity: 2,
              average_price: 1600,
              fees: 10,
              trade_timestamp: "2026-10-28 10:00:00",
            },
          ],
        },
      },
    ]);

    const orders = await zerodhaAdapter.fetchOrders(context());
    const trades = await zerodhaAdapter.fetchTrades(context(), orders);

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      orderId: "o1",
      ticker: "INFY",
      side: "BUY",
      quantity: 10,
      filledQuantity: 10,
      placedAt: "2026-10-28T04:00:00.000Z",
    });
    expect(trades.partial).toBe(false);
    expect(trades.trades[0]).toMatchObject({
      tradeId: "t1",
      orderId: "o1",
      side: "SELL",
      quantity: 2,
      price: 1600,
      fees: 10,
      tradedAt: "2026-10-28T04:30:00.000Z",
    });
  });

  it("maps 401 and 403 from data endpoints", async () => {
    stubFetch([{ match: "/portfolio/holdings", body: {}, status: 401 }]);
    await expect(zerodhaAdapter.fetchHoldings(context())).rejects.toMatchObject({
      code: "authentication_expired",
    });

    stubFetch([{ match: "/portfolio/holdings", body: {}, status: 403 }]);
    await expect(zerodhaAdapter.fetchHoldings(context())).rejects.toMatchObject({
      code: "permission_missing",
    });
  });

  it("requires a stored access token", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      zerodhaAdapter.fetchHoldings({
        env: brokerEnv(),
        now,
        credentials: { apiKey: "api-key-1", apiSecret: "api-secret-1" },
      }),
    ).rejects.toMatchObject({ code: "authentication_expired" });
  });
});
