import { useCallback, useRef } from "react";
import { getPortfolioDataStore } from "@/lib/data";
import type { LoadSnapshotResult } from "@/lib/data/types";
import type { PortfolioSnapshot } from "@/lib/data/snapshotTypes";

export type { PortfolioSnapshot };

const STORAGE_PREFIX = "smart-stock-tracker-data";

/**
 * Legacy single-tenant cache key from before per-user scoping existed.
 *
 * It is deliberately NEVER read and NEVER deleted:
 *  - reading it would let one account inherit a blob whose owner is unknown
 *    (the cross-account leak this module exists to prevent), and
 *  - deleting it would destroy data whose ownership we cannot establish.
 * It simply stays on disk, orphaned, and can be recovered by hand if needed.
 */
export const LEGACY_STORAGE_KEY = STORAGE_PREFIX;

/** Cache scope for a visitor with no session. */
export const GUEST_STORAGE_KEY = `${STORAGE_PREFIX}:guest`;

/** Cache scope for one authenticated user. */
export const userStorageKey = (userId: string) => `${STORAGE_PREFIX}:u:${userId}`;

/** Resolves the only cache key a given session is allowed to touch. */
export const storageKeyFor = (userId?: string | null): string =>
  userId ? userStorageKey(userId) : GUEST_STORAGE_KEY;

export const DISPLAY_NAME_PREFIX = "zf-display-name";
export const displayNameKeyFor = (userId?: string | null): string =>
  userId ? `${DISPLAY_NAME_PREFIX}:u:${userId}` : `${DISPLAY_NAME_PREFIX}:guest`;

/** Stale global keys that must not survive a session change. */
const CLEARABLE_EXACT_KEYS = ["zf-fno-trades", DISPLAY_NAME_PREFIX];

// ── Local helpers ──────────────────────────────────────────────────────────────
export const saveToLocal = (snapshot: PortfolioSnapshot, storageKey: string) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // quota exceeded or private mode — ignore
  }
};

export const loadFromLocal = (storageKey: string): PortfolioSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PortfolioSnapshot>;
    if (
      !Array.isArray(parsed.stocks) ||
      !Array.isArray(parsed.trades) ||
      !Array.isArray(parsed.watchlist) ||
      !Array.isArray(parsed.alerts)
    ) {
      return null;
    }
    return {
      stocks: parsed.stocks,
      trades: parsed.trades,
      watchlist: parsed.watchlist,
      alerts: parsed.alerts,
      fnoTrades: Array.isArray(parsed.fnoTrades) ? parsed.fnoTrades : [],
    };
  } catch {
    return null;
  }
};

/**
 * Removes every per-scope portfolio cache (all accounts plus guest) and the
 * stale global keys. Called on sign-out and on account switch so a shared
 * browser cannot show one account's portfolio to the next session.
 * The legacy orphan key is left untouched on purpose.
 */
export const clearLocalPortfolioCache = (): void => {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || key === LEGACY_STORAGE_KEY) continue;
      if (
        key.startsWith(`${STORAGE_PREFIX}:`) ||
        key.startsWith(`${DISPLAY_NAME_PREFIX}:`) ||
        CLEARABLE_EXACT_KEYS.includes(key)
      ) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // private mode / storage disabled — nothing to clear
  }
};

// ── Cloud helpers ──────────────────────────────────────────────────────────────
/**
 * Reads the caller's own snapshot. Ownership is enforced server-side
 * (Postgres RLS with the active provider, Firestore security rules after the
 * cutover); each store also applies a client-side uid equality check as
 * defence-in-depth so a misconfigured backend can never surface another
 * user's row in the UI.
 */
export const loadFromServer = async (userId: string): Promise<LoadSnapshotResult> => {
  const store = await getPortfolioDataStore();
  return store.loadSnapshot(userId);
};

export const saveToServer = async (userId: string, snapshot: PortfolioSnapshot): Promise<string | null> => {
  const store = await getPortfolioDataStore();
  return store.saveSnapshot(userId, snapshot);
};

export const loadDisplayNameFromServer = async (userId: string): Promise<string | null> => {
  const store = await getPortfolioDataStore();
  return store.loadDisplayName(userId);
};

export const saveDisplayNameToServer = async (
  userId: string,
  displayName: string,
): Promise<string | null> => {
  const store = await getPortfolioDataStore();
  return store.saveDisplayName(userId, displayName);
};

/**
 * "ready"    — the cloud read for THIS scope completed; cloud writes are safe.
 * "degraded" — the read failed; local cache may be shown, but a write would
 *              overwrite a cloud row we never managed to read.
 * "loading"  — the initial read is still in flight.
 */
export type SyncStatus = "idle" | "loading" | "ready" | "degraded";

export interface SyncLoadResult {
  snapshot: PortfolioSnapshot | null;
  status: SyncStatus;
  error?: string;
}

export const CLOUD_UNAVAILABLE_MESSAGE =
  "Cloud sync is unavailable right now. Your changes are saved on this device only.";

// ── Hook ───────────────────────────────────────────────────────────────────────
export const usePortfolioSync = (userId: string | undefined) => {
  // Readiness is tracked per scope and compared on every save: a save issued
  // while the first cloud read is still running (or after it failed) cannot
  // reach the cloud. The scope check also covers account switches, where the
  // previous account's "ready" state must never authorise a write into the
  // next account's document.
  const scopeKey = userId ?? "guest";
  const readinessRef = useRef<{ scope: string; status: SyncStatus }>({
    scope: "",
    status: "idle",
  });

  const load = useCallback(async (): Promise<SyncLoadResult> => {
    const storageKey = storageKeyFor(userId);
    readinessRef.current = { scope: scopeKey, status: "loading" };

    if (!userId) {
      readinessRef.current = { scope: scopeKey, status: "ready" };
      return { snapshot: loadFromLocal(storageKey), status: "ready" };
    }

    const result = await loadFromServer(userId);

    if (result.status === "error") {
      readinessRef.current = { scope: scopeKey, status: "degraded" };
      // Show this account's own cache so the session is usable, but keep the
      // scope degraded — `save` refuses to push it back over the cloud copy.
      return { snapshot: loadFromLocal(storageKey), status: "degraded", error: result.error };
    }

    if (result.snapshot) saveToLocal(result.snapshot, storageKey);
    readinessRef.current = { scope: scopeKey, status: "ready" };

    // No cloud row yet (new account). Only this user's own cache may be used —
    // never the guest cache, another user's cache, or the legacy global blob.
    return { snapshot: result.snapshot ?? loadFromLocal(storageKey), status: "ready" };
  }, [userId, scopeKey]);

  const save = useCallback(async (snapshot: PortfolioSnapshot): Promise<string | null> => {
    // Write to this session's own scope first so it is instant.
    saveToLocal(snapshot, storageKeyFor(userId));

    if (!userId) return null; // saved only locally (anonymous)

    const readiness = readinessRef.current;
    if (readiness.scope !== scopeKey || readiness.status !== "ready") {
      return CLOUD_UNAVAILABLE_MESSAGE;
    }

    return saveToServer(userId, snapshot);
  }, [userId, scopeKey]);

  return { load, save };
};
