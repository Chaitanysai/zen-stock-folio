/**
 * The room the public celebration is drawn in: a dusk wash for Diwali, a cool
 * pale-to-teal sky for Christmas.
 *
 * It sits under the hero scene and the scrim, so it tints the background and
 * never the words. Only the public hero has one — the dashboard keeps its own
 * background and P&L day-glow exactly as they are.
 */
import { useFestivalExperience } from "./EventExperienceProvider";

export function FestivalWash() {
  const { active } = useFestivalExperience();
  if (!active) return null;
  return <div className="zl-fest-wash" data-fest={active.animationId} aria-hidden="true" />;
}
