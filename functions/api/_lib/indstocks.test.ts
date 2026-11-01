import { describe, expect, it, vi } from "vitest";
import { BrokerError, createIndstocksClient, normalizeBrokerTicker } from "./indstocks";
import { holdingsFixture } from "./__fixtures__/indstocks/holdings";
import { tradeBookFixture } from "./__fixtures__/indstocks/tradeBook";

const config = (fetchImpl: typeof fetch) => ({
  baseUrl: "https://api.indstocks.test",
  apiKey: "api-key",
  token: "broker-token",
  timeoutMs: 1000,
  fetchImpl,
});

const routed = (routes: Record<string, () => Response>) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [match, make] of Object.entries(routes)) if (url.includes(match)) return make();
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const callsOf = (fetchImpl: typeof fetch) =>
  (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls;

describe("normalizeBrokerTicker", () => {
  it("strips broker exchange prefixes and equity suffixes", () => {
    expect(normalizeBrokerTicker("NSE:RELIANCE")).toBe("RELIANCE");
    expect(normalizeBrokerTicker("RELIANCE-EQ")).toBe("RELIANCE");
    expect(normalizeBrokerTicker("m&m")).toBe("M&M");
    expect(normalizeBrokerTicker("")).toBeNull();
  });

  it("accepts digit-leading NSE symbols but rejects ISINs and junk", () => {
    expect(normalizeBrokerTicker("3MINDIA")).toBe("3MINDIA");
    expect(normalizeBrokerTicker("63MOONS")).toBe("63MOONS");
    expect(normalizeBrokerTicker("20MICRONS")).toBe("20MICRONS");
    expect(normalizeBrokerTicker("5PAISA")).toBe("5PAISA");
    expect(normalizeBrokerTicker("NSE:3MINDIA")).toBe("3MINDIA");
    expect(normalizeBrokerTicker("INE002A01018")).toBeNull();
    expect(normalizeBrokerTicker("RELIANCE EQ")).toBeNull();
    expect(normalizeBrokerTicker("NOT!VALID")).toBeNull();
    expect(normalizeBrokerTicker("--")).toBeNull();
  });

  it("rejects all-digit instrument tokens, which are not tickers", () => {
    expect(normalizeBrokerTicker("2885")).toBeNull();
    expect(normalizeBrokerTicker("123456")).toBeNull();
  });
});

describe("INDstocks adapter", () => {
  it("normalizes holdings across field aliases and reports both unmatched rows", async () => {
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": () => new Response(JSON.stringify(holdingsFixture), { status: 200 }),
    })));

    const result = await client.holdings();
    expect(result.holdings).toEqual([
      { market: "NSE", ticker: "RELIANCE", isin: "INE002A01018", quantity: 15, averagePrice: 2450, lastPrice: 2612.35, brokerRef: "NSE:RELIANCE" },
      { market: "NSE", ticker: "TCS", isin: null, quantity: 8, averagePrice: 3920.5, lastPrice: null, brokerRef: "NSE:TCS" },
    ]);
    expect(result.unmatched).toHaveLength(2);
    expect(result.unmatched[0]).toMatchObject({ ticker: "BSEONLY", reason: "unsupported-exchange" });
    expect(result.unmatched[1]).toMatchObject({ ticker: "", reason: "invalid-row" });
    expect(result.warnings).toHaveLength(1);
  });

  it("reports a securityId-only holding as invalid instead of materialising a numeric ticker", async () => {
    const rows = [{ exchange: "NSE", securityId: "2885", quantity: 5, average_price: 100 }];
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ data: { holdings: rows } }),
    })));

    const result = await client.holdings();
    expect(result.holdings).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toMatchObject({ ticker: "", reason: "invalid-row" });
  });

  it("maps NSE segment values to NSE and reports BSE segment holdings", async () => {
    const rows = [
      { exchangeSegment: "NSE_EQ", tradingsymbol: "RELIANCE", quantity: 2, average_price: 100 },
      { exchangeSegment: "NSE_EQ|NSE_FO", tradingsymbol: "TCS", quantity: 3, average_price: 200 },
      { exchangeSegment: "BSE_EQ", tradingsymbol: "BSEONLY", quantity: 4, average_price: 300 },
    ];
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ data: { holdings: rows } }),
    })));

    const result = await client.holdings();
    expect(result.holdings.map((holding) => holding.ticker)).toEqual(["RELIANCE", "TCS"]);
    expect(result.holdings.every((holding) => holding.market === "NSE")).toBe(true);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toMatchObject({ ticker: "BSEONLY", reason: "unsupported-exchange" });
  });

  it("reports a holding with no exchange as invalid rather than assuming NSE", async () => {
    const rows = [{ tradingsymbol: "RELIANCE", quantity: 5, average_price: 100 }];
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ data: { holdings: rows } }),
    })));

    const result = await client.holdings();
    expect(result.holdings).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toMatchObject({
      ticker: "RELIANCE",
      reason: "invalid-row",
      detail: expect.stringContaining("missing exchange"),
    });
  });

  it("normalizes trade-book fills, including numeric timestamps", async () => {
    const client = createIndstocksClient(config(routed({
      "/trade-book": () => new Response(JSON.stringify(tradeBookFixture), { status: 200 }),
    })));

    const result = await client.tradeBook();
    expect(result.fills).toHaveLength(2);
    expect(result.fills[0]).toMatchObject({
      market: "NSE", ticker: "RELIANCE", side: "BUY", quantity: 10, price: 2450, currency: "INR",
    });
    expect(result.fills[0].executedAt).toBe("2026-01-10T04:30:00.000Z");
    expect(result.fills[0].id).toBe("indmoney:T1001");
    expect(result.fills[1].id).toMatch(/^indmoney:hash:[0-9a-f]{64}$/);
    expect(result.skipped).toBe(1);
  });

  it("skips BSE, unknown, and missing-exchange fills instead of emitting them as NSE", async () => {
    const rows = [
      ...tradeBookFixture.data.trades,
      {
        trade_id: "T2001",
        exchange: "BSE",
        tradingsymbol: "BSEONLY",
        transaction_type: "BUY",
        quantity: 5,
        average_price: 100,
        exchange_timestamp: "2026-01-12T04:30:00Z",
      },
      {
        trade_id: "T2002",
        exchange: "MCX",
        tradingsymbol: "GOLDFUT",
        transaction_type: "BUY",
        quantity: 2,
        average_price: 50,
        exchange_timestamp: "2026-01-12T05:30:00Z",
      },
      {
        trade_id: "T2003",
        tradingsymbol: "NOEXCHANGE",
        transaction_type: "BUY",
        quantity: 2,
        average_price: 50,
        exchange_timestamp: "2026-01-12T06:30:00Z",
      },
    ];
    const client = createIndstocksClient(config(routed({
      "/trade-book": json({ data: { trades: rows } }),
    })));

    const result = await client.tradeBook();
    expect(result.fills).toHaveLength(2);
    expect(result.fills.every((fill) => fill.market === "NSE")).toBe(true);
    expect(result.fills.some((fill) => ["BSEONLY", "GOLDFUT", "NOEXCHANGE"].includes(fill.ticker))).toBe(false);
    expect(result.skipped).toBe(4);
    expect(result.warnings.join(" ")).toMatch(/not NSE/);
  });

  it("maps NSE segment values to NSE and skips BSE segment fills", async () => {
    const rows = [
      {
        trade_id: "T3001",
        exchangeSegment: "NSE_EQ",
        tradingsymbol: "RELIANCE",
        transaction_type: "BUY",
        quantity: 1,
        average_price: 100,
        exchange_timestamp: "2026-01-13T04:30:00Z",
      },
      {
        trade_id: "T3002",
        exchangeSegment: "NSE_EQ|NSE_FO",
        tradingsymbol: "TCS",
        transaction_type: "SELL",
        quantity: 2,
        average_price: 200,
        exchange_timestamp: "2026-01-13T05:30:00Z",
      },
      {
        trade_id: "T3003",
        exchangeSegment: "BSE_EQ",
        tradingsymbol: "BSEONLY",
        transaction_type: "BUY",
        quantity: 3,
        average_price: 300,
        exchange_timestamp: "2026-01-13T06:30:00Z",
      },
    ];
    const client = createIndstocksClient(config(routed({
      "/trade-book": json({ data: { trades: rows } }),
    })));

    const result = await client.tradeBook();
    expect(result.fills.map((fill) => fill.ticker)).toEqual(["RELIANCE", "TCS"]);
    expect(result.fills.every((fill) => fill.market === "NSE")).toBe(true);
    expect(result.skipped).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/BSE/);
  });

  it("skips a fill with no exchange and warns instead of guessing NSE", async () => {
    const rows = [
      {
        trade_id: "T4001",
        tradingsymbol: "RELIANCE",
        transaction_type: "BUY",
        quantity: 1,
        average_price: 100,
        exchange_timestamp: "2026-01-14T04:30:00Z",
      },
    ];
    const client = createIndstocksClient(config(routed({
      "/trade-book": json({ data: { trades: rows } }),
    })));

    const result = await client.tradeBook();
    expect(result.fills).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/exchange was missing/);
  });

  it("derives the same hash id for two identical calls", async () => {
    const body = {
      data: {
        trades: [
          { exchange: "NSE", tradingSymbol: "RELIANCE", transactionType: "B", quantity: 4, price: 2500, exchangeTimestamp: 1768003200 },
        ],
      },
    };
    const client = createIndstocksClient(config(routed({ "/trade-book": json(body) })));

    const first = await client.tradeBook();
    const second = await client.tradeBook();
    expect(first.fills[0].id).toMatch(/^indmoney:hash:[0-9a-f]{64}$/);
    expect(second.fills[0].id).toBe(first.fills[0].id);
  });

  it("treats {data:null} as an empty holdings list", async () => {
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ status: "success", data: null }),
    })));

    await expect(client.holdings()).resolves.toEqual({ holdings: [], unmatched: [], warnings: [] });
  });

  it("treats {data:{trades:null}} as an empty trade book", async () => {
    const client = createIndstocksClient(config(routed({
      "/trade-book": json({ data: { trades: null } }),
    })));

    await expect(client.tradeBook()).resolves.toEqual({ fills: [], warnings: [], skipped: 0 });
  });

  it("treats an absent data list as an empty trade book", async () => {
    const client = createIndstocksClient(config(routed({ "/trade-book": json({}) })));

    await expect(client.tradeBook()).resolves.toEqual({ fills: [], warnings: [], skipped: 0 });
  });

  it("rejects a non-null, non-list data payload as a contract error", async () => {
    const client = createIndstocksClient(config(routed({ "/portfolio/holdings": json({ data: "x" }) })));

    await expect(client.holdings()).rejects.toMatchObject({ kind: "contract" });
  });

  it("includes a sanitized upstream error message in the contract error", async () => {
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ status: "error", message: "  Account   is not linked  " }),
    })));

    const error = await client.holdings().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrokerError);
    expect(error).toMatchObject({ kind: "contract" });
    expect((error as BrokerError).message).toContain("Account is not linked");
  });

  it("surfaces a nested error-envelope message from data", async () => {
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ data: { status: "error", message: "  Session   expired  " } }),
    })));

    const error = await client.holdings().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrokerError);
    expect(error).toMatchObject({ kind: "contract" });
    expect((error as BrokerError).message).toContain("Session expired");
  });

  it("never includes the broker token in a BrokerError message", async () => {
    const client = createIndstocksClient(config(routed({
      "/portfolio/holdings": json({ status: "error", message: "upstream rejected broker-token" }),
    })));

    const error = await client.holdings().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrokerError);
    expect((error as BrokerError).message).not.toContain("broker-token");
    expect((error as BrokerError).message).toContain("[redacted]");
  });

  it("maps a rejected token to an auth error and does not retry it", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const client = createIndstocksClient(config(fetchImpl));
    await expect(client.profile()).rejects.toMatchObject({ kind: "auth" });
    expect(callsOf(fetchImpl)).toHaveLength(1);
  });

  it("maps a forbidden token to an auth error and does not retry it", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    const client = createIndstocksClient(config(fetchImpl));
    await expect(client.profile()).rejects.toMatchObject({ kind: "auth", status: 403 });
    expect(callsOf(fetchImpl)).toHaveLength(1);
  });

  it("reports an aborted request as unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as unknown as typeof fetch;
    const client = createIndstocksClient(config(fetchImpl));
    await expect(client.profile()).rejects.toMatchObject({ kind: "unavailable" });
    expect(callsOf(fetchImpl)).toHaveLength(2);
  });

  it("maps malformed JSON to a contract error", async () => {
    const client = createIndstocksClient(config(routed({
      "/user/profile": () => new Response("not json", { status: 200 }),
    })));

    const error = await client.profile().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrokerError);
    expect(error).toMatchObject({ kind: "contract", status: 200 });
  });

  it("retries one 5xx and then reports the broker unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const client = createIndstocksClient(config(fetchImpl));
    await expect(client.profile()).rejects.toMatchObject({ kind: "unavailable" });
    expect(callsOf(fetchImpl)).toHaveLength(2);
  });

  it("refuses a non-HTTPS origin except localhost", () => {
    expect(() => createIndstocksClient({ ...config(fetch), baseUrl: "http://broker.example" })).toThrow(BrokerError);
    expect(() => createIndstocksClient({ ...config(fetch), baseUrl: "http://localhost:8787" })).not.toThrow();
  });

  it("rejects a base URL carrying a query or hash at construction", () => {
    for (const baseUrl of ["https://x.test/v1?x=1", "https://x.test/v1#frag"]) {
      let error: unknown;
      try {
        createIndstocksClient({ ...config(fetch), baseUrl });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(BrokerError);
      expect(error).toMatchObject({ kind: "contract" });
    }
  });

  it("builds request URLs from a base URL with a path prefix", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndstocksClient({ ...config(fetchImpl), baseUrl: "https://x.test/v1" });

    await client.holdings();
    expect(callsOf(fetchImpl)[0][0]).toBe("https://x.test/v1/portfolio/holdings");
    await client.tradeBook();
    expect(callsOf(fetchImpl)[1][0]).toBe("https://x.test/v1/trade-book");
  });

  it("authenticates with the raw access token, not a Bearer prefix", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndstocksClient(config(fetchImpl));

    await client.profile();

    const init = callsOf(fetchImpl)[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: "broker-token",
      "x-api-key": "api-key",
    });
  });
});
