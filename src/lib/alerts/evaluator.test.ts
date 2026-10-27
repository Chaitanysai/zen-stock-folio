/**
 * Evaluator tests.
 *
 * Every case uses hand-built envelopes with fixed timestamps so nothing here
 * depends on live market timing. The 20 required scenarios are labelled in the
 * `it(...)` names.
 */
import { describe, expect, it } from "vitest";
import type { QuoteEnvelope, DataMode, ProviderId } from "@/lib/market-data/types.ts";
import type { PriceAlert } from "@/data/sampleData";
import {
  evaluateAlerts,
  normalizeExchangeTimestamp,
  priceSatisfies,
  quoteIneligibility,
  resolveTarget,
  type AlertStateMap,
} from "./evaluator.ts";

/** An eligible, forward-dated envelope. Overrides make each case explicit. */
function envelope(overrides: Partial<QuoteEnvelope> = {}): QuoteEnvelope {
  const ts = overrides.exchangeTimestamp ?? "2026-10-27T09:45:00.000Z";
  return {
    provider: "yahoo" as ProviderId,
    dataMode: "delayed" as DataMode,
    fetchedAt: "2026-10-27T10:00:00.000Z",
    exchangeTimestamp: ts,
    cached: false,
    cacheAgeMs: 0,
    stale: false,
    unavailable: [],
    warnings: [],
    quote: {
      symbol: "RELIANCE",
      price: 2600,
      change: 10,
      changePercent: 0.4,
      previousClose: 2590,
      dayHigh: 2620,
      dayLow: 2580,
      weekHigh52: 2856,
      weekLow52: 2220,
      volume: 1000,
      currency: "INR",
      exchange: "NSE",
      name: "Reliance Industries",
    },
    ...overrides,
  };
}

