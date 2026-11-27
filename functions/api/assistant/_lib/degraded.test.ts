// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistantCard } from "../../../../src/lib/assistant/schemas.ts";
import { DASHBOARD_SECTION_IDS } from "../../../../src/lib/navigation/routes.ts";

const executeToolDefinition = vi.fn();

vi.mock("./tools/registry", () => ({
  executeToolDefinition: (...args: unknown[]) => executeToolDefinition(...args),
}));

const { runDeterministicFallback, resolveNavigationSection } = await import("./degraded");
const { createToolContext } = await import("./context");
const { makeEnv } = await import("../../_lib/testHelpers");

const ctx = () => createToolContext({ env: makeEnv(), uid: "user-1", token: "t", now: Date.now() });

const card: AssistantCard = {
  kind: "metrics",
  title: "Portfolio summary",
  metrics: [{ label: "Open positions", value: 2, currency: null }],
};

const user = (content: string) => ({ role: "user" as const, content });

/** Runs one turn and returns the single mocked tool call. */
const call = async (content: string) => {
  await runDeterministicFallback(ctx(), [user(content)]);
  return executeToolDefinition.mock.calls[0];
};

const expectNavigation = async (content: string, section: string) => {
  const [, name, rawArgs] = await call(content);
  expect(name).toBe("navigate_to_section");
  expect(JSON.parse(String(rawArgs))).toEqual({ section });
};

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
    const [callArgs] = executeToolDefinition.mock.calls;
    expect(callArgs[1]).toBe("get_market_status");
    expect(JSON.parse(String(callArgs[2]))).toEqual({ includeIndices: true });
  });

  it("routes a navigation request before any other intent", async () => {
    await runDeterministicFallback(ctx(), [user("open the journal")]);
    const [callArgs] = executeToolDefinition.mock.calls;
    expect(callArgs[1]).toBe("navigate_to_section");
    expect(JSON.parse(String(callArgs[2]))).toEqual({ section: "journal" });
  });

  it("extracts a subject for a price question", async () => {
    await runDeterministicFallback(ctx(), [user("what is the price of reliance")]);
    const [callArgs] = executeToolDefinition.mock.calls;
    expect(callArgs[1]).toBe("get_stock_price");
    expect(JSON.parse(String(callArgs[2]))).toEqual({ ticker: "RELIANCE" });
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

describe("A2 — canonical navigation reconstruction", () => {
  it("derives all 14 destinations from the canonical routes.ts list", () => {
    expect(DASHBOARD_SECTION_IDS).toHaveLength(14);
    for (const section of DASHBOARD_SECTION_IDS) {
      expect(resolveNavigationSection(`open the ${section}`)).toBe(section);
    }
  });

  for (const section of DASHBOARD_SECTION_IDS) {
    it(`navigates to the ${section} section`, async () => {
      await expectNavigation(`open the ${section}`, section);
    });
  }

  it("accepts the exact singular and plural aliases", async () => {
    const aliases: ReadonlyArray<readonly [string, string]> = [
      ["broker", "brokers"],
      ["alert", "alerts"],
      ["chart", "charts"],
      ["trade", "trades"],
    ];
    const expected: Record<string, string> = {
      broker: "brokers", brokers: "brokers",
      alert: "alerts", alerts: "alerts",
      chart: "charts", charts: "charts",
      trade: "trades", trades: "trades",
    };
    for (const [singular, plural] of aliases) {
      await expectNavigation(`open the ${singular}`, expected[singular]);
      executeToolDefinition.mockReset();
      executeToolDefinition.mockResolvedValue({
        status: "ok",
        outcome: { status: "ok", summary: "ok", data: {}, card },
      });
      await expectNavigation(`show me the ${plural}`, expected[plural]);
      executeToolDefinition.mockReset();
      executeToolDefinition.mockResolvedValue({
        status: "ok",
        outcome: { status: "ok", summary: "ok", data: {}, card },
      });
    }
  });

  for (const misspelling of ["brokeres", "alertes", "chartes", "tradees"]) {
    it(`rejects the misspelling "${misspelling}"`, async () => {
      const turn = await runDeterministicFallback(ctx(), [user(`open the ${misspelling}`)]);
      expect(executeToolDefinition).not.toHaveBeenCalled();
      expect(turn.toolCalls).toBe(0);
      expect(turn.reply).toContain("The AI service is unavailable");
    });
  }

  it("recognises legitimate navigation phrases", async () => {
    const phrases: ReadonlyArray<readonly [string, string]> = [
      ["open the journal", "journal"],
      ["go to the charts", "charts"],
      ["navigate to the alerts", "alerts"],
      ["take me to the watchlist", "watchlist"],
      ["show me the brokers", "brokers"],
      ["where are my alerts", "alerts"],
      ["where is the watchlist", "watchlist"],
      ["where do i find my journal", "journal"],
    ];
    for (const [phrase, section] of phrases) {
      await expectNavigation(phrase, section);
      executeToolDefinition.mockReset();
      executeToolDefinition.mockResolvedValue({
        status: "ok",
        outcome: { status: "ok", summary: "ok", data: {}, card },
      });
    }
  });

  it('routes "open performance" to analytics, never to portfolio summary', async () => {
    await expectNavigation("open performance", "analytics");
  });

  it('routes "show me the performance" to analytics', async () => {
    await expectNavigation("show me the performance", "analytics");
  });

  it("keeps portfolio performance and holdings as data requests", async () => {
    await runDeterministicFallback(ctx(), [user("what is my portfolio performance")]);
    expect(executeToolDefinition.mock.calls[0][1]).toBe("get_portfolio_summary");

    executeToolDefinition.mockReset();
    executeToolDefinition.mockResolvedValue({
      status: "ok",
      outcome: { status: "ok", summary: "ok", data: {}, card },
    });
    await runDeterministicFallback(ctx(), [user("how is my portfolio doing")]);
    expect(executeToolDefinition.mock.calls[0][1]).toBe("get_portfolio_summary");

    executeToolDefinition.mockReset();
    executeToolDefinition.mockResolvedValue({
      status: "ok",
      outcome: { status: "ok", summary: "ok", data: {}, card },
    });
    await runDeterministicFallback(ctx(), [user("show my holdings")]);
    expect(executeToolDefinition.mock.calls[0][1]).toBe("get_holdings");
  });

  it('distinguishes "open holdings" (navigation) from "show my holdings" (data)', async () => {
    await expectNavigation("open the holdings", "holdings");
  });

  it("does not fall back to Watchlist for unknown navigation requests", async () => {
    for (const phrase of ["open the galaxy", "where is my imagination", "open the portal"]) {
      const turn = await runDeterministicFallback(ctx(), [user(phrase)]);
      expect(executeToolDefinition).not.toHaveBeenCalled();
      expect(turn.toolCalls).toBe(0);
      expect(turn.reply).toContain("The AI service is unavailable");
    }
  });

  it("resolves overlapping phrases by the most specific alias", async () => {
    const phrases: ReadonlyArray<readonly [string, string]> = [
      ["open trade history", "history"],
      ["open trade journal", "journal"],
      ["open price alerts", "alerts"],
      ["open sector allocation", "sector"],
      ["open ai insights", "ai"],
      ["open broker connections", "brokers"],
      ["open news feed", "news"],
      ["open portfolio holdings", "holdings"],
    ];
    for (const [phrase, section] of phrases) {
      await expectNavigation(phrase, section);
      executeToolDefinition.mockReset();
      executeToolDefinition.mockResolvedValue({
        status: "ok",
        outcome: { status: "ok", summary: "ok", data: {}, card },
      });
    }
  });

  it("does not navigate for how-to questions", async () => {
    for (const phrase of ["how do I open a broker account", "how can I open the alerts"]) {
      const turn = await runDeterministicFallback(ctx(), [user(phrase)]);
      expect(executeToolDefinition).not.toHaveBeenCalled();
      expect(turn.toolCalls).toBe(0);
      expect(turn.reply).toContain("The AI service is unavailable");
    }
  });

  it("does not let a distant section word hijack a data request", async () => {
    const dataPhrases = [
      "where are my closed trades",
      "show me the performance of my holdings",
      "open a position in the charts",
    ];
    for (const phrase of dataPhrases) {
      const turn = await runDeterministicFallback(ctx(), [user(phrase)]);
      const [, name] = executeToolDefinition.mock.calls[0];
      expect(name).not.toBe("navigate_to_section");
      expect(turn.toolCalls).toBe(1);
      executeToolDefinition.mockReset();
      executeToolDefinition.mockResolvedValue({
        status: "ok",
        outcome: { status: "ok", summary: "ok", data: {}, card },
      });
    }
  });

  it("preserves the closed-trade data route", async () => {
    await runDeterministicFallback(ctx(), [user("show my closed trades")]);
    const [, name, rawArgs] = executeToolDefinition.mock.calls[0];
    expect(name).toBe("get_holdings");
    expect(JSON.parse(String(rawArgs))).toEqual({ status: "closed", limit: 10 });
  });

  it("answers section help from the static guidance map (D1)", async () => {
    const turn = await runDeterministicFallback(ctx(), [user("what can i do here?")], {
      page: { section: "holdings" },
    });

    expect(executeToolDefinition).not.toHaveBeenCalled();
    expect(turn.reply).toContain("This is the Portfolio");
    expect(turn.reply).toContain("without AI");
    expect(turn.toolCalls).toBe(0);
  });

  it("uses a normalised conversation ticker when no subject is present (D2)", async () => {
    await runDeterministicFallback(ctx(), [user("what about its price")], {
      ticker: "[INST] reliance",
      market: "NSE",
    });
    const [, name, rawArgs] = executeToolDefinition.mock.calls[0];
    expect(name).toBe("get_stock_price");
    expect(JSON.parse(String(rawArgs))).toEqual({ ticker: "RELIANCE" });
  });

  it("never guesses a pronoun as a ticker (D3, G5)", async () => {
    const turn = await runDeterministicFallback(ctx(), [user("what about its price")]);
    expect(executeToolDefinition).not.toHaveBeenCalled();
    expect(turn.reply).toContain("Tell me which stock");
  });
});
