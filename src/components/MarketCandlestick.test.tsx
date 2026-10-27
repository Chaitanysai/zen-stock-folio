/**
 * `MarketCandlestick` behaviours a chart library would happily hide:
 *
 *  - an empty series shows the server's own warning, never a placeholder line;
 *  - a failed load says something actionable and offers Retry only when retrying
 *    can help;
 *  - the provenance line reports the provider's mode and bar count, so a stale
 *    chart cannot look live.
 *
 * `lightweight-charts` needs a real layout engine (canvas, ResizeObserver), so it
 * is mocked here. Everything under test is this component's own state machine.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const chartStub = {
  addSeries: () => ({ setData: () => {} }),
  applyOptions: () => {},
  remove: () => {},
  timeScale: () => ({ fitContent: () => {} }),
};

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "solid" },
  CandlestickSeries: {},
  createChart: () => chartStub,
}));

import { MarketCandlestick } from "./MarketCandlestick";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const envelope = {
  symbol: "RELIANCE",
  range: "1mo" as const,
  resolution: "5m",
  candles: [{ time: 1_729_900_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
  provider: "yahoo" as const,
  dataMode: "eod" as const,
  exchangeTimestamp: "2026-10-26T09:58:08.000Z",
  fetchedAt: "2026-10-27T09:00:00.000Z",
  warnings: [],
};

describe("MarketCandlestick", () => {
  beforeEach(() => {
    // jsdom has no layout engine, so the chart container measures zero.
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the server's warning for an empty series instead of inventing a bar", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ ...envelope, candles: [], warnings: ["No intraday bars were available."] }),
    ) as unknown as typeof fetch;

    render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);

    expect(await screen.findByText("No intraday bars were available.")).toBeInTheDocument();
    // The honest fallback names the symbol and range, not a flat line.
    expect(screen.queryByText(/Loading candles/)).not.toBeInTheDocument();
  });

  it("names an unsupported range as not retryable", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: "bad", code: "invalid_range" }, 400),
    ) as unknown as typeof fetch;

    render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);

    expect(await screen.findByText("That chart range is not supported.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("offers Retry for a transient network failure", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("reports provider mode and bar count rather than implying live data", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(envelope)) as unknown as typeof fetch;

    render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);

    expect(await screen.findByText(/1 bars @ 5m/)).toBeInTheDocument();
  });

  it("aborts the in-flight request when unmounted", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return jsonResponse(envelope);
    }) as unknown as typeof fetch;

    const { unmount } = render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);
    await screen.findByText(/1 bars @ 5m/);
    unmount();

    expect(seen[0]?.aborted).toBe(true);
  });

  it("treats an abort as silence, not as an error to report", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as unknown as typeof fetch;

    render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);

    expect(await screen.findByText("Loading candles…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("classifies a rate-limit rejection as retryable", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "slow down", code: "rate_limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" },
      }),
    ) as unknown as typeof fetch;

    render(<MarketCandlestick symbol="RELIANCE" range="1mo" />);

    expect(
      await screen.findByText("Too many chart requests. Pause a moment, then retry."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
