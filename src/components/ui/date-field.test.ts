import { describe, expect, it } from "vitest";
import { parseIsoDate, toIsoDate } from "./date-field";

/**
 * The date field is the only new surface that touches stored data, so its
 * parsing is pinned here. Everything downstream (buildManualPosition, the
 * back-dated FX rule, persistence) consumes the ISO string this produces.
 */
describe("parseIsoDate", () => {
  it("parses an ISO date as local time, not UTC", () => {
    const date = parseIsoDate("2026-11-01");
    expect(date).toBeDefined();
    // Local getters must round-trip: a UTC parse would shift the day west of GMT.
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(1);
  });

  it("returns undefined for blank and malformed input", () => {
    expect(parseIsoDate("")).toBeUndefined();
    expect(parseIsoDate("   ")).toBeUndefined();
    expect(parseIsoDate("01-11-2026")).toBeUndefined();
    expect(parseIsoDate("2026-11")).toBeUndefined();
    expect(parseIsoDate("not a date")).toBeUndefined();
  });

  it("rejects a date the calendar would roll over", () => {
    expect(parseIsoDate("2026-02-31")).toBeUndefined();
    expect(parseIsoDate("2026-13-01")).toBeUndefined();
  });

  it("accepts a real leap day", () => {
    expect(parseIsoDate("2028-02-29")?.getDate()).toBe(29);
    expect(parseIsoDate("2026-02-29")).toBeUndefined();
  });
});

describe("toIsoDate", () => {
  it("formats a local Date as YYYY-MM-DD without a UTC shift", () => {
    expect(toIsoDate(new Date(2026, 10, 1))).toBe("2026-11-01");
    expect(toIsoDate(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("round-trips through parseIsoDate", () => {
    for (const iso of ["2026-01-01", "2026-06-15", "2026-12-31", "2028-02-29"]) {
      expect(toIsoDate(parseIsoDate(iso)!)).toBe(iso);
    }
  });
});