function alert(overrides: Partial<PriceAlert> = {}): PriceAlert {
  return {
    id: "a1",
    ticker: "RELIANCE",
    type: "target_hit",
    targetPrice: 2550,
    direction: "above",
    triggered: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Run one evaluation against a single symbol's envelope. */
const ev = (
  env: QuoteEnvelope,
  a: PriceAlert[],
  state?: AlertStateMap,
) => evaluateAlerts({ [a[0].ticker.toUpperCase()]: env }, a, state);

describe("resolveTarget", () => {
  it("accepts above/below and rejects a between range without an upper bound", () => {
    expect(resolveTarget(alert({ direction: "above" }))).toEqual({ kind: "above", target: 2550 });
    expect(resolveTarget(alert({ direction: "below" }))).toEqual({ kind: "below", target: 2550 });
    expect(resolveTarget(alert({ direction: "between", targetPrice: 2500 })).kind).toBe("invalid");
  });

  it("requires lower < upper for a between range (13)", () => {
    expect(
      resolveTarget(alert({ direction: "between", targetPrice: 2500, targetPriceUpper: 2600 })),
    ).toEqual({ kind: "between", lower: 2500, upper: 2600 });
    expect(
      resolveTarget(alert({ direction: "between", targetPrice: 2600, targetPriceUpper: 2500 })).kind,
    ).toBe("invalid");
    expect(
      resolveTarget(alert({ direction: "between", targetPrice: 2500, targetPriceUpper: 2500 })).kind,
    ).toBe("invalid");
  });

  it("rejects non-finite and non-positive targets (13)", () => {
    expect(resolveTarget(alert({ targetPrice: Number.NaN })).kind).toBe("invalid");
    expect(resolveTarget(alert({ targetPrice: Number.POSITIVE_INFINITY })).kind).toBe("invalid");
    expect(resolveTarget(alert({ targetPrice: 0 })).kind).toBe("invalid");
  });
});

describe("normalizeExchangeTimestamp", () => {
  it("normalizes spelling and rejects junk", () => {
    expect(normalizeExchangeTimestamp("2026-10-27T09:45:00.000Z")).toBe("2026-10-27T09:45:00.000Z");
    // Same instant, different spelling → identical normalized identity.
    expect(normalizeExchangeTimestamp("2026-10-27T15:15:00+05:30")).toBe("2026-10-27T09:45:00.000Z");
    expect(normalizeExchangeTimestamp("")).toBeNull();
    expect(normalizeExchangeTimestamp("not-a-date")).toBeNull();
    expect(normalizeExchangeTimestamp(undefined)).toBeNull();
    expect(normalizeExchangeTimestamp(12345)).toBeNull();
  });
});

describe("quoteIneligibility", () => {
  it("flags every disqualifying field with a specific reason", () => {
    expect(quoteIneligibility(undefined)).toBe("missing_quote");
    expect(quoteIneligibility(envelope({ exchangeTimestamp: null }))).toBe("missing_timestamp");
    expect(quoteIneligibility(envelope({ exchangeTimestamp: "garbage" }))).toBe("invalid_timestamp");
    expect(quoteIneligibility(envelope({ stale: true }))).toBe("stale");
    expect(quoteIneligibility(envelope({ cached: true }))).toBe("cached");
    expect(quoteIneligibility(envelope({ dataMode: "eod" }))).toBe("eod_mode");
    expect(quoteIneligibility(envelope({ dataMode: "unknown" }))).toBe("unknown_mode");
    expect(quoteIneligibility(envelope({ quote: null }))).toBe("invalid_price");
    expect(quoteIneligibility(envelope({ quote: { ...envelope().quote!, price: null } }))).toBe(
      "invalid_price",
    );
    expect(quoteIneligibility(envelope({ quote: { ...envelope().quote!, price: Number.NaN } }))).toBe(
      "invalid_price",
    );
    expect(quoteIneligibility(envelope({ quote: { ...envelope().quote!, price: 0 } }))).toBe(
      "invalid_price",
    );
    expect(quoteIneligibility(envelope())).toBeNull();
    expect(quoteIneligibility(envelope({ dataMode: "realtime" }))).toBeNull();
  });
});

describe("priceSatisfies", () => {
  it("treats boundaries as inclusive (4)", () => {
    expect(priceSatisfies(2550, { kind: "above", target: 2550 })).toBe(true);
    expect(priceSatisfies(2549.99, { kind: "above", target: 2550 })).toBe(false);
    expect(priceSatisfies(2550, { kind: "below", target: 2550 })).toBe(true);
    expect(priceSatisfies(2550.01, { kind: "below", target: 2550 })).toBe(false);
    expect(priceSatisfies(2500, { kind: "between", lower: 2500, upper: 2600 })).toBe(true);
    expect(priceSatisfies(2600, { kind: "between", lower: 2500, upper: 2600 })).toBe(true);
    expect(priceSatisfies(2499.99, { kind: "between", lower: 2500, upper: 2600 })).toBe(false);
    expect(priceSatisfies(2600.01, { kind: "between", lower: 2500, upper: 2600 })).toBe(false);
  });
});

describe("evaluateAlerts — firing", () => {
  it("baselines first, then fires on a new observation crossing above (1, 14)", () => {
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [alert()]);
    // Price already satisfies the target, but this is the baseline: no fire.
    expect(first.firings).toHaveLength(0);
    expect(first.nextState["a1::RELIANCE"].baselineTimestamp).toBe("2026-10-27T09:45:00.000Z");

    const second = ev(
      envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", quote: { ...envelope().quote!, price: 2600 } }),
      [alert()],
      first.nextState,
    );
    expect(second.firings).toHaveLength(1);
    expect(second.firings[0]).toMatchObject({ ticker: "RELIANCE", price: 2600, dataMode: "delayed" });
  });

  it("fires on a new observation crossing below (2)", () => {
    const a = alert({ direction: "below", targetPrice: 2650 });
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z", quote: { ...envelope().quote!, price: 2700 } }), [a]);
    expect(first.firings).toHaveLength(0);
    const second = ev(
      envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", quote: { ...envelope().quote!, price: 2600 } }),
      [a],
      first.nextState,
    );
    expect(second.firings).toHaveLength(1);
  });

  it("fires on entry into a between range (3)", () => {
    const a = alert({ direction: "between", targetPrice: 2500, targetPriceUpper: 2600, type: "entry_zone" });
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z", quote: { ...envelope().quote!, price: 2650 } }), [a]);
    expect(first.firings).toHaveLength(0);
    const second = ev(
      envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", quote: { ...envelope().quote!, price: 2550 } }),
      [a],
      first.nextState,
    );
    expect(second.firings).toHaveLength(1);
  });

  it("treats the exact target price as satisfying (4)", () => {
    const a = alert({ targetPrice: 2600 });
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [a]);
    const second = ev(
      envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", quote: { ...envelope().quote!, price: 2600 } }),
      [a],
      first.nextState,
    );
    expect(second.firings).toHaveLength(1);
  });
});

