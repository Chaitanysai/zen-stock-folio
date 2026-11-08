/**
 * Event registry — the bridge between a calendar record and an animation.
 *
 * This file owns display-window rules, animation identity and animation
 * configuration. It deliberately knows nothing about React, the DOM or the
 * calendar provider, so the resolver can be tested without either.
 *
 * Adding a festival is three edits, none of them in the resolver:
 *   1. a CalendarRecord in src/lib/events/data/calendar-<year>.ts
 *   2. an EventRule below (window + priority + animation id)
 *   3. the animation id in animationIds.ts (the canvas engine then draws its
 *      composition — see src/components/events/engine/scene.ts)
 */
import { isAnimationId } from "./animationIds";
import { compareCalendarDates, parseIsoDate } from "./dateUtils";
import type { CalendarRecord, EventDefinition, EventRule } from "./types";

export const EVENT_RULES: Readonly<Record<string, EventRule>> = {
  diwali: {
    animationId: "diwali",
    priority: 100,
    displayDaysBefore: 1,
    displayDaysAfter: 1,
    config: { intensity: "balanced", particleCount: 14, showRangoli: true },
  },
  christmas: {
    animationId: "christmas",
    priority: 80,
    displayDaysBefore: 1,
    displayDaysAfter: 1,
    config: { intensity: "subtle", particleCount: 22, showEvergreen: true },
  },
};

const DEFAULT_DISPLAY_DAYS = 1;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Merges one calendar record with its rule.
 * Returns null for records that are malformed or have no rule — the resolver
 * then ignores them instead of guessing.
 */
export function toEventDefinition(record: CalendarRecord): EventDefinition | null {
  if (!record || typeof record.id !== "string" || record.id.length === 0) return null;

  const rule = EVENT_RULES[record.id];
  if (!rule) return null;
  if (!isAnimationId(rule.animationId)) return null;
  if (typeof rule.priority !== "number" || !Number.isFinite(rule.priority)) return null;

  const start = parseIsoDate(record.date);
  if (!start) return null;

  const end = record.endDate ? parseIsoDate(record.endDate) : start;
  if (!end || compareCalendarDates(end, start) < 0) return null;

  const before = rule.displayDaysBefore ?? DEFAULT_DISPLAY_DAYS;
  const after = rule.displayDaysAfter ?? DEFAULT_DISPLAY_DAYS;
  if (!isNonNegativeInteger(before) || !isNonNegativeInteger(after)) return null;

  return {
    ...record,
    animationId: rule.animationId,
    priority: rule.priority,
    displayDaysBefore: before,
    displayDaysAfter: after,
    config: rule.config,
  };
}

/** Normalises a provider's records, dropping duplicates and invalid entries. */
export function buildEventDefinitions(records: readonly CalendarRecord[]): EventDefinition[] {
  const seen = new Set<string>();
  const definitions: EventDefinition[] = [];

  for (const record of records) {
    const definition = toEventDefinition(record);
    if (!definition) continue;
    const key = `${definition.id}:${definition.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    definitions.push(definition);
  }

  return definitions;
}
