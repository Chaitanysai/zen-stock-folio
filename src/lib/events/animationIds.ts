/**
 * The complete set of animation identifiers the site can render.
 *
 * This is the single place that knows the *names* of animations. The palettes
 * in src/components/events/engine/palette.ts are typed against this union, so
 * adding an id here without a composition is a compile error rather than a
 * blank page on the day of the festival.
 *
 * Adding a festival:
 *   1. add its calendar record (src/lib/events/data/calendar-<year>.ts)
 *   2. add its display rule (src/lib/events/eventRegistry.ts)
 *   3. add its id below + its palette and its drawing pass in the engine
 */
export const ANIMATION_IDS = ["diwali", "christmas"] as const;

export type AnimationId = (typeof ANIMATION_IDS)[number];

const ANIMATION_ID_SET: ReadonlySet<string> = new Set(ANIMATION_IDS);

/** Runtime guard for ids that arrive from data rather than from code. */
export function isAnimationId(value: unknown): value is AnimationId {
  return typeof value === "string" && ANIMATION_ID_SET.has(value);
}
