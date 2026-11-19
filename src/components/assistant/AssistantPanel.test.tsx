import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AssistantPanel } from "./AssistantPanel";
import type { UseAssistantResult } from "./useAssistant";
import type { AssistantMessage } from "@/lib/assistant/types";

const renderPanel = (assistant: Partial<UseAssistantResult> = {}, open = true) => {
  const props: UseAssistantResult = {
    messages: [],
    status: "idle",
    error: null,
    hydration: { provider: "groq", model: "llama", degraded: false },
    canSend: true,
    send: vi.fn(),
    retry: vi.fn(),
    clear: vi.fn(),
    ...assistant,
  };
  render(
    <MemoryRouter>
      <AssistantPanel open={open} onOpenChange={() => {}} assistant={props} />
    </MemoryRouter>,
  );
  return props;
};

const assistantMessage = (over: Partial<AssistantMessage> = {}): AssistantMessage => ({
  id: "a-1",
  role: "assistant",
  content: "You hold **RELIANCE** and TCS.",
  createdAt: 1,
  ...over,
});

describe("AssistantPanel", () => {
  it("shows the read-only disclosure and the suggested openers when empty", () => {
    renderPanel();

    expect(screen.getByText("AssistZF")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText("Ask about your portfolio")).toBeInTheDocument();
    // The disclosure is a fact about this phase, not a tooltip the user must find.
    expect(screen.getByText(/cannot add, edit or delete trades/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How is my portfolio doing today?" })).toBeInTheDocument();
  });

  it("sends a suggested prompt when it is clicked", () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "How is my portfolio doing today?" }));
    expect(props.send).toHaveBeenCalledWith("How is my portfolio doing today?");
  });

  it("renders an assistant reply with its structured card", () => {
    renderPanel({
      messages: [
        { id: "u-1", role: "user", content: "show my holdings", createdAt: 0 },
        assistantMessage({
          cards: [
            {
              kind: "holdings",
              title: "Open positions",
              rows: [
                {
                  ticker: "RELIANCE",
                  name: "Reliance Industries",
                  market: "NSE",
                  quantity: 15,
                  averageCost: 2450,
                  price: 2612.35,
                  pnl: 2435.25,
                  pnlPercent: 6.63,
                  currency: "INR",
                  status: "Active",
                },
              ],
            },
          ],
        }),
      ],
    });

    const log = screen.getByRole("log", { name: "Assistant conversation" });
    expect(within(log).getByText("show my holdings")).toBeInTheDocument();
    expect(within(log).getAllByText("RELIANCE").length).toBeGreaterThan(0);
    expect(within(log).getByText("Reliance Industries")).toBeInTheDocument();
    expect(within(log).getByText("Open positions")).toBeInTheDocument();
  });

  it("renders unknown numbers as an em dash, never as zero", () => {
    renderPanel({
      messages: [
        assistantMessage({
          cards: [
            {
              kind: "holdings",
              title: "Open positions",
              rows: [
                {
                  ticker: "XYZ",
                  name: "Unknown price Co",
                  market: "NSE",
                  quantity: 5,
                  averageCost: null,
                  price: null,
                  pnl: null,
                  pnlPercent: null,
                  currency: "INR",
                  status: "Active",
                },
              ],
            },
          ],
        }),
      ],
    });

    const log = screen.getByRole("log");
    expect(within(log).getAllByText("—").length).toBeGreaterThan(0);
    expect(within(log).getByText("P&L unknown")).toBeInTheDocument();
  });

  it("shows an error with a retry action and does not pretend it succeeded", () => {
    const props = renderPanel({
      error: "The assistant is temporarily unavailable.",
      messages: [
        { id: "u-1", role: "user", content: "show my holdings", createdAt: 0 },
        {
          id: "e-1",
          role: "assistant",
          content: "The assistant is temporarily unavailable.",
          createdAt: 1,
          error: "The assistant is temporarily unavailable.",
        },
      ],
    });

    expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.retry).toHaveBeenCalled();
  });

  it("shows a typing indicator while a turn is in flight", () => {
    renderPanel({
      status: "sending",
      canSend: false,
      messages: [{ id: "u-1", role: "user", content: "show my holdings", createdAt: 0 }],
    });

    expect(screen.getByText("Assistant is looking that up")).toBeInTheDocument();
  });

  it("clears the conversation on request, and only when there is one", () => {
    const empty = renderPanel();
    expect(screen.getByRole("button", { name: "Clear conversation" })).toBeDisabled();
    expect(empty.clear).not.toHaveBeenCalled();

    const props = renderPanel({ messages: [{ id: "u-1", role: "user", content: "hi", createdAt: 0 }] });
    fireEvent.click(screen.getByRole("button", { name: "Clear conversation" }));
    expect(props.clear).toHaveBeenCalled();
  });

  it("marks a turn answered by the deterministic fallback", () => {
    renderPanel({
      hydration: { provider: null, model: null, degraded: true },
      messages: [assistantMessage({ content: "2 open positions.", degraded: true })],
    });

    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.getByText(/Answered without AI/i)).toBeInTheDocument();
  });
});
