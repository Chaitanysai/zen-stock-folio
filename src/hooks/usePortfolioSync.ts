import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PortfolioStock, TradeStrategy, WatchlistStock, PriceAlert, FnOTrade } from "@/data/sampleData";

export type PortfolioSnapshot = {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
  watchlist: WatchlistStock[];
  alerts: PriceAlert[];
  fnoTrades: FnOTrade[];
};

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

/** Cache scope for a visitor with no Supabase session. */
export const GUEST_STORAGE_KEY = `${STORAGE_PREFIX}:guest`;

/** Cache scope for one authenticated Supabase user. */
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

const parseSnapshot = (value: unknown): PortfolioSnapshot | null => {
  const parsed = value as Partial<PortfolioSnapshot> | null;
  if (
    !parsed ||
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
};

// ── Cloud helpers ──────────────────────────────────────────────────────────────
/**
 * Reads the caller's own snapshot. Ownership is enforced by RLS in Postgres;
 * the `user_id` check below is defence-in-depth so a misconfigured policy can
 * never surface another user's row in the UI.
 */
export const loadFromServer = async (userId: string): Promise<PortfolioSnapshot | null> => {
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("user_id, snapshot")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  if (data.user_id !== userId) return null;

  try {
    return parseSnapshot(data.snapshot);
  } catch {
    return null;
  }
};

export const saveToServer = async (userId: string, snapshot: PortfolioSnapshot): Promise<string | null> => {
  const { error } = await supabase
    .from("portfolio_snapshots")
    .upsert(
      { user_id: userId, snapshot, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  return error ? error.message : null;
};

// ── Hook ───────────────────────────────────────────────────────────────────────
export const usePortfolioSync = (userId: string | undefined) => {
  const load = useCallback(async (): Promise<PortfolioSnapshot | null> => {
    const storageKey = storageKeyFor(userId);

    if (userId) {
      const serverData = await loadFromServer(userId);
      if (serverData) {
        saveToLocal(serverData, storageKey);
        return serverData;
      }
      // No server row yet (new account or offline). Only this user's own cache
      // may be used — never the guest cache, another user's cache, or the
      // legacy global blob.
      return loadFromLocal(storageKey);
    }

    return loadFromLocal(storageKey);
  }, [userId]);

  const save = useCallback(async (snapshot: PortfolioSnapshot): Promise<string | null> => {
    // Write to this session's own scope first so it is instant.
    saveToLocal(snapshot, storageKeyFor(userId));

    if (userId) {
      return saveToServer(userId, snapshot);
    }
    return null; // saved only locally (anonymous)
  }, [userId]);

  return { load, save };
};
