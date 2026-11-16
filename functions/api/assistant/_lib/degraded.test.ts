// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantCard } from "../../../../src/lib/assistant/schemas.ts";

const executeToolDefinition = vi.fn();

vi.mock("./tools/registry", () => ({
  executeToolDefinition: (...args: unknown[]) => executeToolDefinition(...args),
}));

const { runDeterministicFallback } = await import("./degraded");
const { createToolContext } = await import("./context");
const { makeEnv } = await import("../../_lib/testHelpers");

const ctx = () => createToolContext({ env: makeEnv(), uid: "user-1", token: "t", now: Date.now() });

const card: AssistantCard = {
  kind: "metrics",
  title: "Portfolio summary",
  metrics: [{ label: "Open positions", value: 2, currency: null }],
};

const user = (content: string) => ({ role: "user" as const, content });

beforeEach(() => {
  executeToolDefinition.mockReset();
  executeToolDefinition.mockResolvedValue({
    status: "ok",
    outcome: { status: "ok", summary: "2 open positions.", data: {}, card },
  });
});

describe("deterministic fallback", () => {
  it("routes a holdings question to get_holdings", async () => {
    const turn = await runDeterministicFallback(ctx(), [user("show my holdings")]);

    expect(executeToolDefinition).toHaveBeenCalledTimes(1);
    const [, name, rawArgs] = executeToolDefinition.mock.calls[0];
    expect(name).toBe("get_holdings");
    expect(JSON.parse(String(rawArgs))).toEqual({ status: "active", limit: 10 });
    expect(turn.reply).toContain("2 open positions.");
    expect(turn.reply).toContain("without AI");
    expect(turn.cards).toEqual([card]);
    expect(turn.toolCalls).toBe(1);
  });

  it("routes a market-hours question to get_market_status", async () => {
    await runDeterministicFallback(ctx(), [user("is the market open?")]);
    expect(executeToolDefinition.mock.calls[0][1]).toBe("get_market_status");
  });

  it("asks for indices only when the user asked about them", async () => {
    await runDeterministicFallback(ctx(), [user("how is nifty doing")]);
    const [call] = executeToolDefinition.mock.calls;
    expect(call[1]).toBe("get_market_status");
    expect(JSON.parse(String(call[2]))).toEqual({ includeIndices: true });
  });

  it("routes a navigation request before any other intent", async () => {
    await runDeterministicFallback(ctx(), [user("open the journal")]);
    const [call] = executeToolDefinition.mock.calls;
    expect(call[1]).toBe("navigate_to_section");
    expect(JSON.parse(String(call[2]))).toEqual({ section: "journal" });
  });

  it("extracts a subject for a price question", async () => {
    await runDeterministicFallback(ctx(), [user("what is the price of reliance")]);
    const [call] = executeToolDefinition.mock.calls;
    expect(call[1]).toBe("get_stock_price");
    expect(JSON.parse(String(call[2]))).toEqual({ ticker: "RELIANCE" });
  });

  it("asks which stock instead of guessing when a price question names none", async () => {
    const turn = await runDeterministicFallback(ctx(), [user("what is the price")]);
    expect(executeToolDefinition).not.toHaveBeenCalled();
    expect(turn.reply).toContain("Tell me which stock");
  });

  it("offers the available lookups when it cannot route the question", async () => {
    const turn = await runDeterministicFallback(ctx(), [user("write me a poem")]);
    expect(executeToolDefinition).not.toHaveBeenCalled();
    expect(turn.reply).toContain("The AI service is unavailable");
    expect(turn.cards).toEqual([]);
  });

  it("reports a failed lookup instead of a fabricated answer", async () => {
    executeToolDefinition.mockResolvedValue({
      status: "error",
      outcome: { status: "error", message: "Your portfolio could not be read right now.", retryable: true },
    });

    const turn = await runDeterministicFallback(ctx(), [user("show my holdings")]);
    expect(turn.reply).toContain("could not be read");
    expect(turn.cards).toEqual([]);
  });

  it("uses the last user message, so a follow-up keeps working", async () => {
    await runDeterministicFallback(ctx(), [
      user("show my holdings"),
      { role: "assistant", content: "You hold two positions." },
      user("what is my portfolio worth"),
    ]);
    expect(executeToolDefinition.mock.calls[0][1]).toBe("get_portfolio_summary");
  });
});
