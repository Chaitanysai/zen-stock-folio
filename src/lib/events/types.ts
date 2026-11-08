/**
 * Typed model for festival and special-event animations.
 *
 * Three identities are deliberately kept apart:
 *
 *   CalendarRecord   what a calendar provider knows (id, name, date, region)
 *   EventRule        how long it is displayed and which animation it uses
 *   EventDefinition  the two merged — the only shape the resolver consumes
 *
 * That separation is what lets two dates (or two regional observances) share
 * one animation, and lets the resolver stay independent of React.
 */
import type { AnimationId } from "./animationIds";

export type EventCategory = "festival" | "national-holiday" | "observance" | "seasonal";

/** ISO 3166-1 alpha-2, plus GLOBAL for observances that are not country-bound. */
export type EventCountry = "IN" | "US" | "GLOBAL";

/**
 * How much of a year's calendar was actually checked.
 *   verified    — every record was cross-checked against a published source
 *   provisional — only fixed-date entries are present; lunar dates may be missing
 */
export type CalendarCoverage = "verified" | "provisional";

/** One holiday as a provider reports it. No display rules live here. */
export interface CalendarRecord {
  /** Stable slug, e.g. "diwali". Matches an EventRule key. */
  id: string;
  name: string;
  category: EventCategory;
  country: EventCountry;
  /** Sub-national codes such as "IN-TG"; omitted when pan-regional. */
  regions?: readonly string[];
  /** First day, as an ISO calendar date in `timezone` (YYYY-MM-DD). */
  date: string;
  /** Last day of a multi-day observance, inclusive. Defaults to `date`. */
  endDate?: string;
  /** IANA zone the dates are expressed in. */
  timezone: string;
  /** Provenance note, shown in docs and useful when auditing a date. */
  source?: string;
}

/** A provider's answer for one calendar year. */
export interface CalendarYearData {
  year: number;
  coverage: CalendarCoverage;
  /** Where the dates came from (URL or dataset description). */
  source: string;
  /** ISO date the dataset was last checked. */
  retrievedAt: string;
  records: readonly CalendarRecord[];
}

/** Event-specific knobs handed to the animation component. */
export interface EventAnimationConfig {
  intensity?: "subtle" | "balanced";
  /** Upper bound on decorative particles; the renderer may lower it. */
  particleCount?: number;
  showRangoli?: boolean;
  showEvergreen?: boolean;
}

/** Display rules for a calendar record. */
export interface EventRule {
  animationId: AnimationId;
  /** Higher wins when two display windows overlap. */
  priority: number;
  /** Calendar days before the event date. Defaults to 1. */
  displayDaysBefore?: number;
  /** Calendar days after the last event day. Defaults to 1. */
  displayDaysAfter?: number;
  config?: EventAnimationConfig;
}

/** A calendar record merged with its display rule. */
export interface EventDefinition extends CalendarRecord {
  animationId: AnimationId;
  priority: number;
  displayDaysBefore: number;
  displayDaysAfter: number;
  config?: EventAnimationConfig;
}

/** Inclusive display window, as ISO dates. */
export interface EventWindow {
  start: string;
  end: string;
}

export interface ResolvedEvent {
  event: EventDefinition;
  animationId: AnimationId;
  window: EventWindow;
  /** Days from the event's first day: -1 before, 0 on the day, 1 after. */
  dayOffset: number;
  /** True inside a multi-day observance, not only on its first day. */
  isEventDay: boolean;
}

export interface UpcomingEvent {
  event: EventDefinition;
  /** First day of its display window. */
  startsOn: string;
  daysUntil: number;
}

export interface EventResolution {
  /** Today's date in the resolution timezone, YYYY-MM-DD. */
  today: string;
  active: ResolvedEvent | null;
  next: UpcomingEvent | null;
}
