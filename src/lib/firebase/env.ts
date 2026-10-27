/**
 * Firebase environment configuration — read-only, SDK-free.
 *
 * Never throws at import time: AuthContext exposes the configured flag so Login
 * can show a recoverable inline message instead of crashing into a blank screen.
 *
 * The values below are browser-public by design (Firebase web apps ship the
 * apiKey to every client; access is controlled by Auth + Security Rules, not
 * by key secrecy).
 */
const firebaseEnv = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/**
 * Reads the environment at call time. The boolean below is the same check
 * snapshotted at module load; callers that must observe a re-stubbed
 * environment (tests, diagnostics) use this function instead.
 */
export const checkFirebaseConfigured = (): boolean =>
  Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );

export const isFirebaseConfigured = checkFirebaseConfigured();

export default firebaseEnv;
