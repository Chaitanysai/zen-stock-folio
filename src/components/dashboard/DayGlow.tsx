import type { Tone } from "@/lib/dashboard/format";

/**
 * A soft top-of-page wash that turns green or red with today's P&L.
 *
 * Purely decorative: it sits behind the rail, top bar and cards, ignores
 * pointer events, and stays neutral when quotes are stale or unavailable.
 */
export function DayGlow({ tone }: { tone: Tone }) {
  return <div className="zf-dayglow" data-tone={tone} aria-hidden="true" />;
}
