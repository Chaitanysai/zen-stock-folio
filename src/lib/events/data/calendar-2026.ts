/**
 * Curated Indian calendar — 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DATA LIMITATION — READ BEFORE TRUSTING THIS FILE
 * ─────────────────────────────────────────────────────────────────────────────
 * Lunar festivals (Diwali, Holi, Eid, Ugadi, Ganesh Chaturthi …) do not fall on
 * a fixed Gregorian date. Each year's date is a published religious/regional
 * determination, so it cannot be computed here and must be transcribed.
 *
 * Only dates that were actually checked are listed. The list is intentionally
 * NOT exhaustive: a record without a matching rule in eventRegistry.ts is
 * ignored by the resolver, so extra holidays are harmless.
 *
 * Update once a year, before the year starts:
 *   - Diwali: Lakshmi Puja date (amavasya tithi) for the year
 *   - fixed national days: 26 Jan, 15 Aug, 2 Oct
 *   - Christmas: 25 Dec
 * Then bump `retrievedAt` and re-run the event tests.
 *
 * Sources used for this file:
 *   - Diwali 2026: Lakshmi Puja on 8 November 2026 (multiple published
 *     panchang calendars agree; see docs/features/festival-animations.md)
 *   - Diwali 2027: Lakshmi Puja on 29 October 2027
 *   - Fixed dates: statutory Indian national days and 25 December
 */
import type { CalendarYearData } from "../types";

export const CALENDAR_2026: CalendarYearData = {
  year: 2026,
  coverage: "verified",
  source: "Curated annual dataset (see docs/features/festival-animations.md)",
  retrievedAt: "2026-11-08",
  records: [
    {
      id: "new-year",
      name: "New Year's Day",
      category: "seasonal",
      country: "IN",
      date: "2026-01-01",
      timezone: "Asia/Kolkata",
      source: "Fixed Gregorian date",
    },
    {
      id: "republic-day",
      name: "Republic Day",
      category: "national-holiday",
      country: "IN",
      date: "2026-01-26",
      timezone: "Asia/Kolkata",
      source: "Fixed national date",
    },
    {
      id: "independence-day",
      name: "Independence Day",
      category: "national-holiday",
      country: "IN",
      date: "2026-08-15",
      timezone: "Asia/Kolkata",
      source: "Fixed national date",
    },
    {
      id: "gandhi-jayanti",
      name: "Gandhi Jayanti",
      category: "national-holiday",
      country: "IN",
      date: "2026-10-02",
      timezone: "Asia/Kolkata",
      source: "Fixed national date",
    },
    {
      id: "diwali",
      name: "Diwali",
      category: "festival",
      country: "IN",
      date: "2026-11-08",
      timezone: "Asia/Kolkata",
      source: "Lakshmi Puja (amavasya tithi) — cross-checked 2026-11-08",
    },
    {
      id: "christmas",
      name: "Christmas",
      category: "festival",
      country: "IN",
      date: "2026-12-25",
      timezone: "Asia/Kolkata",
      source: "Fixed Gregorian date",
    },
  ],
};
