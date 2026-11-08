/**
 * Pure event resolver.
 *
 * Given a set of event definitions and an instant, decide which animation (if
 * any) is active today and which event comes next. No React, no clock reads, no
 * I/O — every input is explicit, so the whole display-window contract is
 * testable with fixed dates.
 *
 * Display window: one calendar day before, the event day(s), one calendar day
 * after. All comparisons are integer day ordinals in Asia/Kolkata.
 */
import {
  addCalendarDays,
  compareCalendarDates,
  diffCalendarDays,
  EVENT_TIME_ZONE,
  formatIsoDate,
  parseIsoDate,
  todayInTimeZone,
} from "./dateUtils";
import { isAnimationId } from "./animationIds";
import { loadEventsForYears, type CalendarProvider } from "./calendarProvider";
import type {
  EventDefinition,
  EventResolution,
  ResolvedEvent,
  UpcomingEvent,
} from "./types";

export interface ResolveOptions {
  timeZone?: string;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function compareActive(a: ResolvedEvent, b: ResolvedEvent): number {
  if (b.event.priority !== a.event.priority) return b.event.priority - a.event.priority;
  const startOrder = a.window.start.localeCompare(b.window.start);
  if (startOrder !== 0) return startOrder;
  return a.event.id.localeCompare(b.event.id);
}

function compareUpcoming(a: UpcomingEvent, b: UpcomingEvent): number {
  const startOrder = a.startsOn.localeCompare(b.startsOn);
  if (startOrder !== 0) return startOrder;
  if (b.event.priority !== a.event.priority) return b.event.priority - a.event.priority;
  return a.event.id.localeCompare(b.event.id);
}

/**
 * Resolves the active and next event for `now`.
 *
 * Malformed definitions (bad dates, unknown animation ids, negative windows)
 * are skipped rather than thrown on: a bad calendar entry must never take the
 * homepage down.
 */
export function resolveEvents(
  events: readonly EventDefinition[],
  now: Date,
  options: ResolveOptions = {},
): EventResolution {
  const timeZone = options.timeZone ?? EVENT_TIME_ZONE;
  const today = todayInTimeZone(now, timeZone);
  const todayIso = formatIsoDate(today);

  const active: ResolvedEvent[] = [];
  const upcoming: UpcomingEvent[] = [];

  for (const event of events) {
    if (!event || typeof event.id !== "string") continue;
    if (!isAnimationId(event.animationId)) continue;
    if (!isNonNegativeInteger(event.displayDaysBefore)) continue;
    if (!isNonNegativeInteger(event.displayDaysAfter)) continue;

    const start = parseIsoDate(event.date);
    if (!start) continue;
    const end = event.endDate ? parseIsoDate(event.endDate) : start;
    if (!end || compareCalendarDates(end, start) < 0) continue;

    const windowStart = addCalendarDays(start, -event.displayDaysBefore);
    const windowEnd = addCalendarDays(end, event.displayDaysAfter);

    if (
      compareCalendarDates(today, windowStart) >= 0 &&
      compareCalendarDates(today, windowEnd) <= 0
    ) {
      active.push({
        event,
        animationId: event.animationId,
        window: { start: formatIsoDate(windowStart), end: formatIsoDate(windowEnd) },
        dayOffset: diffCalendarDays(today, start),
        isEventDay:
          compareCalendarDates(today, start) >= 0 && compareCalendarDates(today, end) <= 0,
      });
      continue;
    }

    if (compareCalendarDates(windowStart, today) > 0) {
      upcoming.push({
        event,
        startsOn: formatIsoDate(windowStart),
        daysUntil: diffCalendarDays(windowStart, today),
      });
    }
  }

  active.sort(compareActive);
  upcoming.sort(compareUpcoming);

  return {
    today: todayIso,
    active: active[0] ?? null,
    next: upcoming[0] ?? null,
  };
}

export interface ResolveActiveEventOptions extends ResolveOptions {
  provider?: CalendarProvider;
}

/**
 * Loads the calendar around `now` and resolves it.
 *
 * Three years are loaded because a window can cross a year boundary in either
 * direction (a 1 January event displays from 31 December; a 31 December event
 * displays into 2 January).
 */
export async function resolveActiveEvent(
  now: Date = new Date(),
  options: ResolveActiveEventOptions = {},
): Promise<EventResolution> {
  const timeZone = options.timeZone ?? EVENT_TIME_ZONE;
  const year = todayInTimeZone(now, timeZone).year;
  const events = await loadEventsForYears([year - 1, year, year + 1], options.provider);
  return resolveEvents(events, now, { timeZone });
}
