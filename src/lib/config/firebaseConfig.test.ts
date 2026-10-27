import { describe, expect, it } from "vitest";
import {
  assertFirebaseConfig,
  FirebaseConfigError,
  REQUIRED_FIREBASE_KEYS,
} from "./firebaseConfig";

const VALID = {
  apiKey: "key",
  projectId: "project",
  appId: "app",
};

const expectRejection = (raw: Parameters<typeof assertFirebaseConfig>[0]) => {
  try {
    assertFirebaseConfig(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(FirebaseConfigError);
    return (error as Error).message;
  }
  throw new Error("expected assertFirebaseConfig to throw");
};

describe("assertFirebaseConfig", () => {
  it("accepts a complete Firebase configuration", () => {
    expect(() => assertFirebaseConfig(VALID)).not.toThrow();
  });

  it("accepts the explicit firebase/firestore values", () => {
    expect(() =>
      assertFirebaseConfig({ ...VALID, authProvider: "firebase", dataProvider: "firestore" }),
    ).not.toThrow();
  });

  it("names every missing key without printing a value", () => {
    const message = expectRejection({ ...VALID, apiKey: "", appId: "   " });
    expect(message).toContain("VITE_FIREBASE_API_KEY");
    expect(message).toContain("VITE_FIREBASE_APP_ID");
    expect(message).not.toContain("VITE_FIREBASE_PROJECT_ID");
  });

  it("rejects an empty configuration", () => {
    const message = expectRejection({});
    for (const key of REQUIRED_FIREBASE_KEYS) expect(message).toContain(key);
  });

  it("rejects a stale supabase auth switch instead of ignoring it", () => {
    const message = expectRejection({ ...VALID, authProvider: "supabase" });
    expect(message).toMatch(/no longer supported/i);
    expect(message).toContain("VITE_AUTH_PROVIDER");
  });

  it("rejects a stale supabase data switch instead of ignoring it", () => {
    const message = expectRejection({ ...VALID, dataProvider: "supabase" });
    expect(message).toMatch(/no longer supported/i);
    expect(message).toContain("VITE_DATA_PROVIDER");
  });

  it("rejects a mistyped data switch (firebase is not a data provider)", () => {
    const message = expectRejection({ ...VALID, dataProvider: "firebase" });
    expect(message).toContain("VITE_DATA_PROVIDER");
  });
});
