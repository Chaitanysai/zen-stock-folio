import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCandleHistory } from "./useCandleHistory";

vi.mock("@/lib/market-data/client", () => ({
  fetchCandles: vi.fn(async () => ({
    symbol: "RELIANCE",
    range: "6mo",
    resolution: "1d",
    candles: [],
    provider: "yahoo",
    dataMode: "eod",
    fetchedAt: "",
    exchangeTimestamp: null,
    cached: false,
    cacheAgeMs: 0,
    stale: false,
    unavailable: [],
    warnings: [],
  })),
}));

describe("useCandleHistory", () => {
  it("loads a symbol and caches it", async () => {
    const first = renderHook(() => useCandleHistory("RELIANCE", "6mo"));
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    expect(first.result.current.envelope?.range).toBe("6mo");
  });

  it("does nothing without a symbol", () => {
    const { result } = renderHook(() => useCandleHistory(null, "1mo"));
    expect(result.current.status).toBe("idle");
  });
});
