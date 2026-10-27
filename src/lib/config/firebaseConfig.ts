/**
 * Build-time validation of the Firebase configuration.
 *
 * The app now has exactly one backend — Firebase Auth for identity, Firestore
 * for user data — so there is no provider pair to choose. Two things can still
 * produce a build that cannot work, and both must stop the build rather than
 * ship:
 *
 *  1. Missing Firebase web-app keys. A bundle without them renders a login
 *     screen that can never authenticate; the failure would surface as a
 *     confusing runtime "not configured" state instead of a broken deploy.
 *  2. A stale provider switch left in the environment. `VITE_AUTH_PROVIDER=
 *     supabase` (or `VITE_DATA_PROVIDER=supabase`) no longer selects anything,
 *     but silently ignoring it would let an operator believe a rollback build
 *     exists. Naming it a build error keeps the single-backend guarantee
 *     honest: there is no rollback build any more, only this one.
 *
 * Only key NAMES are ever reported — never values.
 */

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

export interface RawFirebaseEnv {
  apiKey?: string;
  projectId?: string;
  appId?: string;
  /** Legacy switches, read only to reject stale configurations. */
  authProvider?: string;
  dataProvider?: string;
}

/** Keys the browser bundle cannot function without (mirrors isFirebaseConfigured). */
export const REQUIRED_FIREBASE_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const isBlank = (value: string | undefined): boolean => !value || !value.trim();

/**
 * Throws on a configuration this build cannot serve. Called from vite.config.ts,
 * where throwing is the correct failure mode: the deploy stops.
 */
export const assertFirebaseConfig = (raw: RawFirebaseEnv): void => {
  const authProvider = (raw.authProvider ?? "").trim();
  if (authProvider && authProvider !== "firebase") {
    throw new FirebaseConfigError(
      `VITE_AUTH_PROVIDER="${authProvider}" is no longer supported. This build has a single ` +
        `authentication backend (Firebase). Remove the variable instead of selecting a provider.`,
    );
  }

  const dataProvider = (raw.dataProvider ?? "").trim();
  if (dataProvider && dataProvider !== "firestore") {
    throw new FirebaseConfigError(
      `VITE_DATA_PROVIDER="${dataProvider}" is no longer supported. This build stores user data ` +
        `in Firestore only. Remove the variable instead of selecting a provider.`,
    );
  }

  const missing: string[] = [];
  if (isBlank(raw.apiKey)) missing.push("VITE_FIREBASE_API_KEY");
  if (isBlank(raw.projectId)) missing.push("VITE_FIREBASE_PROJECT_ID");
  if (isBlank(raw.appId)) missing.push("VITE_FIREBASE_APP_ID");

  if (missing.length > 0) {
    throw new FirebaseConfigError(
      `Missing Firebase configuration: ${missing.join(", ")}. Copy .env.example to .env.local ` +
        `and fill in the values from Firebase console -> Project settings -> Your apps. ` +
        `A build without them would ship a login screen that can never authenticate.`,
    );
  }
};
