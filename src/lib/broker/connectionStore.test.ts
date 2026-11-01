import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "__serverTimestamp__"),
}));

vi.mock("firebase/firestore", () => firestore);
vi.mock("../firebase/firestore", () => ({ getFirebaseDb: () => ({ name: "test-db" }) }));

import {
  clearBrokerConnection,
  loadBrokerConnection,
  markBrokerSynced,
  saveBrokerConnection,
} from "./connectionStore";
import type { BrokerConnectionPayload } from "./types";

const UID = "user-1";
const DOC_PATH = "users/user-1/private/brokerConnection";

const sealed: BrokerConnectionPayload = {
  ciphertext: "ciphertext-material",
  iv: "initialization-vector",
  keyVersion: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
};

const stored = {
  uid: UID,
  provider: "indmoney",
  ...sealed,
  syncedAt: null,
};

const existing = (data: unknown) => ({
  exists: () => true,
  data: () => data,
});

const missing = () => ({ exists: () => false, data: () => undefined });

beforeEach(() => {
  vi.clearAllMocks();
  firestore.serverTimestamp.mockReturnValue("__serverTimestamp__");
});

describe("loadBrokerConnection", () => {
  it("reports a missing document as not connected", async () => {
    firestore.getDoc.mockResolvedValue(missing());
    await expect(loadBrokerConnection(UID)).resolves.toEqual({ status: "ok", connection: null });
    expect(firestore.doc).toHaveBeenCalledWith({ name: "test-db" }, "users", UID, "private", "brokerConnection");
  });

  it("returns the sealed connection without ever exposing a plaintext token", async () => {
    firestore.getDoc.mockResolvedValue(existing(stored));

    const result = await loadBrokerConnection(UID);
    expect(result).toEqual({
      status: "ok",
      connection: {
        provider: "indmoney",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        keyVersion: 1,
        expiresAt: sealed.expiresAt,
        syncedAt: null,
      },
    });
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("keeps a recorded sync time", async () => {
    firestore.getDoc.mockResolvedValue(
      existing({ ...stored, syncedAt: "2026-11-01T01:00:00.000Z" }),
    );
    const result = await loadBrokerConnection(UID);
    expect(result.status === "ok" && result.connection?.syncedAt).toBe("2026-11-01T01:00:00.000Z");
  });

  it("treats a document without syncedAt as connected with no sync time", async () => {
    firestore.getDoc.mockResolvedValue(
      existing({
        uid: UID,
        provider: "indmoney",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        keyVersion: 1,
        expiresAt: sealed.expiresAt,
      }),
    );

    const result = await loadBrokerConnection(UID);
    expect(result.status === "ok" && result.connection?.syncedAt).toBeNull();
  });

  it.each([
    ["another user's uid", { ...stored, uid: "user-2" }],
    ["a different provider", { ...stored, provider: "other" }],
    ["a newer key version", { ...stored, keyVersion: 2 }],
    ["an empty ciphertext", { ...stored, ciphertext: "" }],
    ["an oversized ciphertext", { ...stored, ciphertext: "x".repeat(8193) }],
    ["an oversized iv", { ...stored, iv: "x".repeat(65) }],
    ["an unparseable expiry", { ...stored, expiresAt: "tomorrow" }],
    ["an unparseable sync time", { ...stored, syncedAt: "recently" }],
  ])("treats %s as not connected", async (_label, data) => {
    firestore.getDoc.mockResolvedValue(existing(data));
    await expect(loadBrokerConnection(UID)).resolves.toEqual({ status: "ok", connection: null });
  });

  it("reports a failed read instead of pretending the account is unlinked", async () => {
    firestore.getDoc.mockRejectedValue(new Error("permission denied"));
    await expect(loadBrokerConnection(UID)).resolves.toEqual({
      status: "error",
      error: "permission denied",
    });
  });

  it("uses a broker-specific fallback when the read fails without a message", async () => {
    firestore.getDoc.mockRejectedValue("unavailable");
    await expect(loadBrokerConnection(UID)).resolves.toEqual({
      status: "error",
      error: "Could not read the broker connection.",
    });
  });
});

describe("saveBrokerConnection", () => {
  it("writes only sealed material to the caller's private document", async () => {
    firestore.setDoc.mockResolvedValue(undefined);

    await expect(saveBrokerConnection(UID, sealed)).resolves.toBeNull();
    expect(firestore.doc).toHaveBeenCalledWith({ name: "test-db" }, "users", UID, "private", "brokerConnection");
    expect(firestore.setDoc).toHaveBeenCalledWith(
      { path: DOC_PATH },
      {
        uid: UID,
        provider: "indmoney",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        keyVersion: 1,
        expiresAt: sealed.expiresAt,
        syncedAt: null,
        updatedAt: "__serverTimestamp__",
      },
    );
  });

  it("refuses malformed material before writing", async () => {
    await expect(saveBrokerConnection(UID, { ...sealed, ciphertext: "" })).resolves.toMatch(/invalid/i);
    await expect(saveBrokerConnection(UID, { ...sealed, expiresAt: "tomorrow" })).resolves.toMatch(/invalid/i);
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it("returns the Firestore error instead of claiming success", async () => {
    firestore.setDoc.mockRejectedValue(new Error("Missing or insufficient permissions"));
    await expect(saveBrokerConnection(UID, sealed)).resolves.toBe("Missing or insufficient permissions");
  });
});

describe("markBrokerSynced and clearBrokerConnection", () => {
  it("updates the existing document rather than creating one", async () => {
    firestore.updateDoc.mockResolvedValue(undefined);

    await expect(markBrokerSynced(UID, "2026-11-01T01:00:00.000Z")).resolves.toBeNull();
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      { path: DOC_PATH },
      { syncedAt: "2026-11-01T01:00:00.000Z", updatedAt: "__serverTimestamp__" },
    );
    expect(firestore.setDoc).not.toHaveBeenCalled();
  });

  it("rejects an unparseable sync time", async () => {
    await expect(markBrokerSynced(UID, "just now")).resolves.toMatch(/timestamp/i);
    expect(firestore.updateDoc).not.toHaveBeenCalled();
  });

  it("deletes exactly the caller's connection document", async () => {
    firestore.deleteDoc.mockResolvedValue(undefined);

    await expect(clearBrokerConnection(UID)).resolves.toBeNull();
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ path: DOC_PATH });
  });

  it("reports a failed delete", async () => {
    firestore.deleteDoc.mockRejectedValue(new Error("offline"));
    await expect(clearBrokerConnection(UID)).resolves.toBe("offline");
  });
});
