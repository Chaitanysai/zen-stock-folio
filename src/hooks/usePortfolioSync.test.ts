import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioSnapshot } from "./usePortfolioSync";

/**
 * Simulated Postgres + RLS. `currentUser` stands in for `auth.uid()`:
 *  - SELECT only returns a row when it belongs to the current user
 *  - UPSERT is rejected unless the payload's user_id is the current user
 *    (this is the `WITH CHECK (auth.uid() = user_id)` clause)
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  currentUser: null as string | null,
  /** Forces the DB to hand back a foreign row, to test client-side defence. */
  forceLeakRow: null as { user_id: string; snapshot: unknown } | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          single: async () => {
            if (db.forceLeakRow) return { data: db.forceLeakRow, error: null };
            if (!db.currentUser || value !== db.currentUser) {
              return { data: null, error: { message: "no rows returned" } };
            }
            if (!db.rows.has(value)) {
              return { data: null, error: { message: "no rows returned" } };
            }
            return { data: { user_id: value, snapshot: db.rows.get(value) }, error: null };
          },
        }),
      }),
      upsert: async (payload: { user_id: string; snapshot: unknown }) => {
        if (!db.currentUser || payload.user_id !== db.currentUser) {
          return { error: { message: "new row violates row-level security policy" } };
        }
        db.rows.set(payload.user_id, payload.snapshot);
        return { error: null };
      },
    }),
  },
}));

import {
  clearLocalPortfolioCache,
  displayNameKeyFor,
  GUEST_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  loadFromServer,
  saveToServer,
  storageKeyFor,
  userStorageKey,
  usePortfolioSync,
} from "./usePortfolioSync";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const snapshotFor = (ticker: string): PortfolioSnapshot =>
  ({
    stocks: [{ ticker, status: "Active" }],
    trades: [],
    watchlist: [],
    alerts: [],
    fnoTrades: [],
  } as unknown as PortfolioSnapshot);

const syncFor = (userId: string | undefined) => renderHook(() => usePortfolioSync(userId)).result;

beforeEach(() => {
  window.localStorage.clear();
  db.rows.clear();
  db.currentUser = null;
  db.forceLeakRow = null;
});

describe("cache scoping", () => {
  it("gives every account its own storage key", () => {
    expect(storageKeyFor(USER_A)).toBe(userStorageKey(USER_A));
    expect(storageKeyFor(USER_A)).not.toBe(storageKeyFor(USER_B));
    expect(storageKeyFor(undefined)).toBe(GUEST_STORAGE_KEY);
    expect(storageKeyFor(USER_A)).not.toBe(LEGACY_STORAGE_KEY);
    expect(displayNameKeyFor(USER_A)).not.toBe(displayNameKeyFor(USER_B));
  });

  it("writes only to the caller's own scope", async () => {
    db.currentUser = USER_A;
    await syncFor(USER_A).current.save(snapshotFor("TCS"));

    expect(window.localStorage.getItem(userStorageKey(USER_A))).toContain("TCS");
    expect(window.localStorage.getItem(userStorageKey(USER_B))).toBeNull();
    expect(window.localStorage.getItem(GUEST_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});

describe("no cross-scope fallback", () => {
  it("never adopts the legacy global cache into an account", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshotFor("LEGACY")));
    db.currentUser = USER_A;

    await expect(syncFor(USER_A).current.load()).resolves.toBeNull();
  });

  it("never adopts the guest cache into an account", async () => {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(snapshotFor("GUESTCO")));
    db.currentUser = USER_A;

    await expect(syncFor(USER_A).current.load()).resolves.toBeNull();
  });

  it("never adopts another account's cache", async () => {
    window.localStorage.setItem(userStorageKey(USER_A), JSON.stringify(snapshotFor("INFY")));
    db.currentUser = USER_B;

    await expect(syncFor(USER_B).current.load()).resolves.toBeNull();
  });
});

