import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import StockNewsFeed, { type NewsItem } from "./StockNewsFeed";

const makeStock = (ticker: string): PortfolioStock => ({
  ticker,
  stockName: ticker,
  entryDate: "2026-01-01",
  entryPrice: 1000,
  cmp: 1100,
  weekHigh52: 1200,
  quantity: 1,
  status: "Active",
});

const makeNews = (overrides: Partial<NewsItem> = {}): NewsItem => ({
  id: "news-1",
  ticker: "RELIANCE",
  headline: "Reliance publishes quarterly results",
  summary: "A verified summary returned by the news API.",
  source: "Example Newswire",
  url: "https://example.com/news-1",
  publishedAt: "2026-10-01T10:00:00.000Z",
  sentiment: "positive",
  ...overrides,
});

const apiResponse = (items: NewsItem[]) => ({
  ok: true,
  json: async () => ({ items }),
}) as Response;

const fetchMock = vi.fn();

describe("StockNewsFeed", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("AbortSignal", { timeout: vi.fn(() => undefined) });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows an honest unavailable state and retries without fabricated articles", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Network offline"))
      .mockResolvedValueOnce(apiResponse([makeNews()]));

    render(<StockNewsFeed stocks={[makeStock("RELIANCE")]} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("News is unavailable");
    expect(alert).toHaveTextContent("Live news could not be loaded");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/mock data/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading news" }));

    expect(await screen.findByText("Reliance publishes quarterly results")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the refresh control and exposes selected ticker filters", async () => {
    fetchMock.mockResolvedValue(apiResponse([
      makeNews(),
      makeNews({
        id: "news-2",
        ticker: "TCS",
        headline: "TCS publishes a market update",
        sentiment: "neutral",
      }),
    ]));

    render(<StockNewsFeed stocks={[makeStock("RELIANCE"), makeStock("TCS")]} />);
    await screen.findByText("Reliance publishes quarterly results");

    expect(screen.getByRole("button", { name: "Refresh news" })).toBeInTheDocument();
    const all = screen.getByRole("button", { name: /^ALL/ });
    const reliance = screen.getByRole("button", { name: /^RELIANCE/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(reliance).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(reliance);

    expect(reliance).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Reliance publishes quarterly results")).toBeInTheDocument();
    expect(screen.queryByText("TCS publishes a market update")).not.toBeInTheDocument();
  });

  it("continues to refresh the live news API every five minutes", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(apiResponse([makeNews()]));

    render(<StockNewsFeed stocks={[makeStock("RELIANCE")]} />);
    await act(async () => {});
    expect(screen.getByText("Reliance publishes quarterly results")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/news",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