describe("evaluateAlerts — duplicate suppression", () => {
  it("does not fire twice for an unchanged exchange timestamp (5, 6)", () => {
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [alert()]);
    const second = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }), [alert()], first.nextState);
    expect(second.firings).toHaveLength(1);
    const fired = second.nextState["a1::RELIANCE"];

    // Repeated polling with the same timestamp — the retained observation.
    const third = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }), [alert()], second.nextState);
    expect(third.firings).toHaveLength(0);
    // A later, different observation also cannot re-fire: one-shot.
    const fourth = ev(envelope({ exchangeTimestamp: "2026-10-27T09:55:00.000Z" }), [alert()], third.nextState);
    expect(fourth.firings).toHaveLength(0);
    expect(fourth.nextState["a1::RELIANCE"].firedTimestamp).toBe(fired.firedTimestamp);
  });

  it("does not assume a changed price under an identical timestamp is a new observation", () => {
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [alert()]);
    const second = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }), [alert()], first.nextState);
    expect(second.firings).toHaveLength(1);

    // Same timestamp, but the price moved: documented limitation — treated as
    // retained because the identity is the timestamp, not the price.
    const third = ev(
      envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", quote: { ...envelope().quote!, price: 9999 } }),
      [alert()],
      second.nextState,
    );
    expect(third.firings).toHaveLength(0);
  });

  it("survives a simulated reload via persisted state (17)", () => {
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [alert()]);
    const second = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }), [alert()], first.nextState);
    expect(second.firings).toHaveLength(1);

    // App restart: only the serialized state comes back.
    const revived = JSON.parse(JSON.stringify(second.nextState)) as AlertStateMap;
    const afterReload = ev(envelope({ exchangeTimestamp: "2026-10-27T09:55:00.000Z" }), [alert()], revived);
    expect(afterReload.firings).toHaveLength(0);
  });
});

describe("evaluateAlerts — ineligible quotes never fire (7-12, 15)", () => {
  const baselineAndThen = (bad: QuoteEnvelope) => {
    const a = [alert({ targetPrice: 100 })];
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), a);
    const second = ev(bad, a, first.nextState);
    return second;
  };

  it("never fires on a cached quote (7)", () => {
    const r = baselineAndThen(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", cached: true }));
    expect(r.firings).toHaveLength(0);
    expect(r.ineligible["a1"]).toBe("cached");
  });

  it("never fires on a stale quote (8)", () => {
    const r = baselineAndThen(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", stale: true }));
    expect(r.firings).toHaveLength(0);
    expect(r.ineligible["a1"]).toBe("stale");
  });

  it("never fires on an EOD quote (9)", () => {
    const r = baselineAndThen(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", dataMode: "eod" }));
    expect(r.firings).toHaveLength(0);
    expect(r.ineligible["a1"]).toBe("eod_mode");
  });

  it("never fires on an unknown data mode (10)", () => {
    const r = baselineAndThen(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", dataMode: "unknown" }));
    expect(r.firings).toHaveLength(0);
    expect(r.ineligible["a1"]).toBe("unknown_mode");
  });

  it("never fires on a missing or invalid timestamp (11)", () => {
    expect(baselineAndThen(envelope({ exchangeTimestamp: null })).ineligible["a1"]).toBe("missing_timestamp");
    expect(baselineAndThen(envelope({ exchangeTimestamp: "nope" })).ineligible["a1"]).toBe("invalid_timestamp");
  });

  it("never fires on a missing or non-finite price (12)", () => {
    expect(baselineAndThen(envelope({ quote: null })).ineligible["a1"]).toBe("invalid_price");
    expect(
      baselineAndThen(envelope({ quote: { ...envelope().quote!, price: Number.NaN } })).ineligible["a1"],
    ).toBe("invalid_price");
  });

  it("does not fire from retained data after an ineligible→eligible transition (15)", () => {
    const a = [alert({ targetPrice: 100 })]; // already satisfied
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), a);
    expect(first.firings).toHaveLength(0);
    // Ineligible in between — must not fire.
    const stale = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", stale: true }), a, first.nextState);
    expect(stale.firings).toHaveLength(0);
    // Eligible again but the *same* observation we already baselined: still no fire.
    const same = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), a, stale.nextState);
    expect(same.firings).toHaveLength(0);
  });

  it("treats a backward timestamp move as a correction, not a fire (19)", () => {
    const a = [alert({ targetPrice: 100 })]; // satisfied, so a naive rule would fire
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }), a);
    const back = ev(envelope({ exchangeTimestamp: "2026-10-27T09:40:00.000Z" }), a, first.nextState);
    expect(back.firings).toHaveLength(0);
    expect(back.nextState["a1::RELIANCE"].baselineTimestamp).toBe("2026-10-27T09:40:00.000Z");
  });
});

