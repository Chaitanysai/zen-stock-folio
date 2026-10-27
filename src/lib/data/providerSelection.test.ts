import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * There is one storage backend. These tests make that a guarantee: no
 * environment value can select another adapter, and the only adapter reachable
 * from the data layer is Firestore.
 */

vi.mock("./firestorePortfolioStore", () => ({
  firestorePortfolioStore: { name: "firestore" },
}));

const loadSelection = async () => {
  vi.resetModules();
  return import("./index");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("data backend", () => {
  it("is Firestore for every value of the legacy switch", async () => {
    for (const value of ["", "firestore", "supabase", "Firestore", "anything"]) {
      vi.stubEnv("VITE_DATA_PROVIDER", value);
      const { activeDataProviderName } = await loadSelection();
      expect(activeDataProviderName).toBe("firestore");
      vi.unstubAllEnvs();
    }
  });

  it("resolves the Firestore adapter", async () => {
    const { getPortfolioDataStore } = await loadSelection();
    await expect(getPortfolioDataStore()).resolves.toMatchObject({ name: "firestore" });
  });
});
