import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Isolation tests for the Firestore data adapter. The load-bearing property
 * under test: every read and write is keyed by the CALLER's own uid and the
 * payload's uid field always equals the document ID — so a document can
 * never be created under, re-pointed at, or read from another user's
 * identity. (Enforcement server-side is covered by firestore.rules tests
 * against the emulator; these pin the adapter's contract.)
 */

const firestoreMock = vi.hoisted(() => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
}));

vi.mock("firebase/firestore", () => firestoreMock);

vi.mock("@/lib/firebase/firestore", () => ({
  getFirebaseDb: () => "sentinel-db",
}));

import {
  PORTFOLIOS_COLLECTION,
  USERS_COLLECTION,
  firestorePortfolioStore,
} from "./firestorePortfolioStore";
import type { PortfolioSnapshot } from "@/hooks/usePortfolioSync";

const snapshotShape = {
  stocks: [{ ticker: "RELIANCE", status: "Active" }],
  trades: [],
  watchlist: [],
  alerts: [],
  fnoTrades: [],
} as unknown as PortfolioSnapshot;

/** Records the document reference the adapter built for each call. */
const refsFor = () => firestoreMock.doc.mock.calls.map((call) => call);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("firestorePortfolioStore.loadSnapshot", () => {
  it("reads only portfolios/{callerUid}", async () => {
    firestoreMock.doc.mockReturnValue("ref-alice");
    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "user-a", snapshot: snapshotShape }),
    });

    const result = await firestorePortfolioStore.loadSnapshot("user-a");

    expect(result).toEqual({ status: "ok", snapshot: snapshotShape });
    expect(refsFor()[0]).toEqual(["sentinel-db", PORTFOLIOS_COLLECTION, "user-a"]);
  });

  it("returns an empty ok result when the document is missing", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });
    await expect(firestorePortfolioStore.loadSnapshot("user-a")).resolves.toEqual({
      status: "ok",
      snapshot: null,
    });
  });

  it("defence-in-depth: refuses a document whose uid field belongs to someone else", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "user-b", snapshot: snapshotShape }),
    });

    await expect(firestorePortfolioStore.loadSnapshot("user-a")).resolves.toEqual({
      status: "ok",
      snapshot: null,
    });
  });

  it("defence-in-depth: refuses a structurally invalid snapshot", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "user-a", snapshot: { stocks: "not-an-array" } }),
    });

    await expect(firestorePortfolioStore.loadSnapshot("user-a")).resolves.toEqual({
      status: "ok",
      snapshot: null,
    });
  });

  it("reports read failures as an error instead of an empty account", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockRejectedValueOnce(new Error("offline"));
    await expect(firestorePortfolioStore.loadSnapshot("user-a")).resolves.toEqual({
      status: "error",
      error: "offline",
    });
  });
});

describe("firestorePortfolioStore.saveSnapshot", () => {
  it("writes exactly to portfolios/{callerUid} with uid == document id", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.setDoc.mockResolvedValueOnce(undefined);

    await expect(firestorePortfolioStore.saveSnapshot("user-a", snapshotShape)).resolves.toBeNull();

    expect(refsFor()[0]).toEqual(["sentinel-db", PORTFOLIOS_COLLECTION, "user-a"]);
    const [, payload] = firestoreMock.setDoc.mock.calls[0];
    expect(payload.uid).toBe("user-a");
    expect(payload.snapshot).toEqual(snapshotShape);
    expect(payload.updatedAt).toBe("SERVER_TIMESTAMP");
  });

  it("returns an error string instead of throwing on failure", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.setDoc.mockRejectedValueOnce(new Error("permission denied"));
    await expect(firestorePortfolioStore.saveSnapshot("user-a", snapshotShape)).resolves.toBe(
      "permission denied",
    );
  });
});

describe("firestorePortfolioStore profile methods", () => {
  it("writes the display name to users/{callerUid} with uid == document id", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.setDoc.mockResolvedValueOnce(undefined);

    await expect(
      firestorePortfolioStore.saveDisplayName("user-a", "Alice"),
    ).resolves.toBeNull();

    expect(refsFor()[0]).toEqual(["sentinel-db", USERS_COLLECTION, "user-a"]);
    const [, payload, options] = firestoreMock.setDoc.mock.calls[0];
    expect(payload.uid).toBe("user-a");
    expect(payload.displayName).toBe("Alice");
    expect(options).toEqual({ merge: true });
  });

  it("reads the display name only when the uid field matches the caller", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "user-b", displayName: "Bob" }),
    });
    await expect(firestorePortfolioStore.loadDisplayName("user-a")).resolves.toBeNull();

    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "user-a", displayName: "Alice" }),
    });
    await expect(firestorePortfolioStore.loadDisplayName("user-a")).resolves.toBe("Alice");
  });

  it("treats a non-string display name as absent", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ uid: "user-a", displayName: 42 }),
    });
    await expect(firestorePortfolioStore.loadDisplayName("user-a")).resolves.toBeNull();
  });

  it("falls back to null instead of rejecting when the profile read fails", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.getDoc.mockRejectedValueOnce(new Error("permission denied"));
    await expect(firestorePortfolioStore.loadDisplayName("user-a")).resolves.toBeNull();
  });

  it("returns an error string when the profile write fails", async () => {
    firestoreMock.doc.mockReturnValue("ref");
    firestoreMock.setDoc.mockRejectedValueOnce(new Error("permission denied"));
    await expect(firestorePortfolioStore.saveDisplayName("user-a", "Alice")).resolves.toBe(
      "permission denied",
    );
  });
});
