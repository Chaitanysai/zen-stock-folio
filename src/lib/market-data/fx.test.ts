import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUsdInr } from "./fx.ts";

afterEach(() => vi.unstubAllGlobals());

describe("fetchUsdInr", () => {
  it("returns the provider rate and its own timestamp", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({
          chart: {
            result: [{ meta: { symbol: "USDINR=X", regularMarketPrice: 84.25, regularMarketTime: 1793008688 } }],
            error: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchUsdInr();
    expect(result.rate).toBe(84.25);
    expect(result.exchangeTimestampMs).toBe(1793008688 * 1000);
  });

  it("falls back to the last close when meta has no price", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: { symbol: "USDINR=X" },
                timestamp: [1793008500, 1793008800],
                indicators: { quote: [{ close: [null, 83.9] }] },
              },
            ],
            error: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetchUsdInr();
    expect(result.rate).toBe(83.9);
    expect(result.exchangeTimestampMs).toBe(1793008800 * 1000);
  });

  it("throws rather than returning zero when the provider has no rate", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ chart: { result: [{ meta: {} }], error: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchUsdInr()).rejects.toThrow(/no USD\/INR rate/);
  });
});
