/**
 * The complete set of animation identifiers the site can render.
 *
 * This is the single place that knows the *names* of animations. The React
 * registry (src/components/events/animationRegistry.ts) is typed against this
 * union, so adding an id here without a component (or the reverse) is a
 * compile error rather than a runtime surprise.
 *
 * Adding a festival:
 *   1. add its calendar record (src/lib/events/data/calendar-<year>.ts)
 *   2. add its display rule (src/lib/events/eventRegistry.ts)
 *   3. add its id below + its component in the animation registry
 */
export const ANIMATION_IDS = ["diwali", "christmas"] as const;

export type AnimationId = (typeof ANIMATION_IDS)[number];

const ANIMATION_ID_SET: ReadonlySet<string> = new Set(ANIMATION_IDS);

/** Runtime guard for ids that arrive from data rather than from code. */
export function isAnimationId(value: unknown): value is AnimationId {
  return typeof value === "string" && ANIMATION_ID_SET.has(value);
}
