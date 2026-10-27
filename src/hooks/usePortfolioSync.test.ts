import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioSnapshot } from "./usePortfolioSync";

/**
 * Simulated Firestore-backed store. `currentUser` stands in for the uid whose
 * Firebase ID token the request carries:
 *  - a read returns the document only when it belongs to the caller
 *  - a write aimed at another uid is rejected (security rules answer 403)
 *  - a failed read is reported as an error, never as an empty account
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  currentUser: null as string | null,
  /** Forces a genuine read failure (NOT the "document missing" case). */
  loadError: null as string | null,
  /** Counts successful writes so a blocked save can be proven to never land. */
  writes: 0,
}));

vi.mock("@/lib/data", () => ({
  getPortfolioDataStore: async () => ({
    name: "firestore",
    async loadSnapshot(userId: string) {
      if (db.loadError) return { status: "error", error: db.loadError };
      if (!db.currentUser || userId !== db.currentUser || !db.rows.has(userId)) {
        return { status: "ok", snapshot: null };
      }
      return { status: "ok", snapshot: db.rows.get(userId) };
    },
    async saveSnapshot(userId: string, snapshot: unknown) {
      if (!db.currentUser || userId !== db.currentUser) {
        return "You can only write to your own portfolio.";
      }
      db.rows.set(userId, snapshot);
      db.writes += 1;
      return null;
    },
    async loadDisplayName() {
      return null;
    },
    async saveDisplayName() {
      return null;
    },
  }),
}));

import {
  clearLocalPortfolioCache,
  CLOUD_UNAVAILABLE_MESSAGE,
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
  db.loadError = null;
  db.writes = 0;
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

    await expect(syncFor(USER_A).current.load()).resolves.toEqual({ status: "ready", snapshot: null });
  });

  it("never adopts the guest cache into an account", async () => {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(snapshotFor("GUESTCO")));
    db.currentUser = USER_A;

    await expect(syncFor(USER_A).current.load()).resolves.toEqual({ status: "ready", snapshot: null });
  });

  it("never adopts another account's cache", async () => {
    window.localStorage.setItem(userStorageKey(USER_A), JSON.stringify(snapshotFor("INFY")));
    db.currentUser = USER_B;

    await expect(syncFor(USER_B).current.load()).resolves.toEqual({ status: "ready", snapshot: null });
  });
});

describe("two-user server isolation", () => {
  it("lets each user read only their own row", async () => {
    db.currentUser = USER_A;
    expect(await saveToServer(USER_A, snapshotFor("TCS"))).toBeNull();

    db.currentUser = USER_B;
    expect(await saveToServer(USER_B, snapshotFor("HDFCBANK"))).toBeNull();

    db.currentUser = USER_A;
    const rowA = await loadFromServer(USER_A);
    expect(rowA.status).toBe("ok");
    expect(rowA.status === "ok" && rowA.snapshot).toMatchObject({ stocks: [{ ticker: "TCS" }] });
    expect(await loadFromServer(USER_B)).toEqual({ status: "ok", snapshot: null });

    db.currentUser = USER_B;
    const rowB = await loadFromServer(USER_B);
    expect(rowB.status).toBe("ok");
    expect(rowB.status === "ok" && rowB.snapshot).toMatchObject({ stocks: [{ ticker: "HDFCBANK" }] });
    expect(await loadFromServer(USER_A)).toEqual({ status: "ok", snapshot: null });
  });

  it("rejects a write aimed at another user's document", async () => {
    db.currentUser = USER_A;
    await saveToServer(USER_A, snapshotFor("TCS"));

    db.currentUser = USER_B;
    const error = await saveToServer(USER_A, snapshotFor("HIJACK"));

    expect(error).toBeTruthy();
    expect(JSON.stringify(db.rows.get(USER_A))).toContain("TCS");
    expect(JSON.stringify(db.rows.get(USER_A))).not.toContain("HIJACK");
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
    await expect(syncFor(USER_B).current.load()).resolves.toEqual({ status: "ready", snapshot: null });
  });

  it("keeps the previous account's data out even without a cache clear", async () => {
    db.currentUser = USER_A;
    await syncFor(USER_A).current.save(snapshotFor("TCS"));

    db.currentUser = USER_B;
    await expect(syncFor(USER_B).current.load()).resolves.toEqual({ status: "ready", snapshot: null });
  });

  it("restores each account's own data on sign-in", async () => {
    db.currentUser = USER_A;
    await syncFor(USER_A).current.save(snapshotFor("TCS"));
    db.currentUser = USER_B;
    await syncFor(USER_B).current.save(snapshotFor("HDFCBANK"));

    db.currentUser = USER_A;
    const restoredA = await syncFor(USER_A).current.load();
    expect(restoredA.status).toBe("ready");
    expect(restoredA.snapshot).toMatchObject({ stocks: [{ ticker: "TCS" }] });

    db.currentUser = USER_B;
    const restoredB = await syncFor(USER_B).current.load();
    expect(restoredB.status).toBe("ready");
    expect(restoredB.snapshot).toMatchObject({ stocks: [{ ticker: "HDFCBANK" }] });
  });
});

describe("first-load hydration gate", () => {
  it("refuses a cloud write before the initial read completes", async () => {
    db.currentUser = USER_A;

    await expect(syncFor(USER_A).current.save(snapshotFor("EARLY"))).resolves.toBe(
      CLOUD_UNAVAILABLE_MESSAGE,
    );

    expect(db.writes).toBe(0);
    // The edit is not lost — it is kept on this device.
    expect(window.localStorage.getItem(userStorageKey(USER_A))).toContain("EARLY");
  });

  it("shows the device cache but never overwrites cloud data after a failed read", async () => {
    window.localStorage.setItem(userStorageKey(USER_A), JSON.stringify(snapshotFor("LOCALONLY")));
    db.currentUser = USER_A;
    db.loadError = "permission denied";

    const hook = syncFor(USER_A);
    const loaded = await hook.current.load();

    expect(loaded.status).toBe("degraded");
    expect(loaded.snapshot).toMatchObject({ stocks: [{ ticker: "LOCALONLY" }] });

    await expect(hook.current.save(snapshotFor("NEW"))).resolves.toBe(CLOUD_UNAVAILABLE_MESSAGE);
    expect(db.writes).toBe(0);
  });

  it("becomes writable once a successful read has completed", async () => {
    db.currentUser = USER_A;
    await saveToServer(USER_A, snapshotFor("SERVER"));

    const hook = syncFor(USER_A);
    const loaded = await hook.current.load();
    expect(loaded.status).toBe("ready");
    expect(loaded.snapshot).toMatchObject({ stocks: [{ ticker: "SERVER" }] });
    await expect(hook.current.save(snapshotFor("UPDATED"))).resolves.toBeNull();

    expect(db.writes).toBe(2);
  });

  it("does not let the previous account's readiness authorise a write for the next", async () => {
    db.currentUser = USER_A;
    const { result, rerender } = renderHook(
      ({ id }: { id: string | undefined }) => usePortfolioSync(id),
      { initialProps: { id: USER_A as string | undefined } },
    );
    await result.current.load();

    rerender({ id: USER_B });
    // No load() has run for USER_B.
    await expect(result.current.save(snapshotFor("LEAK"))).resolves.toBe(CLOUD_UNAVAILABLE_MESSAGE);
    expect(db.writes).toBe(0);
  });
});
