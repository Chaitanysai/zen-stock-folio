/**
 * One festival experience for the whole app.
 *
 * The event calendar is resolved exactly once, here, and every surface — the
 * public hero, the signed-in dashboard, the minimal pages and the greeting chip
 * — reads the same answer. Nothing else calls the resolver, so the landing page
 * and the dashboard can never disagree about which festival is running, and a
 * date change at IST midnight re-renders all of them together.
 *
 * The experience is fully time-driven: it appears when the resolver opens the
 * display window and disappears when the window closes. There are no pause or
 * dismiss controls and no stored dismissal state — a festival runs for a day or
 * two a year, so it needs no management, only the calendar.
 *
 * Everything here is presentation. There is no network call and no account data
 * involved.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ResolvedEvent } from "@/lib/events/types";
import { useActiveEvent } from "./useActiveEvent";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import "@/styles/festival.css";

export interface FestivalExperienceValue {
  /** The active festival and its display window, or null when none is running. */
  active: ResolvedEvent | null;
  /** prefers-reduced-motion, read once for every canvas. */
  reduced: boolean;
}

const FestivalExperienceContext = createContext<FestivalExperienceValue | null>(null);

export function EventExperienceProvider({ children }: { children: ReactNode }) {
  const resolution = useActiveEvent();
  const reduced = usePrefersReducedMotion();

  // A stable context value: the resolver already re-renders only when the
  // visible outcome changes, so a fresh object literal per render would fan
  // pointless updates out to every consumer for the same answer.
  const active = resolution?.active ?? null;
  const value = useMemo(() => ({ active, reduced }), [active, reduced]);

  return (
    <FestivalExperienceContext.Provider value={value}>
      {children}
    </FestivalExperienceContext.Provider>
  );
}

/**
 * The shared festival state. Returns a null-object outside the provider so a
 * component can be rendered in isolation (tests, storybook, a future surface)
 * without a guard in every call site.
 */
export function useFestivalExperience(): FestivalExperienceValue {
  const value = useContext(FestivalExperienceContext);
  if (value) return value;
  return { active: null, reduced: false };
}
