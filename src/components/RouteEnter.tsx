import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigationType } from "react-router-dom";

// The first view of a page load already has its own entrance (landing hero, dashboard cards)
// and must not steal focus, so only views mounted after it animate.
let firstViewMounted = false;

/**
 * Enter-only transition for one routed view (landing, sign-in, dashboard, 404).
 * The previous view is already unmounted when this one mounts, so two views never overlap,
 * and nothing re-runs on data updates because the wrapper mounts once per view.
 * Moves keyboard focus to the new view's heading and resets scroll on forward navigation.
 */
export function RouteEnter({ children }: { children: ReactNode }) {
  const navType = useNavigationType();
  const [animate] = useState(firstViewMounted);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstViewMounted = true;
    if (!animate) return;
    if (navType !== "POP") window.scrollTo(0, 0);
    const root = ref.current;
    const target = root?.querySelector<HTMLElement>("h1") ?? root?.querySelector<HTMLElement>("main");
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [animate, navType]);

  return <div ref={ref} className={animate ? "zf-route" : undefined}>{children}</div>;
}
