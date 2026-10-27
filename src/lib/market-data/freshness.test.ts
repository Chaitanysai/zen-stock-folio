/**
 * Freshness derivation and provenance.
 *
 * The central rule under test: a freshness label is derived from the provider's
 * exchange timestamp plus the exchange clock. A local clock reading or a 200
 * response never produces a "live" claim.
 */

import { describe, expect, it } from "vitest";
import {
  STALE_AFTER_MS,
  buildProvenance,
  dataModeLabel,
  deriveDataMode,
} from "@/lib/market-data/freshness.ts";

// Wednesday 2026-10-28, 10:30 IST — a running NSE session.
const SESSION_TIME = Date.UTC(2026, 9, 28, 5, 0, 0);
// Wednesday 2026-10-28, 20:00 IST — after the close.
const AFTER_CLOSE = Date.UTC(2026, 9, 28, 14, 30, 0);

describe("deriveDataMode", () => {
  it("calls a provider-timestamped value delayed during a session, not live", () => {
    expect(deriveDataMode({
      exchangeTimestampMs: SESSION_TIME - 60_000,
      now: SESSION_TIME,
      realtimeProvider: false,
    })).toBe("delayed");
  });

  it("only allows realtime for a realtime-capable provider inside a session", () => {
    expect(deriveDataMode({
      exchangeTimestampMs: SESSION_TIME - 1_000,
      now: SESSION_TIME,
      realtimeProvider: true,
    })).toBe("realtime");
  });

  it("downgrades a realtime provider to eod outside the session", () => {
    expect(deriveDataMode({
      exchangeTimestampMs: AFTER_CLOSE - 60_000,
      now: AFTER_CLOSE,
      realtimeProvider: true,
    })).toBe("eod");
  });

  it("returns unknown when the provider supplied no timestamp", () => {
    expect(deriveDataMode({
      exchangeTimestampMs: null,
      now: SESSION_TIME,
      realtimeProvider: true,
    })).toBe("unknown");
  });

  it("returns unknown for a non-finite timestamp", () => {
    expect(deriveDataMode({
      exchangeTimestampMs: Number.NaN,
      now: SESSION_TIME,
      realtimeProvider: false,
    })).toBe("unknown");
  });

  it("treats a far-future timestamp as unknown rather than fresh", () => {
    expect(deriveDataMode({
      exchangeTimestampMs: SESSION_TIME + 60 * 60_000,
      now: SESSION_TIME,
      realtimeProvider: false,
    })).toBe("unknown");
  });
});

describe("buildProvenance", () => {
  it("marks a value older than its mode allows as stale", () => {
    const provenance = buildProvenance({
      provider: "yahoo",
      exchangeTimestampMs: SESSION_TIME - STALE_AFTER_MS.delayed - 60_000,
      now: SESSION_TIME,
      cached: false,
      cacheAgeMs: 0,
      realtimeProvider: false,
    });

    expect(provenance.dataMode).toBe("delayed");
    expect(provenance.stale).toBe(true);
  });

  it("does not mark a delayed value stale inside the window", () => {
    const provenance = buildProvenance({
      provider: "yahoo",
      exchangeTimestampMs: SESSION_TIME - 5 * 60_000,
      now: SESSION_TIME,
      cached: true,
      cacheAgeMs: 60_000,
      realtimeProvider: false,
    });

    expect(provenance.stale).toBe(false);
    expect(provenance.cached).toBe(true);
    expect(provenance.cacheAgeMs).toBe(60_000);
  });

  it("treats unknown freshness as stale, since nothing supports a fresh claim", () => {
    const provenance = buildProvenance({
      provider: "yahoo",
      exchangeTimestampMs: null,
      now: SESSION_TIME,
      cached: false,
      cacheAgeMs: 0,
    });

    expect(provenance.dataMode).toBe("unknown");
    expect(provenance.exchangeTimestamp).toBeNull();
    expect(provenance.stale).toBe(true);
  });

  it("clamps a negative cache age instead of reporting a future cache", () => {
    const provenance = buildProvenance({
      provider: "yahoo",
      exchangeTimestampMs: SESSION_TIME,
      now: SESSION_TIME,
      cached: false,
      cacheAgeMs: -5_000,
    });

    expect(provenance.cacheAgeMs).toBe(0);
  });

  it("carries unavailable fields and warnings through untouched", () => {
    const provenance = buildProvenance({
      provider: "upstox",
      exchangeTimestampMs: SESSION_TIME,
      now: SESSION_TIME,
      cached: false,
      cacheAgeMs: 0,
      unavailable: ["weekHigh52", "weekLow52"],
      warnings: ["Upstox sent no 52-week fields."],
      realtimeProvider: true,
    });

    expect(provenance.unavailable).toEqual(["weekHigh52", "weekLow52"]);
    expect(provenance.warnings).toEqual(["Upstox sent no 52-week fields."]);
  });
});

describe("dataModeLabel", () => {
  it("never labels unverified data as live", () => {
    expect(dataModeLabel("unknown")).toBe("Unverified");
    expect(dataModeLabel("realtime")).toBe("Live");
    expect(dataModeLabel("delayed")).toBe("Delayed");
    expect(dataModeLabel("eod")).toBe("EOD");
  });
});