describe("two-user server isolation", () => {
  it("lets each user read only their own row", async () => {
    db.currentUser = USER_A;
    expect(await saveToServer(USER_A, snapshotFor("TCS"))).toBeNull();

    db.currentUser = USER_B;
    expect(await saveToServer(USER_B, snapshotFor("HDFCBANK"))).toBeNull();

    db.currentUser = USER_A;
    expect(await loadFromServer(USER_A)).toMatchObject({ stocks: [{ ticker: "TCS" }] });
    expect(await loadFromServer(USER_B)).toBeNull();

    db.currentUser = USER_B;
    expect(await loadFromServer(USER_B)).toMatchObject({ stocks: [{ ticker: "HDFCBANK" }] });
    expect(await loadFromServer(USER_A)).toBeNull();
  });

  it("rejects a write aimed at another user's row", async () => {
    db.currentUser = USER_A;
    await saveToServer(USER_A, snapshotFor("TCS"));

    db.currentUser = USER_B;
    const error = await saveToServer(USER_A, snapshotFor("HIJACK"));

    expect(error).toMatch(/row-level security/i);
    expect(JSON.stringify(db.rows.get(USER_A))).toContain("TCS");
    expect(JSON.stringify(db.rows.get(USER_A))).not.toContain("HIJACK");
  });

  it("discards a foreign row even if the database leaks one", async () => {
    db.forceLeakRow = { user_id: USER_A, snapshot: snapshotFor("TCS") };

    await expect(loadFromServer(USER_B)).resolves.toBeNull();
  });
});

describe("logout and account switching", () => {
  it("clears every cached scope but keeps the unowned legacy blob", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshotFor("LEGACY")));
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(snapshotFor("GUESTCO")));
    window.localStorage.setItem(userStorageKey(USER_A), JSON.stringify(snapshotFor("TCS")));
    window.localStorage.setItem(userStorageKey(USER_B), JSON.stringify(snapshotFor("HDFCBANK")));
    window.localStorage.setItem(displayNameKeyFor(USER_A), "Alice");
    window.localStorage.setItem("zf-fno-trades", "[]");
    window.localStorage.setItem("zf-dark", "1");

    clearLocalPortfolioCache();

    expect(window.localStorage.getItem(userStorageKey(USER_A))).toBeNull();
    expect(window.localStorage.getItem(userStorageKey(USER_B))).toBeNull();
    expect(window.localStorage.getItem(GUEST_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(displayNameKeyFor(USER_A))).toBeNull();
    expect(window.localStorage.getItem("zf-fno-trades")).toBeNull();
    // Not ours to delete, and never read back in:
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
    // Unrelated preference is untouched:
    expect(window.localStorage.getItem("zf-dark")).toBe("1");
  });

  it("shows nothing to the next account after a sign-out", async () => {
    db.currentUser = USER_A;
    await syncFor(USER_A).current.save(snapshotFor("TCS"));

    // Sign out -> AuthContext calls clearLocalPortfolioCache()
    clearLocalPortfolioCache();

    db.currentUser = USER_B;
    await expect(syncFor(USER_B).current.load()).resolves.toBeNull();
  });

  it("keeps the previous account's data out even without a cache clear", async () => {
    db.currentUser = USER_A;
    await syncFor(USER_A).current.save(snapshotFor("TCS"));

    db.currentUser = USER_B;
    await expect(syncFor(USER_B).current.load()).resolves.toBeNull();
  });

  it("restores each account's own data on sign-in", async () => {
    db.currentUser = USER_A;
    await syncFor(USER_A).current.save(snapshotFor("TCS"));
    db.currentUser = USER_B;
    await syncFor(USER_B).current.save(snapshotFor("HDFCBANK"));

    db.currentUser = USER_A;
    await expect(syncFor(USER_A).current.load()).resolves.toMatchObject({
      stocks: [{ ticker: "TCS" }],
    });

    db.currentUser = USER_B;
    await expect(syncFor(USER_B).current.load()).resolves.toMatchObject({
      stocks: [{ ticker: "HDFCBANK" }],
    });
  });
});
