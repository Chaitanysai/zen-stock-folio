import type { EventAnimationConfig } from "@/lib/events/types";

/** Props every event animation component receives. */
export interface EventAnimationProps {
  /** Event-specific configuration from the event registry. */
  config?: EventAnimationConfig;
  /**
   * True when the visitor asked for reduced motion. Components must render a
   * static composition in that case — no looping particles, no flame flicker.
   */
  reducedMotion?: boolean;
}
