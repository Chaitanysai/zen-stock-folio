import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tilt Card.
 *
 * Pointer-responsive depth: the surface leans toward the cursor by a few
 * degrees and a soft highlight tracks the pointer, so a large card reads as a
 * physical panel rather than a flat rectangle.
 *
 * Deliberately conservative, because a dashboard is read before it is played
 * with:
 *
 *  - The tilt is small (<= 4deg) and the perspective is wide, so text stays
 *    legible and nothing appears to swing.
 *  - Pointer tracking is skipped entirely on coarse pointers (touch) and when
 *    `prefers-reduced-motion: reduce` is set; the card then renders as a plain
 *    surface with no listeners attached.
 *  - The transform is written to a CSS custom property and applied by a
 *    transform-only rule, so the work stays on the compositor and never
 *    triggers layout. Pointer events are read, never intercepted: clicks,
 *    selection and scrolling behave exactly as before.
 *  - It is opt-in. Applying it to every tile would make the dashboard feel
 *    unstable, so only large standalone cards should use it.
 */

/** Peak rotation in degrees at the card's edge. */
const MAX_TILT = 4;
/** Distance used to place the perspective origin; larger reads as flatter. */
const PERSPECTIVE = 900;

export interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Peak rotation in degrees. Clamped to a legible range. */
  intensity?: number;
  asChild?: never;
}

const TiltCard = React.forwardRef<HTMLDivElement, TiltCardProps>(
  ({ className, children, intensity = MAX_TILT, style, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLDivElement | null>(null);
    const frame = React.useRef<number | null>(null);
    const enabled = React.useRef(false);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    React.useEffect(() => {
      const node = innerRef.current;
      if (!node || typeof window === "undefined" || typeof window.matchMedia !== "function") return;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if (reduceMotion || !finePointer) return;

      enabled.current = true;
      const tilt = Math.min(Math.max(intensity, 0), 8);

      const clear = () => {
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
        node.style.setProperty("--tilt-x", "0deg");
        node.style.setProperty("--tilt-y", "0deg");
        node.style.setProperty("--tilt-lift", "0px");
        node.style.setProperty("--spot-x", "50%");
        node.style.setProperty("--spot-y", "50%");
      };

      const handleMove = (event: PointerEvent) => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          // Normalised position within the card, -0.5 (top/left) .. 0.5.
          const px = (event.clientX - rect.left) / rect.width - 0.5;
          const py = (event.clientY - rect.top) / rect.height - 0.5;
          // Invert Y so the top edge leans away from the viewer.
          node.style.setProperty("--tilt-x", `${(-py * tilt).toFixed(2)}deg`);
          node.style.setProperty("--tilt-y", `${(px * tilt).toFixed(2)}deg`);
          node.style.setProperty("--tilt-lift", "2px");
          node.style.setProperty("--spot-x", `${(px + 0.5) * 100}%`);
          node.style.setProperty("--spot-y", `${(py + 0.5) * 100}%`);
        });
      };

      const handleLeave = () => clear();

      node.addEventListener("pointermove", handleMove);
      node.addEventListener("pointerleave", handleLeave);
      node.addEventListener("pointercancel", handleLeave);

      return () => {
        enabled.current = false;
        node.removeEventListener("pointermove", handleMove);
        node.removeEventListener("pointerleave", handleLeave);
        node.removeEventListener("pointercancel", handleLeave);
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }, [intensity]);

    return (
      <div
        ref={setRefs}
        className={cn("zf-tilt", className)}
        style={{ ...style, ["--tilt-perspective" as string]: `${PERSPECTIVE}px` }}
        {...props}
      >
        <span aria-hidden="true" className="zf-tilt-spot" />
        {children}
      </div>
    );
  },
);
TiltCard.displayName = "TiltCard";

export { TiltCard };
