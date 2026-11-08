/**
 * Typed animation registry.
 *
 * The resolver only ever produces an AnimationId from this union, and the
 * record below is typed against it — so an id without a component, or a
 * component without an id, fails the typecheck. Nothing from a calendar
 * response is ever used as a component name.
 *
 * Every entry is lazy: the Diwali and Christmas artwork (and their CSS) are
 * separate chunks, downloaded only when that event is actually active.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { isAnimationId, type AnimationId } from "@/lib/events/animationIds";
import type { EventAnimationProps } from "./types";

export const ANIMATION_REGISTRY: Record<
  AnimationId,
  LazyExoticComponent<ComponentType<EventAnimationProps>>
> = {
  diwali: lazy(() => import("./animations/DiwaliAnimation")),
  christmas: lazy(() => import("./animations/ChristmasAnimation")),
};

/** Safe lookup: unknown ids return null instead of throwing. */
export function getAnimationComponent(
  id: string,
): LazyExoticComponent<ComponentType<EventAnimationProps>> | null {
  return isAnimationId(id) ? ANIMATION_REGISTRY[id] : null;
}
