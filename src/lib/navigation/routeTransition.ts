import { flushSync } from "react-dom";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
};

/** Keep the overlay attribute from sticking if `finished` never settles (e.g. tab hidden). */
const WATCHDOG_MS = 1200;

let active = false;
let watchdog: number | undefined;
let transitionHandled = false;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return !window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

function clearTransitionState(root: HTMLElement) {
  active = false;
  root.removeAttribute("data-route-transition");
  if (watchdog !== undefined) window.clearTimeout(watchdog);
  watchdog = undefined;
}

/**
 * True once for the view mounted by a View Transition, so its CSS entrance does
 * not replay after the transition ends (and the snapshot is captured fully opaque).
 */
export function consumeRouteTransition(): boolean {
  const handled = transitionHandled;
  transitionHandled = false;
  return handled;
}

/**
 * Runs a route update inside a View Transition when the browser supports it.
 * Falls back to a plain synchronous update (the CSS route entrance still plays).
 */
export function runRouteUpdate(update: () => void) {
  const doc = typeof document === "undefined" ? null : (document as ViewTransitionDocument);
  const root = doc?.documentElement;
  const canTransition = Boolean(doc?.startViewTransition) && !prefersReducedMotion();

  // A theme reveal owns the root transition; overlapping snapshots would break its clip-path.
  if (!doc || !root || !canTransition || active || root.hasAttribute("data-theme-reveal")) {
    update();
    return;
  }

  active = true;
  transitionHandled = false;
  root.setAttribute("data-route-transition", "");

  try {
    const transition = doc.startViewTransition(() => {
      transitionHandled = true;
      update();
    });
    transition.finished.then(
      () => clearTransitionState(root),
      () => clearTransitionState(root),
    );
    watchdog = window.setTimeout(() => clearTransitionState(root), WATCHDOG_MS);
  } catch {
    clearTransitionState(root);
    update();
  }
}

let installed = false;
let synthetic = false;
let lastPath = "";

/** Called after every committed location change so hash-only popstates can be told apart. */
export function setLastRoutePath(path: string) {
  lastPath = path;
}

/**
 * Wraps browser back/forward in a View Transition.
 *
 * React Router registers its popstate listener when BrowserRouter first renders,
 * which is after App.tsx evaluates and calls this, so this listener runs first
 * and can stop the router from committing outside the transition. The router is
 * then re-driven synchronously with a synthetic event inside the transition callback.
 */
export function installHistoryRouteTransition() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  lastPath = window.location.pathname + window.location.search;

  window.addEventListener("popstate", (event) => {
    if (synthetic) return;

    const doc = document as ViewTransitionDocument;
    if (!doc.startViewTransition || prefersReducedMotion()) return;
    if (document.documentElement.hasAttribute("data-theme-reveal")) return;
    // Hash-only history moves stay native: a full crossfade of the same page would be noise.
    if (window.location.pathname + window.location.search === lastPath) return;

    event.stopImmediatePropagation();
    const state = window.history.state;
    runRouteUpdate(() => {
      synthetic = true;
      try {
        flushSync(() => {
          window.dispatchEvent(new PopStateEvent("popstate", { state }));
        });
      } finally {
        synthetic = false;
      }
    });
  });
}
