import type { PortfolioDataStore } from "./types";

/**
 * Portfolio/profile storage backend.
 *
 * There is exactly one: Firestore. The environment-variable provider switch
 * (VITE_DATA_PROVIDER) was removed together with the Supabase adapter, so no
 * value of any variable can select a different backend or silently fall back to
 * one. A misconfigured build fails at build time (see config/firebaseConfig.ts).
 *
 * The adapter is imported lazily so the Firestore SDK stays in its own chunk and
 * tests can mock the module wholesale.
 */

export type { DataProviderName, PortfolioDataStore } from "./types";

export const activeDataProviderName = "firestore" as const;

let storePromise: Promise<PortfolioDataStore> | null = null;

export const getPortfolioDataStore = (): Promise<PortfolioDataStore> => {
  if (!storePromise) {
    storePromise = import("./firestorePortfolioStore").then((m) => m.firestorePortfolioStore);
  }
  return storePromise;
};
