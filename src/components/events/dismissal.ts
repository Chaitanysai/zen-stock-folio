/**
 * Dismissal of a festival celebration, remembered on the device.
 *
 * The rule the visitor opted into is "hide this until Diwali is over", not
 * "never show me fireworks again", so the storage key carries the display
 * window itself:
 *
 *   zf.festival.dismissed.<animationId>.<windowEnd>
 *
 * A new festival, or the same festival next year, simply writes a different key
 * and the celebration returns. Every record also stores the window end it was
 * written for, which gives an explicit expiry — expired keys are pruned on read
 * so the store cannot accumulate one entry per year forever.
 *
 * localStorage (not sessionStorage) because a dismissal should survive a reload,
 * and not the backend because a greeting preference has no business in an
 * account record.
 */
import type { AnimationId } from "@/lib/events/animationIds";

const PREFIX = "zf.festival.dismissed.";

export interface DismissalRecord {
  /** ISO instant the visitor hid the celebration. */
  dismissedAt: string;
  /** Last day of the display window this applies to, YYYY-MM-DD. */
  until: string;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private mode and blocked-storage settings can throw on access.
    return null;
  }
}

export function dismissalKey(animationId: AnimationId, windowEnd: string): string {
  return `${PREFIX}${animationId}.${windowEnd}`;
}

/** True when this window's celebration was already hidden on this device. */
export function isDismissed(animationId: AnimationId, windowEnd: string): boolean {
  const storage = store();
  if (!storage) return false;
  const key = dismissalKey(animationId, windowEnd);
  try {
    const raw = storage.getItem(key);
    if (!raw) return false;
    const record = JSON.parse(raw) as Partial<DismissalRecord>;
    if (record.until !== windowEnd) throw new Error("expired");
    return true;
  } catch {
    // Unreadable or written for another window: drop it and show the festival.
    try {
      storage.removeItem(key);
    } catch {
      /* nothing to do */
    }
    return false;
  }
}

export function rememberDismissal(animationId: AnimationId, windowEnd: string): void {
  const storage = store();
  if (!storage) return;
  const record: DismissalRecord = { dismissedAt: new Date().toISOString(), until: windowEnd };
  try {
    storage.setItem(dismissalKey(animationId, windowEnd), JSON.stringify(record));
  } catch {
    /* quota or private mode — the celebration simply shows next visit */
  }
}

export function clearDismissal(animationId: AnimationId, windowEnd: string): void {
  const storage = store();
  if (!storage) return;
  try {
    storage.removeItem(dismissalKey(animationId, windowEnd));
  } catch {
    /* nothing to do */
  }
}

/**
 * Drop records whose display window has ended. `today` is the resolver's IST
 * date, so this agrees with the rule that decides whether to show the festival
 * at all. Never touches a record that is still in force.
 */
export function pruneDismissals(today: string): void {
  const storage = store();
  if (!storage) return;
  let keys: string[] = [];
  try {
    keys = Object.keys(storage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return;
  }
  for (const key of keys) {
    try {
      const record = JSON.parse(storage.getItem(key) ?? "null") as Partial<DismissalRecord> | null;
      const until = record?.until;
      // ISO dates compare correctly as strings.
      if (typeof until !== "string" || until < today) storage.removeItem(key);
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        /* nothing to do */
      }
    }
  }
}
