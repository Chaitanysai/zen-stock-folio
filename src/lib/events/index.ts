/**
 * Public surface of the festival event engine.
 *
 * Components import from here; nothing outside this folder should reach into
 * the data files or the provider internals.
 */
export { ANIMATION_IDS, isAnimationId, type AnimationId } from "./animationIds";
export {
  calendarProvider,
  createCachedCalendarProvider,
  createHttpCalendarProvider,
  curatedCalendarProvider,
  loadEventsForYears,
  type CachedCalendarProvider,
  type CalendarProvider,
  type HttpCalendarProviderOptions,
} from "./calendarProvider";
export { CURATED_CALENDARS, CURATED_CALENDAR_YEARS } from "./data";
export {
  addCalendarDays,
  compareCalendarDates,
  diffCalendarDays,
  EVENT_TIME_ZONE,
  formatIsoDate,
  nextMidnightInTimeZone,
  parseIsoDate,
  todayInTimeZone,
  todayIsoInTimeZone,
  type CalendarDate,
} from "./dateUtils";
export { buildEventDefinitions, EVENT_RULES, toEventDefinition } from "./eventRegistry";
export { resolveActiveEvent, resolveEvents, type ResolveOptions } from "./eventResolver";
export type {
  CalendarCoverage,
  CalendarRecord,
  CalendarYearData,
  EventAnimationConfig,
  EventCategory,
  EventCountry,
  EventDefinition,
  EventResolution,
  EventRule,
  EventWindow,
  ResolvedEvent,
  UpcomingEvent,
} from "./types";
