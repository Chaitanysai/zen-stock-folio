import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioStock } from "@/data/sampleData";
import AIInsights from "./AIInsights";

const { fetchApiMock } = vi.hoisted(() => ({ fetchApiMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  fetchApi: fetchApiMock,
  getApiUnavailableMessage: (label: string) => `${label} is unavailable`,
}));

const stock: PortfolioStock = {
  ticker: "RELIANCE",
  stockName: "Reliance Industries",
  sector: "Energy",
  entryDate: "2026-01-01",
  entryPrice: 1000,
  cmp: 1100,
  weekHigh52: 1200,
  quantity: 2,
  status: "Active",
};

describe("AIInsights accessibility", () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
    fetchApiMock.mockResolvedValue({ response: "Analysis complete" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the analysis and chat controls", () => {
    render(<AIInsights stocks={[]} />);

    expect(screen.getByRole("button", { name: "Refresh portfolio analysis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message Stock AI")).toBeInTheDocument();
  });

  it("exposes analysis expansion state and its controlled region", () => {
    render(<AIInsights stocks={[]} />);

    const collapse = screen.getByRole("button", { name: "Collapse portfolio analysis" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    const regionId = collapse.getAttribute("aria-controls");
    expect(regionId).toBeTruthy();
    expect(document.getElementById(regionId!)).toBeVisible();

    fireEvent.click(collapse);

    const expand = screen.getByRole("button", { name: "Expand portfolio analysis" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(regionId!)).not.toBeInTheDocument();
  });

  it("avoids smooth scrolling when reduced motion is preferred", () => {
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    render(<AIInsights stocks={[]} />);

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "auto" });
  });
});

describe("AIInsights chat", () => {
  beforeEach(() => {
    fetchApiMock.mockReset();
    fetchApiMock.mockResolvedValue({ response: "Analysis complete" });
  });

  it("sends the portfolio context and conversation through the existing AI API", async () => {
    render(<AIInsights stocks={[stock]} />);
    await screen.findByText("Analysis complete");

    fetchApiMock.mockResolvedValueOnce({ response: "Consider your position sizing." });
    fireEvent.change(screen.getByLabelText("Message Stock AI"), {
      target: { value: "What is my largest risk?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Consider your position sizing.")).toBeInTheDocument();
    const request = fetchApiMock.mock.calls.at(-1);
    expect(request?.[0]).toBe("/api/ai");
    const body = JSON.parse(request?.[1].body);
    expect(body.type).toBe("chat");
    expect(body.portfolioContext).toContain("RELIANCE");
    expect(body.messages).toEqual([
      { role: "user", content: "What is my largest risk?" },
    ]);
  });
});
