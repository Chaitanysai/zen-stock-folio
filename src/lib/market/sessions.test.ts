import { describe, expect, it } from "vitest";
import { isUsMarketOpen, marketSessionState, usSessionState } from "./sessions.ts";

const at = (iso: string) => new Date(iso);

describe("US session state", () => {
  it("is open during the regular ET session", () => {
    // Monday 2026-11-02, after DST ends: 15:00Z = 10:00 ET, 14:00Z = 09:00 ET.
    expect(isUsMarketOpen(at("2026-11-02T15:00:00Z"))).toBe(true);
    expect(isUsMarketOpen(at("2026-11-02T14:00:00Z"))).toBe(false);
    expect(isUsMarketOpen(at("2026-11-02T21:00:00Z"))).toBe(false); // 16:00 ET
  });

  it("is closed on weekends", () => {
    expect(usSessionState(at("2026-11-01T15:00:00Z"))).toBe("closed");
  });

  it("is closed on a checked-in holiday", () => {
    expect(usSessionState(at("2026-11-26T15:00:00Z"))).toBe("closed"); // Thanksgiving
    expect(usSessionState(at("2026-07-03T15:00:00Z"))).toBe("closed"); // Independence Day observed
  });

  it("reports unknown when the calendar has no entry for the year", () => {
    expect(usSessionState(at("2028-03-01T15:00:00Z"))).toBe("unknown");
  });

  it("routes NSE through the existing market-status service", () => {
    // Monday 2026-11-02, 10:30 IST.
    expect(marketSessionState("NSE", at("2026-11-02T05:00:00Z"))).toBe("open");
  });
});
