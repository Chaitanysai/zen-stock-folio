import { describe, expect, it } from "vitest";
import { evaluateAlerts, isAlertTriggered } from "./priceAlerts";
import type { PriceAlert } from "@/data/sampleData";

const alert = (overrides: Partial<PriceAlert> = {}): PriceAlert => ({
  id: "alert-1",
  ticker: "RELIANCE",
  type: "target_hit",
  targetPrice: 100,
  direction: "above",
  triggered: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const NOW = new Date("2026-10-27T09:30:00.000Z").getTime();

const at = (msFromNow: number): string => new Date(NOW + msFromNow).toISOString();

/** A quote observed 30 seconds before the evaluation instant. */
const freshQuote = (price: number) => ({ price, asOf: at(-30_000) });

/** A quote delivered by a fresh response whose server omitted asOf (legacy endpoint). */
const freshReceipt = (price: number) => ({ price, receivedAt: at(-30_000) });

describe("isAlertTriggered", () => {
  it("triggers an above alert at or above the target", () => {
    expect(isAlertTriggered(alert({ direction: "above" }), 99.99)).toBe(false);
    expect(isAlertTriggered(alert({ direction: "above" }), 100)).toBe(true);
    expect(isAlertTriggered(alert({ direction: "above" }), 101)).toBe(true);
  });

  it("triggers a below alert at or below the target", () => {
    expect(isAlertTriggered(alert({ direction: "below" }), 101)).toBe(false);
    expect(isAlertTriggered(alert({ direction: "below" }), 100)).toBe(true);
    expect(isAlertTriggered(alert({ direction: "below" }), 99)).toBe(true);
  });

  it("never triggers on an invalid or non-positive price", () => {
    expect(isAlertTriggered(alert(), 0)).toBe(false);
    expect(isAlertTriggered(alert(), -5)).toBe(false);
    expect(isAlertTriggered(alert(), Number.NaN)).toBe(false);
  });

  it("does not guess at 'between' alerts that have no lower bound in the model", () => {
    expect(isAlertTriggered(alert({ direction: "between" }), 100)).toBe(false);
  });
});

describe("evaluateAlerts", () => {
  it("marks only alerts whose price crossed the threshold", () => {
    const alerts = [
      alert({ id: "a", ticker: "AAA", direction: "above", targetPrice: 100 }),
      alert({ id: "b", ticker: "BBB", direction: "below", targetPrice: 50 }),
      alert({ id: "c", ticker: "CCC", direction: "above", targetPrice: 200 }),
    ];

    const result = evaluateAlerts(
      alerts,
      { AAA: freshQuote(101), BBB: freshQuote(49), CCC: freshQuote(150) },
      { now: NOW },
    );

    expect(result.newlyTriggered.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.alerts.map((a) => a.triggered)).toEqual([true, true, false]);
    expect(result.alerts[0].triggeredAt).toBe("2026-10-27T09:30:00.000Z");
    expect(result.alerts[2].triggeredAt).toBeUndefined();
  });

  it("does not re-notify alerts that are already triggered", () => {
    const first = evaluateAlerts(
      [alert({ id: "a", ticker: "AAA" })],
      { AAA: freshQuote(101) },
      { now: NOW },
    );

    const second = evaluateAlerts(
      first.alerts,
      { AAA: { price: 102, asOf: at(60_000) } },
      { now: NOW + 60_000 },
    );

    expect(second.newlyTriggered).toEqual([]);
    expect(second.alerts).toBe(first.alerts);
  });

  it("leaves alerts untouched when the ticker has no usable price", () => {
    const alerts = [alert({ ticker: "AAA" })];

    const result = evaluateAlerts(alerts, {}, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(alerts);
  });

  it("skips dismissed alerts so they cannot re-notify", () => {
    const alerts = [
      alert({
        id: "a",
        ticker: "AAA",
        triggered: true,
        triggeredAt: "2026-10-01T00:00:00.000Z",
        dismissedAt: "2026-10-02T00:00:00.000Z",
      }),
    ];

    const result = evaluateAlerts(alerts, { AAA: freshQuote(500) }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(alerts);
  });

  it("returns the same array when nothing triggers", () => {
    const alerts = [alert({ ticker: "AAA", targetPrice: 500 })];

    const result = evaluateAlerts(alerts, { AAA: freshQuote(100) }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(alerts);
  });
});

describe("evaluateAlerts freshness guards", () => {
  const crossing = [alert({ ticker: "AAA", targetPrice: 100 })];

  it("triggers on a fresh quote that crosses the threshold", () => {
    const result = evaluateAlerts(crossing, { AAA: freshQuote(101) }, { now: NOW });

    expect(result.newlyTriggered.map((a) => a.id)).toEqual(["alert-1"]);
  });

  it("ignores quotes older than the maximum age", () => {
    const stale = { price: 101, asOf: at(-25 * 60 * 60 * 1000) };

    const result = evaluateAlerts(crossing, { AAA: stale }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(crossing);
  });

  it("accepts a quote exactly at the maximum age", () => {
    const edge = { price: 101, asOf: at(-24 * 60 * 60 * 1000) };

    const result = evaluateAlerts(crossing, { AAA: edge }, { now: NOW });

    expect(result.newlyTriggered.map((a) => a.id)).toEqual(["alert-1"]);
  });

  it("ignores quotes with no timestamp at all instead of assuming they are fresh", () => {
    const result = evaluateAlerts(crossing, { AAA: { price: 101 } }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(crossing);
  });

  it("falls back to the receipt time when the server omits asOf", () => {
    const result = evaluateAlerts(crossing, { AAA: freshReceipt(101) }, { now: NOW });

    expect(result.newlyTriggered.map((a) => a.id)).toEqual(["alert-1"]);
  });

  it("prefers the server asOf over receipt time so cached quotes stay rejected", () => {
    const cached = {
      price: 101,
      asOf: at(-25 * 60 * 60 * 1000),
      receivedAt: at(-30_000),
    };

    const result = evaluateAlerts(crossing, { AAA: cached }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(crossing);
  });

  it("ignores receipts older than the maximum age", () => {
    const oldReceipt = { price: 101, receivedAt: at(-25 * 60 * 60 * 1000) };

    const result = evaluateAlerts(crossing, { AAA: oldReceipt }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(crossing);
  });

  it("ignores quotes observed before the alert was created", () => {
    const created = [alert({ ticker: "AAA", targetPrice: 100, createdAt: at(-10_000) })];
    const beforeCreation = { price: 101, asOf: at(-20_000) };

    const result = evaluateAlerts(created, { AAA: beforeCreation }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(created);
  });

  it("ignores timestamps implausibly in the future", () => {
    const skewed = { price: 101, asOf: at(10 * 60 * 1000) };

    const result = evaluateAlerts(crossing, { AAA: skewed }, { now: NOW });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(crossing);
  });

  it("evaluates nothing after a failed refresh", () => {
    const result = evaluateAlerts(crossing, { AAA: freshQuote(101) }, {
      now: NOW,
      refreshFailed: true,
    });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(crossing);
  });

  it("ignores retained prices for tickers no longer being tracked", () => {
    const retained = [alert({ id: "gone", ticker: "GONE", targetPrice: 100 })];

    const result = evaluateAlerts(retained, { GONE: freshQuote(150) }, {
      now: NOW,
      activeTickers: new Set(["RELIANCE"]),
    });

    expect(result.newlyTriggered).toEqual([]);
    expect(result.alerts).toBe(retained);
  });

  it("still evaluates tracked tickers alongside retained ones", () => {
    const alerts = [
      alert({ id: "gone", ticker: "GONE", targetPrice: 100 }),
      alert({ id: "live", ticker: "AAA", targetPrice: 100 }),
    ];

    const result = evaluateAlerts(alerts, { GONE: freshQuote(150), AAA: freshQuote(101) }, {
      now: NOW,
      activeTickers: new Set(["AAA"]),
    });

    expect(result.newlyTriggered.map((a) => a.id)).toEqual(["live"]);
  });
});
