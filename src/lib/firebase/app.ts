import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import firebaseEnv, { isFirebaseConfigured } from "./env";

/**
 * Lazily-initialised Firebase app singleton.
 *
 * When the Firebase env vars are absent the app is initialised with placeholder
 * values — the SDK never touches the network until an auth/firestore call is
 * made. Builds without real values are rejected by config/firebaseConfig.ts, so
 * this placeholder path only exists for tests and local probes.
 */
export const getFirebaseApp = (): FirebaseApp =>
  getApps()[0] ??
  initializeApp(
    isFirebaseConfigured
      ? firebaseEnv
      : {
          apiKey: "placeholder-api-key",
          authDomain: "placeholder.firebaseapp.com",
          projectId: "placeholder-project",
          storageBucket: "placeholder.appspot.com",
          messagingSenderId: "0",
          appId: "placeholder-app-id",
        },
  );

export { isFirebaseConfigured };