describe("evaluateAlerts — lifecycle and isolation", () => {
  it("reports an invalid legacy between alert instead of firing (13, 20)", () => {
    const legacy = alert({ direction: "between", targetPrice: 2500 }); // no upper bound
    const r = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [legacy]);
    expect(r.firings).toHaveLength(0);
    expect(r.invalid[legacy.id]).toMatch(/upper bound/i);
  });

  it("skips disabled alerts", () => {
    const r = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [alert({ enabled: false })]);
    expect(r.firings).toHaveLength(0);
    expect(r.nextState["a1::RELIANCE"]).toBeUndefined();
  });

  it("keeps multiple symbols and alerts isolated (18)", () => {
    // a1 is satisfied by RELIANCE (2600 ≥ 100); a2 is NOT satisfied by TCS
    // (3900 is below its 5000 target) — so only a1 may fire.
    const alerts: PriceAlert[] = [
      alert({ id: "a1", ticker: "RELIANCE", targetPrice: 100 }),
      alert({ id: "a2", ticker: "TCS", targetPrice: 5000 }),
    ];
    const envs = {
      RELIANCE: envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }),
      TCS: envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z", quote: { ...envelope().quote!, symbol: "TCS", price: 3900 } }),
    };
    const first = evaluateAlerts(envs, alerts, undefined);
    expect(first.firings).toHaveLength(0);

    const second = evaluateAlerts(
      {
        RELIANCE: envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }),
        TCS: envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z", quote: { ...envelope().quote!, symbol: "TCS", price: 3900 } }),
      },
      alerts,
      first.nextState,
    );
    expect(second.firings.map((f) => f.alertId)).toEqual(["a1"]);
    expect(second.nextState["a2::TCS"].firedTimestamp).toBeNull();
  });

  it("adds a new alert to a populated state map without disturbing others", () => {
    const a1 = alert({ id: "a1", ticker: "RELIANCE", targetPrice: 100 });
    const existing: AlertStateMap = {
      "a1::RELIANCE": { firedTimestamp: "2026-10-27T09:00:00.000Z", baselineTimestamp: "2026-10-27T08:00:00.000Z", dismissed: true },
    };
    const a2 = alert({ id: "a2", ticker: "TCS", targetPrice: 100 });
    const r = evaluateAlerts(
      { TCS: envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z", quote: { ...envelope().quote!, symbol: "TCS", price: 200 } }) },
      [a1, a2],
      existing,
    );
    expect(r.nextState["a1::RELIANCE"]).toEqual(existing["a1::RELIANCE"]);
    expect(r.nextState["a2::TCS"].baselineTimestamp).toBe("2026-10-27T09:45:00.000Z");
  });

  it("does not re-arm a one-shot alert when its notification is dismissed (16)", () => {
    const first = ev(envelope({ exchangeTimestamp: "2026-10-27T09:45:00.000Z" }), [alert()]);
    const second = ev(envelope({ exchangeTimestamp: "2026-10-27T09:50:00.000Z" }), [alert()], first.nextState);
    expect(second.firings).toHaveLength(1);

    // The UI dismisses the notification by flipping its own display flag; the
    // evaluator's fired marker is untouched.
    const dismissed = {
      ...second.nextState,
      "a1::RELIANCE": { ...second.nextState["a1::RELIANCE"], dismissed: true },
    };
    const fourth = ev(envelope({ exchangeTimestamp: "2026-10-27T09:55:00.000Z" }), [alert()], dismissed);
    expect(fourth.firings).toHaveLength(0);
    expect(fourth.nextState["a1::RELIANCE"].dismissed).toBe(true);
  });
});
