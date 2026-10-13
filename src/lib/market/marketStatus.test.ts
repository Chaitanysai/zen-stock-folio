import { describe, expect, it } from "vitest";
import {
  getIstParts,
  getMarketStatus,
  getPriceRefreshIntervalMs,
} from "./marketStatus";

/**
 * Every instant below is written as an explicit UTC instant, so these
 * assertions hold no matter which timezone the test machine is in. IST is
 * UTC+05:30, so IST = UTC + 5h30m.
 *
 * 2026-10-13 is a Tuesday (regular trading day, no configured holiday).
 * 2026-10-17 is a Saturday, 2026-10-18 a Sunday.
 * 2026-01-26 is a Monday and a configured NSE holiday (Republic Day).
 * 2025-10-21 is a configured holiday with a Muhurat special session.
 */
const ist = (utcIso: string) => new Date(utcIso);

describe("getIstParts", () => {
  it("resolves Asia/Kolkata wall clock regardless of the host timezone", () => {
    expect(getIstParts(ist("2026-10-13T10:54:00Z")).time).toBe("16:24");
    expect(getIstParts(ist("2026-10-13T10:54:00Z")).date).toBe("2026-10-13");
    // 23:45 UTC is already the next IST calendar day (05:15 IST).
    expect(getIstParts(ist("2026-10-13T23:45:00Z")).date).toBe("2026-10-14");
    expect(getIstParts(ist("2026-10-13T18:30:00Z")).time).toBe("00:00");
  });

  it("reports the IST weekday", () => {
    expect(getIstParts(ist("2026-10-13T04:00:00Z")).weekday).toBe(2); // Tuesday
    expect(getIstParts(ist("2026-10-17T04:00:00Z")).weekday).toBe(6); // Saturday
    expect(getIstParts(ist("2026-10-18T04:00:00Z")).weekday).toBe(0); // Sunday
  });
});

describe("regular session boundaries on a trading weekday", () => {
  it("09:14 IST is not live (pre-open)", () => {
    const status = getMarketStatus(ist("2026-10-13T03:44:00Z"));
    expect(status.istTime).toBe("09:14");
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("pre-open");
    expect(status.label).toBe("PRE-OPEN");
  });

  it("09:15 IST is live", () => {
    const status = getMarketStatus(ist("2026-10-13T03:45:00Z"));
    expect(status.istTime).toBe("09:15");
    expect(status.isOpen).toBe(true);
    expect(status.phase).toBe("open");
    expect(status.label).toBe("LIVE");
  });

  it("15:29 IST is still live", () => {
    const status = getMarketStatus(ist("2026-10-13T09:59:00Z"));
    expect(status.istTime).toBe("15:29");
    expect(status.isOpen).toBe(true);
    expect(status.label).toBe("LIVE");
  });

  it("15:30 IST is closed (close is exclusive)", () => {
    const status = getMarketStatus(ist("2026-10-13T10:00:00Z"));
    expect(status.istTime).toBe("15:30");
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("closed");
    expect(status.label).toBe("MARKET CLOSED");
  });

  it("16:24 IST is closed — the reported bug", () => {
    const status = getMarketStatus(ist("2026-10-13T10:54:00Z"));
    expect(status.istTime).toBe("16:24");
    expect(status.isOpen).toBe(false);
    expect(status.label).toBe("MARKET CLOSED");
  });

  it("08:30 IST (before pre-open) is closed", () => {
    const status = getMarketStatus(ist("2026-10-13T03:00:00Z"));
    expect(status.istTime).toBe("08:30");
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("closed");
  });

  it("schedules the next change at the 15:30 IST close while live", () => {
    const now = ist("2026-10-13T09:59:00Z");
    const status = getMarketStatus(now);
    expect(status.nextChangeAt).toBe(ist("2026-10-13T10:00:00Z").getTime());
  });
});

describe("non-trading days", () => {
  it("treats Saturday as closed even inside session hours", () => {
    const status = getMarketStatus(ist("2026-10-17T06:00:00Z")); // 11:30 IST Sat
    expect(status.istTime).toBe("11:30");
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("weekend");
    expect(status.label).toBe("MARKET CLOSED");
  });

  it("treats Sunday as closed even inside session hours", () => {
    const status = getMarketStatus(ist("2026-10-18T06:00:00Z"));
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("weekend");
  });

  it("treats a configured NSE holiday as closed inside session hours", () => {
    const status = getMarketStatus(ist("2026-01-26T06:00:00Z")); // 11:30 IST Mon
    expect(status.istTime).toBe("11:30");
    expect(status.istWeekday).toBe(1);
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("holiday");
    expect(status.holidayName).toBe("Republic Day");
    expect(status.label).toBe("MARKET CLOSED");
  });
});

describe("special sessions", () => {
  it("is live during the configured Muhurat session on a holiday", () => {
    const status = getMarketStatus(ist("2025-10-21T08:30:00Z")); // 14:00 IST
    expect(status.istTime).toBe("14:00");
    expect(status.isOpen).toBe(true);
    expect(status.label).toBe("LIVE");
    expect(status.sessionName).toBe("Muhurat Trading");
  });

  it("is closed before and after the special session window", () => {
    const before = getMarketStatus(ist("2025-10-21T04:30:00Z")); // 10:00 IST
    expect(before.isOpen).toBe(false);
    expect(before.sessionName).toBe("Muhurat Trading");

    const after = getMarketStatus(ist("2025-10-21T09:30:00Z")); // 15:00 IST
    expect(after.isOpen).toBe(false);
    expect(after.label).toBe("MARKET CLOSED");
  });
});

describe("holiday calendar coverage", () => {
  it("never reports live when no calendar is configured for the year", () => {
    const status = getMarketStatus(ist("2030-10-15T06:00:00Z")); // 11:30 IST
    expect(status.isOpen).toBe(false);
    expect(status.phase).toBe("unknown");
    expect(status.label).toBe("STATUS UNAVAILABLE");
    expect(status.holidayDataStale).toBe(true);
    expect(status.calendarCoverage).toBe("missing");
  });

  it("flags coverage quality for configured years", () => {
    expect(getMarketStatus(ist("2025-10-14T06:00:00Z")).calendarCoverage).toBe("verified");
    expect(getMarketStatus(ist("2026-10-13T06:00:00Z")).calendarCoverage).toBe("provisional");
    expect(getMarketStatus(ist("2026-10-13T06:00:00Z")).holidayDataStale).toBe(false);
  });
});

describe("getPriceRefreshIntervalMs", () => {
  it("derives the poll cadence from exchange status only", () => {
    expect(getPriceRefreshIntervalMs(getMarketStatus(ist("2026-10-13T06:00:00Z")))).toBe(1_000);
    expect(getPriceRefreshIntervalMs(getMarketStatus(ist("2026-10-13T10:54:00Z")))).toBe(5 * 60_000);
    expect(getPriceRefreshIntervalMs(getMarketStatus(ist("2026-10-17T06:00:00Z")))).toBe(10 * 60_000);
  });
});
