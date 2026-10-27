import { checkFirebaseConfigured } from "@/lib/firebase/env";
import type { AuthProvider, AuthProviderName } from "./types";

/**
 * Authentication backend.
 *
 * There is exactly one: Firebase Auth. The environment-variable provider switch
 * (VITE_AUTH_PROVIDER) was removed together with the Supabase adapter, so no
 * value of any variable can select a different backend or silently fall back to
 * one. A misconfigured build fails at build time (see config/firebaseConfig.ts)
 * instead of degrading at runtime.
 */

export type { AuthProvider, AuthProviderName, AuthSession, AuthUser } from "./types";

export const activeAuthProviderName: AuthProviderName = "firebase";

/** Sync, SDK-free configured check used by AuthContext before rendering auth UI. */
export const isAuthProviderConfigured = (): boolean => checkFirebaseConfigured();

let providerPromise: Promise<AuthProvider> | null = null;

export const getAuthProvider = (): Promise<AuthProvider> => {
  if (!providerPromise) {
    // Lazy import keeps the Firebase SDK in its own chunk: only the auth screen
    // needs it, and the adapter is also mocked wholesale in tests.
    providerPromise = import("./firebaseAuthProvider").then((m) => m.firebaseAuthProvider);
  }
  return providerPromise;
};
