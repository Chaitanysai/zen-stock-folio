/**
 * Isomorphic session state for the two listing markets.
 *
 * The NSE side delegates to `marketStatus.ts`, which already owns the IST
 * holiday calendar and its "missing year means unknown" rule. The U.S. side
 * checks a deliberately small, checked-in NYSE/NASDAQ holiday list: an
 * uncovered year is `unknown`, never `open` — the safe direction, because
 * claiming a session that is not running would make settled closes look live.
 *
 * Early closes (half-days) are not modelled; they only shorten a session that
 * this module already treats as open, so freshness stays conservative.
 */

import { getMarketStatus } from "./marketStatus.ts";
import type { Market } from "../market-data/types.ts";

export type SessionState = "open" | "closed" | "unknown";

export const ET_TIME_ZONE = "America/New_York";
export const US_OPEN_MINUTES = 9 * 60 + 30; // 09:30 ET
export const US_CLOSE_MINUTES = 16 * 60; // 16:00 ET

/** NYSE/NASDAQ full-day closures. Update this list before the last listed year. */
export const US_MARKET_HOLIDAYS: Record<number, readonly string[]> = {
  2026: [
    "2026-01-01", // New Year's Day
    "2026-01-19", // Martin Luther King Jr. Day
    "2026-02-16", // Washington's Birthday
    "2026-04-03", // Good Friday
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-03", // Independence Day observed (Jul 4 is Saturday)
    "2026-09-07", // Labor Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
  ],
  2027: [
    "2027-01-01",
    "2027-01-18",
    "2027-02-15",
    "2027-03-26", // Good Friday
    "2027-05-31",
    "2027-06-18", // Juneteenth observed (Jun 19 is Saturday)
    "2027-07-05", // Independence Day observed (Jul 4 is Sunday)
    "2027-09-06",
    "2027-11-25",
    "2027-12-24", // Christmas observed (Dec 25 is Saturday)
  ],
};

interface ZonedParts {
  dateKey: string;
  weekday: number;
  minutes: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(pick("weekday"));
  return {
    dateKey: `${pick("year")}-${pick("month")}-${pick("day")}`,
    weekday: weekday === -1 ? 0 : weekday,
    minutes: Number(pick("hour")) * 60 + Number(pick("minute")),
  };
}

export function usSessionState(date = new Date()): SessionState {
  const { dateKey, weekday, minutes } = zonedParts(date, ET_TIME_ZONE);
  const holidays = US_MARKET_HOLIDAYS[Number(dateKey.slice(0, 4))];
  if (!holidays) return "unknown";
  if (weekday === 0 || weekday === 6 || holidays.includes(dateKey)) return "closed";
  return minutes >= US_OPEN_MINUTES && minutes < US_CLOSE_MINUTES ? "open" : "closed";
}

export function isUsMarketOpen(date = new Date()): boolean {
  return usSessionState(date) === "open";
}

export function nseSessionState(date = new Date()): SessionState {
  const status = getMarketStatus(date);
  if (status.phase === "unknown" || status.holidayDataStale) return "unknown";
  return status.isOpen ? "open" : "closed";
}

/** Boolean form used by server cache policy; never claims open without a calendar. */
export function isNseMarketOpen(date = new Date()): boolean {
  return nseSessionState(date) === "open";
}

export function marketSessionState(market: Market, date = new Date()): SessionState {
  return market === "US" ? usSessionState(date) : nseSessionState(date);
}
