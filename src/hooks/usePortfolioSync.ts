import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { PortfolioStock, TradeStrategy, WatchlistStock, PriceAlert } from "@/data/sampleData";

export type PortfolioSnapshot = {
  stocks: PortfolioStock[];
  trades: TradeStrategy[];
  watchlist: WatchlistStock[];
  alerts: PriceAlert[];
};

const STORAGE_KEY = "smart-stock-tracker-data";

// ── Local helpers ──────────────────────────────────────────────────────────────
export const saveToLocal = (snapshot: PortfolioSnapshot) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // quota exceeded or private mode — ignore
  }
};

export const loadFromLocal = (): PortfolioSnapshot | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    return { stocks: parsed.stocks, trades: parsed.trades, watchlist: parsed.watchlist, alerts: parsed.alerts };
  } catch {
    return null;
  }
};

// ── Cloud helpers ──────────────────────────────────────────────────────────────
export const loadFromServer = async (userId: string): Promise<PortfolioSnapshot | null> => {
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("snapshot")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  try {
    const parsed = data.snapshot as Partial<PortfolioSnapshot>;
    if (
      !Array.isArray(parsed.stocks) ||
      !Array.isArray(parsed.trades) ||
      !Array.isArray(parsed.watchlist) ||
      !Array.isArray(parsed.alerts)
    ) {
      return null;
    }
    return { stocks: parsed.stocks, trades: parsed.trades, watchlist: parsed.watchlist, alerts: parsed.alerts };
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
    if (userId) {
      const serverData = await loadFromServer(userId);
      if (serverData) {
        // Keep local cache in sync
        saveToLocal(serverData);
        return serverData;
      }
    }
    // Fall back to local cache (e.g. offline or not yet logged in)
    return loadFromLocal();
  }, [userId]);

  const save = useCallback(async (snapshot: PortfolioSnapshot): Promise<string | null> => {
    // Always write local first so it's instant
    saveToLocal(snapshot);

    if (userId) {
      return saveToServer(userId, snapshot);
    }
    return null; // saved only locally (anonymous)
  }, [userId]);

  return { load, save };
};
