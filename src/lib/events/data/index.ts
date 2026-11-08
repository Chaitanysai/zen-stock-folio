/**
 * Versioned curated calendars, keyed by year.
 *
 * A missing year is a supported state: the provider returns null and the
 * resolver simply finds no event. The site never breaks because a year was not
 * transcribed yet — it just shows no seasonal animation.
 */
import type { CalendarYearData } from "../types";
import { CALENDAR_2026 } from "./calendar-2026";
import { CALENDAR_2027 } from "./calendar-2027";

export const CURATED_CALENDARS: Readonly<Record<number, CalendarYearData>> = {
  2026: CALENDAR_2026,
  2027: CALENDAR_2027,
};

/** Years with a transcribed dataset. Used by docs and diagnostics. */
export const CURATED_CALENDAR_YEARS: readonly number[] = Object.keys(CURATED_CALENDARS)
  .map(Number)
  .sort((a, b) => a - b);
