/**
 * `SymbolSearch` and `HealthPanel` behaviours that are easy to regress:
 * debounce/abort, the empty-result copy, and the requirement that a deep probe
 * never fires without an explicit click.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SymbolSearch } from "./SymbolSearch";
import { HealthPanel } from "./HealthPanel";
import type { HealthResponse, SearchResponse } from "@/lib/market-data/types.ts";

const originalFetch = globalThis.fetch;

// apiFetch awaits the Firebase token before calling fetch. Under fake timers
// that extra microtask never settles inside act(), so the auth wrapper is
// stubbed to the plain fetch the component contract is about.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiFetch: (path: string, init?: RequestInit) => fetch(path, init),
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const searchPayload: SearchResponse = {
  query: "nosuch",
  hits: [],
  provider: "mixed",
  fetchedAt: "2026-10-27T09:00:00.000Z",
  notes: ["Fell back to the local symbol list."],
};

const healthPayload: HealthResponse = {
  generatedAt: "2026-10-27T09:00:00.000Z",
  summary: "unconfigured",
  integrations: [
    {
      id: "upstox-market-quote",
      label: "Upstox market quote",
      purpose: "Realtime NSE quotes",
      state: "unconfigured",
      requiredEnv: ["UPSTOX_ACCESS_TOKEN"],
      configuredEnv: [],
      lastCheckedAt: "2026-10-27T09:00:00.000Z",
      latencyMs: null,
      detail: "UPSTOX_ACCESS_TOKEN is not set; realtime quotes are disabled.",
      facts: {},
    },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

describe("SymbolSearch", () => {
  it("does not query until the debounce elapses", async () => {
    const spy = vi.fn(async () => jsonResponse(searchPayload));
    globalThis.fetch = spy as unknown as typeof fetch;

    render(<SymbolSearch onSelect={() => {}} debounceMs={300} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "nosuch" } });

    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("shows the server's empty-state copy and its notes, never a fabricated match", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(searchPayload)) as unknown as typeof fetch;

    render(<SymbolSearch onSelect={() => {}} debounceMs={0} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "nosuch" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByText(/No match for/)).toBeTruthy();
    expect(screen.getByText(/Fell back to the local symbol list/)).toBeTruthy();
  });

  it("stays below the minimum length with no request at all", async () => {
    const spy = vi.fn(async () => jsonResponse(searchPayload));
    globalThis.fetch = spy as unknown as typeof fetch;

    render(<SymbolSearch onSelect={() => {}} minChars={2} debounceMs={0} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r" } });
    await vi.advanceTimersByTimeAsync(50);

    expect(spy).not.toHaveBeenCalled();
  });

  it("hands the chosen hit to the caller and closes", async () => {
    const onSelect = vi.fn();
    globalThis.fetch = vi.fn(async () => jsonResponse({
      ...searchPayload,
      query: "reli",
      hits: [{ symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE", instrumentType: "EQ", provider: "yahoo", isin: null }],
    })) as unknown as typeof fetch;

    render(<SymbolSearch onSelect={onSelect} debounceMs={0} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reli" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    fireEvent.click(screen.getByText("RELIANCE"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ symbol: "RELIANCE" }));
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
  });
});

describe("HealthPanel", () => {
  it("never issues a deep probe on mount", async () => {
    const spy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => jsonResponse(healthPayload));
    globalThis.fetch = spy as unknown as typeof fetch;

    render(<HealthPanel />);
    await vi.advanceTimersByTimeAsync(1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toBe("/api/health");
  });

  it("only requests ?deep=1 after the button is clicked", async () => {
    const spy = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => jsonResponse(healthPayload));
    globalThis.fetch = spy as unknown as typeof fetch;

    render(<HealthPanel />);
    await vi.advanceTimersByTimeAsync(1);

    fireEvent.click(screen.getByTitle(/Live upstream probes/i));
    await vi.advanceTimersByTimeAsync(1);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(String(spy.mock.calls[1][0])).toBe("/api/health?deep=1");
    expect(screen.getByText(/Live probes were run/i)).toBeTruthy();
  });

  it("strikes through env names that are not configured", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(healthPayload)) as unknown as typeof fetch;

    render(<HealthPanel />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    const chip = screen.getByText("UPSTOX_ACCESS_TOKEN");
    expect(chip.style.textDecoration).toBe("line-through");
    expect(chip.getAttribute("title")).toBe("UPSTOX_ACCESS_TOKEN is not set");
  });

  it("renders the API's error instead of an empty panel", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: "Health probe failed", code: "request_failed" }, 500)) as unknown as typeof fetch;

    render(<HealthPanel />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByText("Health probe failed")).toBeTruthy();
  });
});
