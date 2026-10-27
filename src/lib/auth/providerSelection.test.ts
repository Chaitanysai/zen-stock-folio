import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * There is one authentication backend. These tests exist to make that a
 * guarantee rather than a convention: no environment value can select another
 * provider, and the configured gate is still keyed on the Firebase web config.
 */

vi.mock("./firebaseAuthProvider", () => ({
  firebaseAuthProvider: { name: "firebase" },
}));

const loadSelection = async () => {
  vi.resetModules();
  return import("./index");
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("auth backend", () => {
  it("is Firebase for every value of the legacy switch", async () => {
    for (const value of ["", "firebase", "supabase", "Supabase", "anything"]) {
      vi.stubEnv("VITE_AUTH_PROVIDER", value);
      const { activeAuthProviderName } = await loadSelection();
      expect(activeAuthProviderName).toBe("firebase");
      vi.unstubAllEnvs();
    }
  });

  it("resolves the Firebase adapter", async () => {
    const { getAuthProvider } = await loadSelection();
    await expect(getAuthProvider()).resolves.toMatchObject({ name: "firebase" });
  });

  it("is not configured until all three Firebase web values are present", async () => {
    const { isAuthProviderConfigured } = await loadSelection();

    vi.stubEnv("VITE_FIREBASE_API_KEY", "key");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "project");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "");
    expect(isAuthProviderConfigured()).toBe(false);

    vi.stubEnv("VITE_FIREBASE_APP_ID", "app");
    expect(isAuthProviderConfigured()).toBe(true);
  });
});
