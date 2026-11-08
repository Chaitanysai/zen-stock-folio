/**
 * One festival experience for the whole app.
 *
 * The event calendar is resolved exactly once, here, and every surface — the
 * public hero, the signed-in dashboard, the minimal pages and the greeting chip
 * — reads the same answer. Nothing else calls the resolver, so the landing page
 * and the dashboard can never disagree about which festival is running, and a
 * date change at IST midnight re-renders all of them together.
 *
 * The provider owns the three pieces of state that must be shared rather than
 * per-component:
 *
 *   dismissed  hidden for the rest of this festival window (localStorage)
 *   paused     the visitor pressed pause (this visit only)
 *   reduced    prefers-reduced-motion, read once for every canvas
 *
 * Everything here is presentation. There is no network call and no account data
 * involved, which is why a dismissal lives in localStorage and not the backend.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ResolvedEvent } from "@/lib/events/types";
import {
  clearDismissal,
  isDismissed,
  pruneDismissals,
  rememberDismissal,
} from "./dismissal";
import { useActiveEvent } from "./useActiveEvent";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import "@/styles/festival.css";

export interface FestivalExperienceValue {
  /** The active festival and its display window, or null when none is running. */
  active: ResolvedEvent | null;
  /** The visitor hid the celebration for the rest of this window. */
  dismissed: boolean;
  paused: boolean;
  reduced: boolean;
  togglePaused: () => void;
  dismiss: () => void;
  restore: () => void;
}

const FestivalExperienceContext = createContext<FestivalExperienceValue | null>(null);

export function EventExperienceProvider({ children }: { children: ReactNode }) {
  const resolution = useActiveEvent();
  const reduced = usePrefersReducedMotion();

  const active = resolution?.active ?? null;
  const eventId = active?.animationId ?? null;
  const windowEnd = active?.window.end ?? null;
  const today = resolution?.today ?? null;

  const [, setDismissalVersion] = useState(0);
  const [pausedKey, setPausedKey] = useState<string | null>(null);

  // Keys include the window end, so the identity is stable for the whole window
  // and changes automatically when the next festival (or next year) arrives.
  const identity = eventId && windowEnd ? `${eventId}.${windowEnd}` : null;

  // Read during render so consumers never flash a stored dismissal as visible.
  // Updating the version after storage writes triggers a fresh read.
  const dismissedKey = eventId && windowEnd && isDismissed(eventId, windowEnd) ? identity : null;

  // Pause is per visit: a new festival starts playing, and the preference does
  // not leak between festivals.
  useEffect(() => {
    setPausedKey(null);
  }, [identity]);

  // Expired records can be dropped as soon as we know today's date.
  useEffect(() => {
    if (today) pruneDismissals(today);
  }, [today]);

  const dismiss = useCallback(() => {
    if (!eventId || !windowEnd) return;
    rememberDismissal(eventId, windowEnd);
    setDismissalVersion((version) => version + 1);
  }, [eventId, windowEnd]);

  const restore = useCallback(() => {
    if (!eventId || !windowEnd) return;
    clearDismissal(eventId, windowEnd);
    setDismissalVersion((version) => version + 1);
  }, [eventId, windowEnd]);

  const togglePaused = useCallback(() => {
    setPausedKey((current) => (current === identity ? null : identity));
  }, [identity]);

  const value = useMemo<FestivalExperienceValue>(() => {
    const dismissed = dismissedKey !== null && dismissedKey === identity;
    return {
      active,
      dismissed,
      paused: pausedKey !== null && pausedKey === identity,
      reduced,
      togglePaused,
      dismiss,
      restore,
    };
  }, [active, identity, dismissedKey, pausedKey, reduced, togglePaused, dismiss, restore]);

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
  return {
    active: null,
    dismissed: false,
    paused: false,
    reduced: false,
    togglePaused: () => {},
    dismiss: () => {},
    restore: () => {},
  };
}
