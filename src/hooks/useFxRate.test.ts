import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketDataApiError } from "@/lib/market-data/client";
import { useFxRate } from "./useFxRate";

const fetchFxRate = vi.fn();
vi.mock("@/lib/market-data/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/market-data/client")>("@/lib/market-data/client");
  return { ...actual, fetchFxRate: (...args: unknown[]) => fetchFxRate(...args) };
});

afterEach(() => {
  fetchFxRate.mockReset();
});

const rate = {
  base: "USD" as const,
  quote: "INR" as const,
  rate: 84.25,
  asOf: "2026-11-01T09:30:00.000Z",
  stale: false,
  provider: "yahoo" as const,
  fetchedAt: "2026-11-01T09:30:01.000Z",
};

describe("useFxRate", () => {
  it("loads the rate when enabled", async () => {
    fetchFxRate.mockResolvedValue(rate);
    const { result } = renderHook(() => useFxRate({ enabled: true, pollMs: 60_000 }));

    await waitFor(() => expect(result.current.rate).toBe(84.25));
    expect(result.current.asOf).toBe(rate.asOf);
    expect(result.current.error).toBeNull();
  });

  it("does not call the API when disabled", () => {
    const { result } = renderHook(() => useFxRate({ enabled: false }));
    expect(fetchFxRate).not.toHaveBeenCalled();
    expect(result.current.rate).toBeNull();
  });

  it("surfaces a typed API failure without inventing a rate", async () => {
    fetchFxRate.mockRejectedValue(new MarketDataApiError("FX rate is temporarily unavailable", 502, "provider_unavailable"));
    const { result } = renderHook(() => useFxRate({ enabled: true, pollMs: 60_000 }));

    await waitFor(() => expect(result.current.error).toBe("FX rate is temporarily unavailable"));
    expect(result.current.rate).toBeNull();
  });

  it("clears loading when the request is aborted", async () => {
    // An abort is a supersede/unmount, not a provider failure: no error, but
    // `loading` must not stay stuck on a request that never settles.
    let reject!: (reason: unknown) => void;
    fetchFxRate.mockImplementation(() => new Promise((_, r) => { reject = r; }));
    const { result } = renderHook(() => useFxRate({ enabled: true, pollMs: 60_000 }));

    await waitFor(() => expect(result.current.loading).toBe(true));
    await act(async () => {
      reject(new DOMException("Aborted", "AbortError"));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.rate).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("keeps the last good rate when a later poll fails", async () => {
    fetchFxRate.mockResolvedValueOnce(rate);
    const { result } = renderHook(() => useFxRate({ enabled: true, pollMs: 60_000 }));
    await waitFor(() => expect(result.current.rate).toBe(84.25));

    fetchFxRate.mockRejectedValueOnce(new MarketDataApiError("FX rate is temporarily unavailable", 502, "provider_unavailable"));
    await act(async () => {
      await result.current.refresh();
    });

    // A provider blip must not blank the INR column or reprice it at zero.
    expect(result.current.rate).toBe(84.25);
    expect(result.current.asOf).toBe(rate.asOf);
    expect(result.current.error).toBe("FX rate is temporarily unavailable");
  });
});
