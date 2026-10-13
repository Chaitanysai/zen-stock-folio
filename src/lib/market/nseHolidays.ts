/**
 * NSE trading-holiday configuration for the regular equity ("EQ") segment.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DATA LIMITATION — READ BEFORE TRUSTING THIS FILE
 * ──────────────────────────────────────────────────────────────────────────────
 * NSE publishes its trading-holiday calendar once per calendar year as an
 * exchange circular. There is no free, stable, CORS-enabled API for it, so the
 * calendar below is a hand-maintained configuration and it WILL go stale.
 *
 * Source of truth (update this file from here, once a year):
 *   https://www.nseindia.com/resources/exchange-communication-holidays
 *
 * Coverage is tracked explicitly in `HOLIDAY_CALENDAR` so the market-status
 * service can degrade safely instead of guessing:
 *
 *   - coverage "verified"    → list was checked against the official circular.
 *   - coverage "provisional" → only the fixed-date national holidays are listed;
 *                              lunar/announced holidays may still be missing.
 *                              Status is still computed, but consumers receive
 *                              `calendarCoverage: "provisional"` so the UI can
 *                              show a caveat.
 *   - no entry for the year  → treated as MISSING. `getMarketStatus()` then
 *                              refuses to report an open/LIVE market at all
 *                              (fail-closed), because on a missing calendar we
 *                              cannot distinguish a holiday from a trading day.
 *
 * Dates are IST (Asia/Kolkata) calendar dates in `YYYY-MM-DD` form.
 */

export type CalendarCoverage = "verified" | "provisional" | "missing";

/**
 * A session that runs even though the day would otherwise be closed
 * (currently only Diwali Muhurat trading). Minutes are IST minutes since
 * midnight. These are the ONLY exception to the weekend/holiday rules.
 */
export interface SpecialSession {
  name: string;
  openMinutes: number;
  closeMinutes: number;
}

interface HolidayYear {
  coverage: Exclude<CalendarCoverage, "missing">;
  /** IST date (YYYY-MM-DD) → holiday name. */
  holidays: Record<string, string>;
  /** IST date (YYYY-MM-DD) → special session that overrides a closed day. */
  specialSessions?: Record<string, SpecialSession>;
}

export const HOLIDAY_CALENDAR: Record<number, HolidayYear> = {
  2025: {
    coverage: "verified",
    holidays: {
      "2025-02-26": "Mahashivratri",
      "2025-03-14": "Holi",
      "2025-03-31": "Id-Ul-Fitr (Ramzan Id)",
      "2025-04-10": "Shri Mahavir Jayanti",
      "2025-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
      "2025-04-18": "Good Friday",
      "2025-05-01": "Maharashtra Day",
      "2025-08-15": "Independence Day",
      "2025-08-27": "Shri Ganesh Chaturthi",
      "2025-10-02": "Mahatma Gandhi Jayanti / Dussehra",
      "2025-10-21": "Diwali Laxmi Pujan",
      "2025-10-22": "Balipratipada",
      "2025-11-05": "Prakash Gurpurb Sri Guru Nanak Dev",
      "2025-12-25": "Christmas",
    },
    specialSessions: {
      // Muhurat trading on Diwali Laxmi Pujan — an evening session on a day
      // that is otherwise a trading holiday.
      "2025-10-21": { name: "Muhurat Trading", openMinutes: 13 * 60 + 45, closeMinutes: 14 * 60 + 45 },
    },
  },
  2026: {
    // PROVISIONAL: fixed-date national holidays only. The lunar-calendar and
    // announced holidays (Holi, Id, Mahavir Jayanti, Good Friday, Ganesh
    // Chaturthi, Dussehra, Diwali, Gurpurb …) are NOT yet listed and must be
    // added from the official NSE circular when it is published.
    coverage: "provisional",
    holidays: {
      "2026-01-26": "Republic Day",
      "2026-05-01": "Maharashtra Day",
      "2026-10-02": "Mahatma Gandhi Jayanti",
      "2026-12-25": "Christmas",
      // 2026-08-15 (Independence Day) falls on a Saturday — already closed.
    },
  },
};

export function getCalendarCoverage(year: number): CalendarCoverage {
  return HOLIDAY_CALENDAR[year]?.coverage ?? "missing";
}

/** Returns the holiday name for an IST date, or null when it is not configured. */
export function getHolidayName(istDate: string): string | null {
  const year = Number(istDate.slice(0, 4));
  return HOLIDAY_CALENDAR[year]?.holidays[istDate] ?? null;
}

/** Returns the special session configured for an IST date, or null. */
export function getSpecialSession(istDate: string): SpecialSession | null {
  const year = Number(istDate.slice(0, 4));
  return HOLIDAY_CALENDAR[year]?.specialSessions?.[istDate] ?? null;
}
