/**
 * Shared look and motion for every floating panel (menus, popovers, selects, tooltips).
 * One place decides separation from the trigger, viewport padding, layer, glass surface and
 * open/close motion, so call sites never carry per-component margins or z-index.
 */

/** Gap between a trigger and its panel. */
export const PANEL_OFFSET = 10;
/** Minimum distance a panel keeps from the viewport edge before it flips or shifts. */
export const COLLISION_PADDING = 12;

/** Glass surface, radius, border, shadow and layer (tokens live in src/index.css). */
export const panel = "z-[var(--z-pop)] rounded-xl glass-pop text-popover-foreground outline-none";

/** Quick fade + 4px slide from the trigger side; closing is faster than opening. */
export const panelMotion =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 " +
  "data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98] data-[state=open]:duration-220 data-[state=closed]:duration-180 ease-out " +
  "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1";

/**
 * Same timing without the scale. A right-anchored panel that scales from its
 * top-right origin moves its left edge sideways while it fades, which reads as
 * drift; this variant keeps the anchor fixed and settles by 4px vertically on
 * both open and close.
 */
export const panelMotionSteady =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 " +
  "data-[state=open]:duration-220 data-[state=closed]:duration-180 ease-out " +
  "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 " +
  "data-[side=bottom]:slide-out-to-top-1 data-[side=top]:slide-out-to-bottom-1";
