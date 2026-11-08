import { Suspense } from "react";
import type { EventResolution } from "@/lib/events/types";
import { getAnimationComponent } from "./animationRegistry";
import { useActiveEvent } from "./useActiveEvent";
import { useDocumentHidden } from "./useDocumentHidden";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import "@/styles/events.css";

export interface EventAnimationLayerViewProps {
  resolution: EventResolution | null;
  reducedMotion?: boolean;
  paused?: boolean;
  className?: string;
}

/**
 * Presentational renderer: one resolved event in, one decorative layer out.
 *
 * It renders nothing when no event is active or when the animation id is not in
 * the registry, so an unknown id from data can never break the page.
 */
export function EventAnimationLayerView({
  resolution,
  reducedMotion = false,
  paused = false,
  className,
}: EventAnimationLayerViewProps) {
  const active = resolution?.active ?? null;
  if (!active) return null;

  const Animation = getAnimationComponent(active.animationId);
  if (!Animation) return null;

  return (
    <div
      className={["zl-event", className].filter(Boolean).join(" ")}
      data-event={active.event.id}
      data-animation={active.animationId}
      data-reduced={reducedMotion ? "1" : "0"}
      data-paused={paused ? "1" : "0"}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <Animation config={active.event.config} reducedMotion={reducedMotion} />
      </Suspense>
    </div>
  );
}

export interface EventAnimationLayerProps {
  /** Pin the resolution instant. Tests only; production reads the clock. */
  now?: Date;
  className?: string;
}

/**
 * Decorative seasonal layer for the public landing page.
 *
 * Mounted inside the hero, above the scrim and below the content grid. It is
 * aria-hidden, pointer-events: none, and pauses when the tab is hidden.
 */
export default function EventAnimationLayer({ now, className }: EventAnimationLayerProps) {
  const resolution = useActiveEvent(now);
  const reducedMotion = usePrefersReducedMotion();
  const paused = useDocumentHidden();

  return (
    <EventAnimationLayerView
      resolution={resolution}
      reducedMotion={reducedMotion}
      paused={paused}
      className={className}
    />
  );
}
