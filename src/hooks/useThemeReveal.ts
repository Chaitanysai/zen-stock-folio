import { useCallback, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";

export type ThemeName = "light" | "dark";

interface ViewTransitionLike {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

// The transition now on screen. A newer toggle skips it, and only the newest cleans up after itself.
let active: ViewTransitionLike | null = null;

/** Viewport point the reveal grows from: the pointer for mouse/touch, the button centre for keyboard. */
function revealOrigin(event?: MouseEvent<HTMLElement>): { x: number; y: number } {
  const keyboard = !event || event.detail === 0;
  if (event && !keyboard) return { x: event.clientX, y: event.clientY };
  const rect = event?.currentTarget.getBoundingClientRect();
  if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  return { x: document.documentElement.clientWidth / 2, y: 0 };
}

/**
 * Switch theme with a circular reveal from the clicked control.
 * Uses the View Transitions API: the old page stays still and the new, fully themed page is
 * revealed through an expanding circle (CSS in src/index.css, "Theme reveal"). Without the API,
 * or with reduced motion, the theme changes immediately. next-themes still owns the class on
 * <html>, the saved choice and the before-paint script.
 */
export function useThemeReveal() {
  const { setTheme } = useTheme();

  return useCallback(
    (next: ThemeName, event?: MouseEvent<HTMLElement>) => {
      const root = document.documentElement;
      if (root.classList.contains("dark") === (next === "dark")) {
        setTheme(next); // already showing it: just record the choice
        return;
      }

      const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!start || reduce) {
        setTheme(next);
        return;
      }

      active?.skipTransition();

      const { x, y } = revealOrigin(event);
      const w = root.clientWidth;
      const h = window.innerHeight;
      const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
      root.style.setProperty("--reveal-x", `${x}px`);
      root.style.setProperty("--reveal-y", `${y}px`);
      root.style.setProperty("--reveal-r", `${Math.ceil(radius)}px`);
      root.dataset.themeReveal = "";

      // The update callback runs after the old page is captured; flushSync makes React apply the
      // theme (and next-themes set the class) before the new page is captured.
      const transition = start.call(document, () => {
        flushSync(() => setTheme(next));
      });
      active = transition;
      transition.ready.catch(() => {});
      transition.finished.finally(() => {
        if (active !== transition) return;
        active = null;
        delete root.dataset.themeReveal;
        root.style.removeProperty("--reveal-x");
        root.style.removeProperty("--reveal-y");
        root.style.removeProperty("--reveal-r");
      });
    },
    [setTheme],
  );
}
