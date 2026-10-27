/**
 * Live-shape integration tests for the alert evaluator.
 *
 * The fixtures below are copied from a REAL `/api/quotes` response captured from
 * the running local handler (`http://127.0.0.1:3000`, provider `yahoo`, market
 * closed → `dataMode: "eod"`). They are not invented prices: they exist to pin
 * the exact wire shape the client normalizes and the evaluator consumes, so a
 * change to either side that drops provenance fails here.
 *
 * The firing scenarios use `delayed` variants (same shape, mode/served fields
 * changed) because a closed market only serves EOD, which by design cannot fire.
 */
import { describe, expect, it } from "vitest";
import type { QuotesResponse, QuoteEnvelope } from "@/lib/market-data/types.ts";
import { evaluateAlerts } from "./evaluator";
import type { PriceAlert } from "@/data/sampleData";

/** Captured verbatim from the local handler on 2026-10-27 (market closed). */
const LIVE_RESPONSE: QuotesResponse = {
  quotes: {
    RELIANCE: {
      provider: "yahoo",
      dataMode: "eod",
      fetchedAt: "2026-10-27T10:44:08.875Z",
      exchangeTimestamp: "2026-10-27T09:58:13.000Z",
      cached: false,
      cacheAgeMs: 0,
      stale: false,
      unavailable: [],
      warnings: [],
      quote: {
        symbol: "RELIANCE",
        price: 1196.2,
        change: -5.6,
        changePercent: -0.466,
        previousClose: 1201.8,
        dayHigh: 1202.6,
        dayLow: 1184,
        weekHigh52: 1611.8,
        weekLow52: 1152.2,
        volume: 13064086,
        currency: "INR",
        exchange: "NSE",
        name: "Reliance Industries Limited",
      },
    },
  },
  fetchedAt: "2026-10-27T10:44:08.875Z",
  providerCounts: { yahoo: 3 },
  missing: [],
  notes: [],
};

/** Same envelope, re-labelled as a live-session delayed quote. */
function asDelayed(env: QuoteEnvelope, opts: { ts: string; price: number; cached?: boolean }): QuoteEnvelope {
  return {
    ...env,
    dataMode: "delayed",
    cached: opts.cached ?? false,
    cacheAgeMs: 0,
    stale: false,
    exchangeTimestamp: opts.ts,
    quote: { ...env.quote!, price: opts.price },
  };
}

const alert: PriceAlert = {
  id: "live-a1",
  ticker: "RELIANCE",
  type: "target_hit",
  targetPrice: 1200,
  direction: "above",
  triggered: false,
  createdAt: "2026-10-01T00:00:00.000Z",
};

describe("alert evaluation against the real quote wire shape", () => {
  it("preserves provenance fields the evaluator relies on", () => {
    const env = LIVE_RESPONSE.quotes.RELIANCE;
    // These are exactly the fields eligibility reads; a serializer regression
    // that dropped any of them would break this assertion.
    expect(env.provider).toBe("yahoo");
    expect(typeof env.dataMode).toBe("string");
    expect(env.exchangeTimestamp).not.toBeNull();
    expect(Number.isFinite(Date.parse(env.exchangeTimestamp as string))).toBe(true);
    expect(typeof env.cached).toBe("boolean");
    expect(typeof env.stale).toBe("boolean");
    expect(Number.isFinite(env.quote?.price)).toBe(true);
  });

  it("does NOT fire on the captured EOD quote even though the price is above target", () => {
    const result = evaluateAlerts(LIVE_RESPONSE.quotes, [alert], {});
    expect(result.firings).toHaveLength(0);
    expect(result.ineligible["live-a1"]).toBe("eod_mode");
  });

  it("baselines a delayed quote, then fires on the next new observation above target", () => {
    const first = evaluateAlerts(
      { RELIANCE: asDelayed(LIVE_RESPONSE.quotes.RELIANCE, { ts: "2026-10-27T10:00:00.000Z", price: 1190 }) },
      [alert],
      {},
    );
    // 1190 is below the 1200 target, and it is the baseline anyway.
    expect(first.firings).toHaveLength(0);

    const second = evaluateAlerts(
      { RELIANCE: asDelayed(LIVE_RESPONSE.quotes.RELIANCE, { ts: "2026-10-27T10:01:00.000Z", price: 1205 }) },
      [alert],
      first.nextState,
    );
    expect(second.firings).toHaveLength(1);
    expect(second.firings[0]).toMatchObject({ ticker: "RELIANCE", price: 1205, provider: "yahoo", dataMode: "delayed" });
  });

  it("does not re-fire when the served quote is the retained (cached) observation", () => {
    const base = LIVE_RESPONSE.quotes.RELIANCE;
    const first = evaluateAlerts(
      { RELIANCE: asDelayed(base, { ts: "2026-10-27T10:00:00.000Z", price: 1210 }) },
      [alert],
      {},
    );
    expect(first.firings).toHaveLength(0); // baseline, never fires

    const fired = evaluateAlerts(
      { RELIANCE: asDelayed(base, { ts: "2026-10-27T10:01:00.000Z", price: 1215 }) },
      [alert],
      first.nextState,
    );
    expect(fired.firings).toHaveLength(1);

    // The second proxied call above came back with cached:true and the SAME
    // exchangeTimestamp — a retained observation must not fire again.
    const retained = evaluateAlerts(
      { RELIANCE: asDelayed(base, { ts: "2026-10-27T10:01:00.000Z", price: 1215, cached: true }) },
      [alert],
      fired.nextState,
    );
    expect(retained.firings).toHaveLength(0);
    expect(retained.ineligible["live-a1"]).toBe("cached");
  });
});
