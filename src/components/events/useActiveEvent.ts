import { useEffect, useState } from "react";
import { nextMidnightInTimeZone } from "@/lib/events/dateUtils";
import { resolveActiveEvent } from "@/lib/events/eventResolver";
import type { EventResolution } from "@/lib/events/types";

/** Re-render only when the visible outcome changes, not on every resolve. */
function isSameResolution(a: EventResolution | null, b: EventResolution): boolean {
  if (!a) return false;
  if (a.today !== b.today) return false;
  if ((a.active?.event.id ?? null) !== (b.active?.event.id ?? null)) return false;
  if ((a.active?.animationId ?? null) !== (b.active?.animationId ?? null)) return false;
  if ((a.active?.window.start ?? null) !== (b.active?.window.start ?? null)) return false;
  if ((a.next?.event.id ?? null) !== (b.next?.event.id ?? null)) return false;
  if ((a.next?.startsOn ?? null) !== (b.next?.startsOn ?? null)) return false;
  return true;
}

/**
 * Resolves the active event once on mount, then again at the next Asia/Kolkata
 * midnight (the only moment the display window can change).
 *
 * Returns null until the first resolve settles, so a page with no active event
 * renders no extra DOM at all. Pass `now` to pin the instant in tests.
 */
export function useActiveEvent(now?: Date): EventResolution | null {
  const [resolution, setResolution] = useState<EventResolution | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      let next: EventResolution | null = null;
      try {
        next = await resolveActiveEvent(now ?? new Date());
      } catch {
        next = null;
      }
      if (cancelled) return;

      if (next) {
        setResolution((previous) => (isSameResolution(previous, next) ? previous : next));
      }

      // A pinned instant is a test fixture: do not schedule a live refresh.
      if (now) return;

      const midnight = nextMidnightInTimeZone(new Date());
      const delay = Math.max(1000, midnight.getTime() - Date.now() + 1000);
      timer = setTimeout(run, delay);
    };

    void run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [now]);

  return resolution;
}
