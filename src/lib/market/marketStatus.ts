/**
 * Single source of truth for NSE market status.
 *
 * Design rules (do not bypass this module):
 *  1. All time reasoning happens in Asia/Kolkata, resolved with `Intl`, never
 *     with the browser's local timezone.
 *  2. The regular equity session is 09:15–15:30 IST. `isOpen` is true only
 *     inside that window (09:15 inclusive, 15:30 exclusive) on a valid trading
 *     day, or inside an explicitly configured special session.
 *  3. Exchange status is derived from the clock + calendar ONLY. It must never
 *     be inferred from a successful price-API response.
 */

import {
  type CalendarCoverage,
  getCalendarCoverage,
  getHolidayName,
  getSpecialSession,
} from "./nseHolidays.ts";

export const IST_TIME_ZONE = "Asia/Kolkata";

/**
 * IST is UTC+05:30 all year — India observes no DST. That invariant is what
 * makes the wall-clock → epoch conversion below exact.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** IST minutes since midnight. */
export const PRE_OPEN_START_MINUTES = 9 * 60; // 09:00
export const REGULAR_OPEN_MINUTES = 9 * 60 + 15; // 09:15
export const REGULAR_CLOSE_MINUTES = 15 * 60 + 30; // 15:30
const MINUTES_IN_DAY = 24 * 60;

export type MarketPhase =
  | "pre-open"
  | "open"
  | "closed"
  | "weekend"
  | "holiday"
  | "unknown";

export interface MarketStatus {
  phase: MarketPhase;
  /** True only while a real tradeable session is running. */
  isOpen: boolean;
  /** Badge text: "LIVE" | "PRE-OPEN" | "MARKET CLOSED" | "STATUS UNAVAILABLE". */
  label: string;
  /** Longer human-readable explanation. */
  description: string;
  /** IST wall clock, "HH:mm". */
  istTime: string;
  /** IST calendar date, "YYYY-MM-DD". */
  istDate: string;
  /** IST minutes since midnight. */
  istMinutes: number;
  /** 0 = Sunday … 6 = Saturday, in IST. */
  istWeekday: number;
  /** Epoch ms at which the status is expected to change, or null if unknown. */
  nextChangeAt: number | null;
  holidayName: string | null;
  /** Name of the running/next special session (e.g. "Muhurat Trading"). */
  sessionName: string | null;
  calendarCoverage: CalendarCoverage;
  /**
   * True when the holiday calendar has no entry for this year, i.e. the
   * configuration is stale. The service then refuses to report an open market.
   */
  holidayDataStale: boolean;
}

const istFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface IstParts {
  date: string;
  time: string;
  minutes: number;
  weekday: number;
  year: number;
}

/** Resolves an instant into Asia/Kolkata calendar/clock parts. */
export function getIstParts(now: Date = new Date()): IstParts {
  const parts = istFormatter.formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(pick("year"));
  const month = pick("month");
  const day = pick("day");
  // `hourCycle: "h23"` keeps midnight at 00, but normalise defensively.
  const hour = Number(pick("hour")) % 24;
  const minute = Number(pick("minute"));

  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutes: hour * 60 + minute,
    weekday: WEEKDAY_INDEX[pick("weekday")] ?? 0,
    year,
  };
}

/** Converts an IST wall-clock moment to epoch ms (exact: IST has no DST). */
function istWallClockToEpoch(istDate: string, minutesSinceMidnight: number): number {
  const [year, month, day] = istDate.split("-").map(Number);
  return (
    Date.UTC(year, month - 1, day, 0, 0, 0, 0) -
    IST_OFFSET_MS +
    minutesSinceMidnight * 60_000
  );
}

export function isWeekendIst(weekday: number): boolean {
  return weekday === 0 || weekday === 6;
}

/**
 * Computes NSE market status for an instant. Pure and deterministic — pass a
 * fixed `now` in tests.
 */
