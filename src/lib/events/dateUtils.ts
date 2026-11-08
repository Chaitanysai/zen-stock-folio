/**
 * Timezone-aware calendar-date arithmetic for the event engine.
 *
 * Rules:
 *  1. "Today" is always resolved in the event timezone (Asia/Kolkata) with
 *     `Intl`, never from the host clock's local date.
 *  2. Day arithmetic is done on integer day ordinals (days since 1970-01-01),
 *     never by adding 24 * 60 * 60 * 1000. Adding milliseconds to a local Date
 *     breaks across DST zones and around midnight; ordinals cannot.
 *  3. Nothing here reads the clock implicitly — callers pass `now`, so the
 *     resolver stays pure and testable with fixed instants.
 */

export const EVENT_TIME_ZONE = "Asia/Kolkata";

export interface CalendarDate {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** Parses a strict YYYY-MM-DD date. Returns null for anything malformed. */
export function parseIsoDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatIsoDate(date: CalendarDate): string {
  const year = String(date.year).padStart(4, "0");
  const month = String(date.month).padStart(2, "0");
  const day = String(date.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Days since 1970-01-01 for a proleptic Gregorian date.
 * Howard Hinnant's days_from_civil — exact for every year we care about.
 */
export function toOrdinal(date: CalendarDate): number {
  const month = date.month;
  const year = date.year - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/** Inverse of `toOrdinal`. */
export function fromOrdinal(ordinal: number): CalendarDate {
  const z = ordinal + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}

export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return fromOrdinal(toOrdinal(date) + days);
}

/** a - b, in whole calendar days. */
export function diffCalendarDays(a: CalendarDate, b: CalendarDate): number {
  return toOrdinal(a) - toOrdinal(b);
}

/** Negative when a is before b, positive when after, 0 when equal. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return toOrdinal(a) - toOrdinal(b);
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekdayOf(date: CalendarDate): number {
  return (((toOrdinal(date) + 4) % 7) + 7) % 7;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function clockFormatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    clockFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const part of parts) record[part.type] = part.value;
  return record;
}

/** The calendar date at `now` in `timeZone`. */
export function todayInTimeZone(now: Date, timeZone: string = EVENT_TIME_ZONE): CalendarDate {
  const parts = partsToRecord(dateFormatterFor(timeZone).formatToParts(now));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

export function todayIsoInTimeZone(now: Date, timeZone: string = EVENT_TIME_ZONE): string {
  return formatIsoDate(todayInTimeZone(now, timeZone));
}

/**
 * Offset of `timeZone` from UTC at a given instant, in milliseconds.
 * Derived by reading the zone's wall clock back as if it were UTC.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = partsToRecord(clockFormatterFor(timeZone).formatToParts(instant));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The next local midnight in `timeZone` after `now`.
 * Used to schedule a re-resolve exactly when the display window can change.
 * Two passes settle zones whose offset changes at the boundary.
 */
export function nextMidnightInTimeZone(now: Date, timeZone: string = EVENT_TIME_ZONE): Date {
  const tomorrow = addCalendarDays(todayInTimeZone(now, timeZone), 1);
  const wallClock = Date.UTC(tomorrow.year, tomorrow.month - 1, tomorrow.day);
  let instant = wallClock - timeZoneOffsetMs(now, timeZone);
  instant = wallClock - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}
