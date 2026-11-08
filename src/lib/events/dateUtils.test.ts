import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  compareCalendarDates,
  diffCalendarDays,
  formatIsoDate,
  fromOrdinal,
  isLeapYear,
  nextMidnightInTimeZone,
  parseIsoDate,
  todayInTimeZone,
  todayIsoInTimeZone,
  toOrdinal,
  weekdayOf,
} from "./dateUtils";

describe("parseIsoDate", () => {
  it("accepts a well-formed date", () => {
    expect(parseIsoDate("2026-11-08")).toEqual({ year: 2026, month: 11, day: 8 });
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseIsoDate("2026-2-3")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-10")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2027-02-29")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(20261108)).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
  });
});

describe("calendar-day arithmetic", () => {
  it("round-trips through day ordinals", () => {
    const date = { year: 2026, month: 11, day: 8 };
    expect(fromOrdinal(toOrdinal(date))).toEqual(date);
    expect(toOrdinal({ year: 1970, month: 1, day: 1 })).toBe(0);
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(formatIsoDate(addCalendarDays({ year: 2026, month: 12, day: 31 }, 1))).toBe("2027-01-01");
    expect(formatIsoDate(addCalendarDays({ year: 2026, month: 1, day: 1 }, -1))).toBe("2025-12-31");
    expect(formatIsoDate(addCalendarDays({ year: 2028, month: 2, day: 28 }, 1))).toBe("2028-02-29");
    expect(formatIsoDate(addCalendarDays({ year: 2027, month: 2, day: 28 }, 1))).toBe("2027-03-01");
  });

  it("diffs and compares in whole days", () => {
    expect(diffCalendarDays({ year: 2026, month: 11, day: 9 }, { year: 2026, month: 11, day: 7 })).toBe(2);
    expect(diffCalendarDays({ year: 2027, month: 1, day: 1 }, { year: 2026, month: 12, day: 31 })).toBe(1);
    expect(compareCalendarDates({ year: 2026, month: 11, day: 7 }, { year: 2026, month: 11, day: 8 })).toBeLessThan(0);
    expect(compareCalendarDates({ year: 2026, month: 11, day: 8 }, { year: 2026, month: 11, day: 8 })).toBe(0);
  });

  it("knows the weekday", () => {
    // 8 November 2026 is a Sunday.
    expect(weekdayOf({ year: 2026, month: 11, day: 8 })).toBe(0);
    expect(weekdayOf({ year: 2026, month: 12, day: 25 })).toBe(5);
  });

  it("knows leap years", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
});

describe("Asia/Kolkata day boundaries", () => {
  it("rolls over at 18:30 UTC, not at UTC midnight", () => {
    expect(todayIsoInTimeZone(new Date("2026-11-07T18:29:59Z"))).toBe("2026-11-07");
    expect(todayIsoInTimeZone(new Date("2026-11-07T18:30:00Z"))).toBe("2026-11-08");
  });

  it("resolves the IST date regardless of the host timezone", () => {
    // 2026-11-08T00:30 IST === 2026-11-07T19:00Z
    expect(todayIsoInTimeZone(new Date("2026-11-07T19:00:00Z"))).toBe("2026-11-08");
    expect(todayInTimeZone(new Date("2026-11-07T19:00:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 8,
    });
  });

  it("returns the next IST midnight", () => {
    const next = nextMidnightInTimeZone(new Date("2026-11-08T10:00:00Z"));
    expect(next.toISOString()).toBe("2026-11-08T18:30:00.000Z");
  });

  it("handles a year boundary", () => {
    // 2026-12-31T20:00Z is already 2027-01-01 01:30 IST.
    const next = nextMidnightInTimeZone(new Date("2026-12-31T20:00:00Z"));
    expect(next.toISOString()).toBe("2027-01-01T18:30:00.000Z");
  });
});
