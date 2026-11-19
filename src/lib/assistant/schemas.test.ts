import { describe, expect, it } from "vitest";
import { DASHBOARD_SECTION_IDS } from "../navigation/routes";
import {
  MAX_CARDS_PER_TURN,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  assistantCardSchema,
  chatRequestSchema,
  navigateToSectionArgsSchema,
} from "./schemas";

const envelope = (over: Record<string, unknown> = {}) => ({
  conversationId: "conv-abc-123",
  messages: [{ role: "user", content: "how is my portfolio doing?" }],
  ...over,
});

describe("assistant wire contract", () => {
  it("accepts a minimal conversation", () => {
    expect(chatRequestSchema.safeParse(envelope()).success).toBe(true);
  });

  it("rejects a smuggled identity or role field instead of ignoring it", () => {
    // The strict envelope is the anti-spoofing boundary: identity comes from the
    // verified token, so any attempt to supply it in the body must fail loudly.
    expect(chatRequestSchema.safeParse(envelope({ uid: "victim" })).success).toBe(false);
    expect(chatRequestSchema.safeParse(envelope({ userId: "victim" })).success).toBe(false);
    expect(chatRequestSchema.safeParse(envelope({ role: "admin" })).success).toBe(false);
  });

  it("bounds the history, the message size and the conversation id", () => {
    const tooMany = Array.from({ length: MAX_HISTORY_MESSAGES + 1 }, () => ({
      role: "user" as const,
      content: "hi",
    }));
    expect(chatRequestSchema.safeParse(envelope({ messages: tooMany })).success).toBe(false);

    expect(
      chatRequestSchema.safeParse(envelope({ messages: [{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 1) }] }))
        .success,
    ).toBe(false);

    expect(chatRequestSchema.safeParse(envelope({ conversationId: "short" })).success).toBe(false);
    expect(chatRequestSchema.safeParse(envelope({ conversationId: "../../etc/passwd" })).success).toBe(false);
  });

  it("refuses a non-finite number in a card, so a UI can never render NaN", () => {
    const metrics = {
      kind: "metrics",
      title: "Portfolio",
      metrics: [{ label: "Value", value: Number.NaN, currency: "INR" }],
    };
    expect(assistantCardSchema.safeParse(metrics).success).toBe(false);

    const infinite = { ...metrics, metrics: [{ label: "Value", value: Number.POSITIVE_INFINITY, currency: "INR" }] };
    expect(assistantCardSchema.safeParse(infinite).success).toBe(false);

    const unknown = { ...metrics, metrics: [{ label: "Value", value: null, currency: "INR" }] };
    expect(assistantCardSchema.safeParse(unknown).success).toBe(true);
  });

  it("caps the number of cards a turn may render", () => {
    const quote = (ticker: string) => ({
      kind: "quote" as const,
      title: ticker,
      ticker,
      market: "NSE" as const,
      currency: "INR" as const,
      price: 100,
      changePercent: 1,
      weekHigh52: 120,
      weekLow52: 80,
      asOf: null,
      dataMode: "eod" as const,
    });
    const cards = Array.from({ length: MAX_CARDS_PER_TURN + 1 }, (_, index) => quote(`T${index}`));
    const response = {
      reply: "ok",
      cards,
      degraded: false,
      provider: "groq",
      model: "m",
      usage: { rounds: 1, toolCalls: 0, durationMs: 10 },
      toolTrace: [],
    };
    // Validated by the client too: a runaway server must not be able to flood
    // the panel with an unbounded card list.
    expect(assistantCardSchema.array().max(MAX_CARDS_PER_TURN).safeParse(response.cards).success).toBe(false);
  });

  it("only accepts real dashboard sections for navigation", () => {
    expect(navigateToSectionArgsSchema.safeParse({ section: "holdings" }).success).toBe(true);
    expect(navigateToSectionArgsSchema.safeParse({ section: "admin" }).success).toBe(false);
    expect(navigateToSectionArgsSchema.safeParse({ section: "/dashboard/holdings" }).success).toBe(false);
  });
});

describe("assistant page context (B1)", () => {
  const withPage = (page: Record<string, unknown>) => envelope({ context: { page } });

  it("accepts every canonical section (X4)", () => {
    expect(DASHBOARD_SECTION_IDS).toHaveLength(14);
    for (const section of DASHBOARD_SECTION_IDS) {
      expect(chatRequestSchema.safeParse(withPage({ section })).success).toBe(true);
    }
  });

  it("rejects unknown sections and malformed context instead of ignoring them (X5, X7)", () => {
    expect(chatRequestSchema.safeParse(withPage({ section: "admin" })).success).toBe(false);
    expect(chatRequestSchema.safeParse(withPage({ section: "/dashboard/holdings" })).success).toBe(false);
    expect(chatRequestSchema.safeParse(withPage({ section: 42 })).success).toBe(false);
    expect(chatRequestSchema.safeParse(envelope({ context: { page: "overview" } })).success).toBe(false);
    expect(chatRequestSchema.safeParse(envelope({ context: { page: { section: "overview", bogus: 1 } } })).success).toBe(
      false,
    );
    expect(
      chatRequestSchema.safeParse(envelope({ context: { page: { section: "overview" }, extra: "x" } })).success,
    ).toBe(false);
  });

  it("allows a page ticker only on charts and caps its length (X3, X10, X9)", () => {
    expect(chatRequestSchema.safeParse(withPage({ section: "charts", ticker: "RELIANCE" })).success).toBe(true);
    expect(chatRequestSchema.safeParse(withPage({ section: "overview", ticker: "RELIANCE" })).success).toBe(false);
    expect(chatRequestSchema.safeParse(withPage({ section: "charts", ticker: "x".repeat(25) })).success).toBe(false);
    expect(
      chatRequestSchema.safeParse(withPage({ section: "charts", ticker: "AAPL", market: "US" })).success,
    ).toBe(true);
  });

  it("stays backward compatible when context or page is absent (X6, X8)", () => {
    expect(chatRequestSchema.safeParse(envelope()).success).toBe(true);
    expect(chatRequestSchema.safeParse(envelope({ context: {} })).success).toBe(true);
    expect(chatRequestSchema.safeParse(envelope({ context: { ticker: "TCS", market: "NSE" } })).success).toBe(true);
  });

  it("keeps the strict envelope when a page is present (S2)", () => {
    expect(
      chatRequestSchema.safeParse(
        envelope({ uid: "victim", context: { page: { section: "overview" } } }),
      ).success,
    ).toBe(false);
  });
});
