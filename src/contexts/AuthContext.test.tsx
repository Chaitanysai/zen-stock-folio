import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/types";

/**
 * Auth-state handling tests against the provider-neutral AuthContext:
 * loading lifecycle, sign-out/account-switch cache wiping, and the
 * unverified-address gate (which replicates the server-side behaviour
 * Supabase enforces and Firebase does not).
 */

const changeCallbacks: Array<(user: AuthUser | null) => void> = [];
let currentUser: AuthUser | null = null;

const providerMock = vi.hoisted(() => ({
  name: "firebase" as const,
  isConfigured: true,
  getCurrentUser: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
  resendConfirmationEmail: vi.fn(),
  resetPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  activeAuthProviderName: "firebase",
  isAuthProviderConfigured: () => true,
  getAuthProvider: async () => providerMock,
}));

vi.mock("@/hooks/usePortfolioSync", () => ({
  clearLocalPortfolioCache: vi.fn(),
}));

import { clearLocalPortfolioCache } from "@/hooks/usePortfolioSync";
import { AuthProvider, useAuth } from "./AuthContext";

const user = (id: string, emailVerified = true): AuthUser => ({
  id,
  email: `${id}@example.com`,
  displayName: null,
  emailVerified,
});

let captured: ReturnType<typeof useAuth> | undefined;
const Probe = ({ children }: { children?: ReactNode }) => {
  captured = useAuth();
  return children ?? null;
};

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

const emit = (next: AuthUser | null) =>
  act(async () => {
    currentUser = next;
    changeCallbacks.forEach((cb) => cb(next));
  });

const makeProvider = () => {
  providerMock.getCurrentUser.mockImplementation(async () => currentUser);
  providerMock.onAuthStateChanged.mockImplementation((cb: (user: AuthUser | null) => void) => {
    changeCallbacks.push(cb);
    return () => {};
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  changeCallbacks.length = 0;
  currentUser = null;
  makeProvider();
  window.localStorage.clear();
});

describe("AuthContext auth-state handling", () => {
  it("starts loading, then exposes the current user", async () => {
    currentUser = user("user-a");
    renderAuth();

    expect(captured?.loading).toBe(true);
    await waitFor(() => expect(captured?.loading).toBe(false));
    expect(captured?.user).toMatchObject({ id: "user-a" });
    expect(captured?.isAuthenticated).toBe(true);
    expect(captured?.session).toEqual({ userId: "user-a", provider: "firebase" });
    expect(captured?.isConfigured).toBe(true);
  });

  it("exposes a signed-out state when no user exists", async () => {
    renderAuth();
    await waitFor(() => expect(captured?.loading).toBe(false));
    expect(captured?.user).toBeNull();
    expect(captured?.isAuthenticated).toBe(false);
    expect(captured?.session).toBeNull();
  });

  it("wipes the local portfolio cache when the account changes", async () => {
    currentUser = user("user-a");
    renderAuth();
    await waitFor(() => expect(captured?.user?.id).toBe("user-a"));
    expect(clearLocalPortfolioCache).not.toHaveBeenCalled();

    await emit(user("user-b"));

    expect(clearLocalPortfolioCache).toHaveBeenCalledTimes(1);
    expect(captured?.user).toMatchObject({ id: "user-b" });
  });

  it("wipes the local portfolio cache on sign-out", async () => {
    currentUser = user("user-a");
    renderAuth();
    await waitFor(() => expect(captured?.user?.id).toBe("user-a"));

    await emit(null);

    expect(clearLocalPortfolioCache).toHaveBeenCalledTimes(1);
    expect(captured?.isAuthenticated).toBe(false);
  });

  it("treats an unverified address as signed out (GoTrue parity gate)", async () => {
    renderAuth();
    await waitFor(() => expect(captured?.loading).toBe(false));

    await emit(user("user-a", false));

    expect(captured?.user).toBeNull();
    expect(captured?.isAuthenticated).toBe(false);
    expect(captured?.session).toBeNull();
  });

  it("clears the cache when a verified session is replaced by an unverified one", async () => {
    currentUser = user("user-a");
    renderAuth();
    await waitFor(() => expect(captured?.user?.id).toBe("user-a"));

    await emit(user("user-b", false));

    expect(clearLocalPortfolioCache).toHaveBeenCalledTimes(1);
    expect(captured?.user).toBeNull();
  });

  it("signOut delegates to the provider and always clears the cache", async () => {
    currentUser = user("user-a");
    renderAuth();
    await waitFor(() => expect(captured?.user?.id).toBe("user-a"));

    providerMock.signOut.mockResolvedValueOnce(undefined);
    await act(async () => {
      await captured?.signOut();
    });

    expect(providerMock.signOut).toHaveBeenCalled();
    expect(clearLocalPortfolioCache).toHaveBeenCalled();
  });

  it("signIn throws the provider's error string", async () => {
    renderAuth();
    await waitFor(() => expect(captured?.loading).toBe(false));

    providerMock.signInWithEmail.mockResolvedValueOnce("Invalid login credentials");
    await expect(captured?.signIn("a@x.com", "bad")).rejects.toThrow("Invalid login credentials");
  });

  it("unsubscribes from the provider on unmount", async () => {
    const unsubscribe = vi.fn();
    providerMock.onAuthStateChanged.mockImplementation((cb: (user: AuthUser | null) => void) => {
      changeCallbacks.push(cb);
      return unsubscribe;
    });

    const { unmount } = renderAuth();
    await waitFor(() => expect(captured?.loading).toBe(false));
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