export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const ist = getIstParts(now);
  const coverage = getCalendarCoverage(ist.year);
  const nextMidnight = istWallClockToEpoch(ist.date, MINUTES_IN_DAY);

  const base = {
    istTime: ist.time,
    istDate: ist.date,
    istMinutes: ist.minutes,
    istWeekday: ist.weekday,
    calendarCoverage: coverage,
    holidayName: null as string | null,
    sessionName: null as string | null,
    holidayDataStale: coverage === "missing",
  };

  const specialSession = getSpecialSession(ist.date);

  // Fail closed: with no calendar for this year we cannot tell a holiday from a
  // trading day, so we never claim the market is live.
  if (coverage === "missing" && !specialSession) {
    return {
      ...base,
      phase: "unknown",
      isOpen: false,
      label: "STATUS UNAVAILABLE",
      description: `No NSE holiday calendar configured for ${ist.year}; market status cannot be confirmed.`,
      nextChangeAt: nextMidnight,
    };
  }

  // Explicitly supported special session (e.g. Diwali Muhurat trading) wins
  // over the weekend/holiday rules.
  if (specialSession) {
    if (ist.minutes < specialSession.openMinutes) {
      return {
        ...base,
        phase: "closed",
        isOpen: false,
        label: "MARKET CLOSED",
        description: `${specialSession.name} opens later today.`,
        sessionName: specialSession.name,
        holidayName: getHolidayName(ist.date),
        nextChangeAt: istWallClockToEpoch(ist.date, specialSession.openMinutes),
      };
    }
    if (ist.minutes < specialSession.closeMinutes) {
      return {
        ...base,
        phase: "open",
        isOpen: true,
        label: "LIVE",
        description: `${specialSession.name} is in progress.`,
        sessionName: specialSession.name,
        holidayName: getHolidayName(ist.date),
        nextChangeAt: istWallClockToEpoch(ist.date, specialSession.closeMinutes),
      };
    }
    return {
      ...base,
      phase: "closed",
      isOpen: false,
      label: "MARKET CLOSED",
      description: `${specialSession.name} has ended.`,
      sessionName: specialSession.name,
      holidayName: getHolidayName(ist.date),
      nextChangeAt: nextMidnight,
    };
  }

  if (isWeekendIst(ist.weekday)) {
    return {
      ...base,
      phase: "weekend",
      isOpen: false,
      label: "MARKET CLOSED",
      description: "Weekend — NSE equity trading is closed.",
      nextChangeAt: nextMidnight,
    };
  }

  const holidayName = getHolidayName(ist.date);
  if (holidayName) {
    return {
      ...base,
      phase: "holiday",
      isOpen: false,
      label: "MARKET CLOSED",
      description: `NSE trading holiday — ${holidayName}.`,
      holidayName,
      nextChangeAt: nextMidnight,
    };
  }

  if (ist.minutes < PRE_OPEN_START_MINUTES) {
    return {
      ...base,
      phase: "closed",
      isOpen: false,
      label: "MARKET CLOSED",
      description: "Pre-open session starts at 09:00 IST.",
      nextChangeAt: istWallClockToEpoch(ist.date, PRE_OPEN_START_MINUTES),
    };
  }

  if (ist.minutes < REGULAR_OPEN_MINUTES) {
    return {
      ...base,
      phase: "pre-open",
      isOpen: false,
      label: "PRE-OPEN",
      description: "Pre-open call auction — regular trading starts at 09:15 IST.",
      nextChangeAt: istWallClockToEpoch(ist.date, REGULAR_OPEN_MINUTES),
    };
  }

  if (ist.minutes < REGULAR_CLOSE_MINUTES) {
    return {
      ...base,
      phase: "open",
      isOpen: true,
      label: "LIVE",
      description: "Regular NSE equity session (09:15–15:30 IST).",
      nextChangeAt: istWallClockToEpoch(ist.date, REGULAR_CLOSE_MINUTES),
    };
  }

  return {
    ...base,
    phase: "closed",
    isOpen: false,
    label: "MARKET CLOSED",
    description: "Regular session closed at 15:30 IST.",
    nextChangeAt: nextMidnight,
  };
}

/**
 * Poll interval for price refreshes, derived from exchange status ONLY.
 * Values intentionally match the pre-existing cadence (1s live / 10min weekend
 * / 5min otherwise); only the open/closed decision is being corrected here.
 */
export function getPriceRefreshIntervalMs(status: MarketStatus): number {
  if (status.isOpen) return 1_000;
  if (status.phase === "weekend" || status.phase === "holiday") return 10 * 60_000;
  return 5 * 60_000;
}
