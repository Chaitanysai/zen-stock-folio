import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the Firebase adapter. Error codes must translate to the
 * message strings Login.tsx friendlyError() matches on, and the
 * verification/unconfirmed-email semantics must mirror the Supabase
 * behaviour the UI was built around.
 */

const firebaseAuthMock = vi.hoisted(() => ({
  createUserWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: class {
    setCustomParameters() {}
  },
}));

vi.mock("firebase/auth", () => firebaseAuthMock);

const fakeAuth = { currentUser: null as unknown };
vi.mock("@/lib/firebase/auth", () => ({
  getFirebaseAuth: () => fakeAuth,
}));
vi.mock("@/lib/firebase/app", () => ({
  isFirebaseConfigured: true,
}));

import {
  UNCONFIRMED_EMAIL_MESSAGE,
  firebaseAuthProvider,
  mapFirebaseUser,
  messageForFirebaseError,
} from "./firebaseAuthProvider";

const firebaseUser = (overrides: Partial<{ uid: string; email: string; emailVerified: boolean; displayName: string }> = {}) =>
  ({
    uid: "fb-uid-1",
    email: "a@example.com",
    emailVerified: true,
    displayName: "Alice",
    ...overrides,
  }) as never;

const err = (code: string) => ({ code });

describe("messageForFirebaseError", () => {
  it("maps provider error codes to Login-compatible strings", () => {
    expect(messageForFirebaseError(err("auth/invalid-credential"))).toBe("Invalid login credentials");
    expect(messageForFirebaseError(err("auth/user-not-found"))).toBe("Invalid login credentials");
    expect(messageForFirebaseError(err("auth/email-already-in-use"))).toBe("User already registered");
    expect(messageForFirebaseError(err("auth/account-exists-with-different-credential"))).toMatch(
      /already registered/i,
    );
    expect(messageForFirebaseError(err("auth/weak-password"))).toMatch(/^Password should be at least/);
    expect(messageForFirebaseError(err("auth/invalid-email"))).toMatch(/email address is invalid/);
    expect(messageForFirebaseError(err("auth/network-request-failed"))).toMatch(/^Network error/);
    expect(messageForFirebaseError(err("auth/too-many-requests"))).toMatch(/Too many attempts/);
    expect(messageForFirebaseError(err("auth/popup-blocked"))).toMatch(/blocked the sign-in popup/);
    expect(messageForFirebaseError(err("auth/user-disabled"))).toMatch(/disabled/);
  });

  it("falls back to the raw message or a generic string", () => {
    expect(messageForFirebaseError(new Error("weird"))).toBe("weird");
    expect(messageForFirebaseError({ code: "auth/unknown" })).toMatch(/Something went wrong/);
  });
});

describe("mapFirebaseUser", () => {
  it("maps uid/email/displayName/emailVerified", () => {
    expect(mapFirebaseUser(firebaseUser())).toEqual({
      id: "fb-uid-1",
      email: "a@example.com",
      displayName: "Alice",
      emailVerified: true,
    });
    expect(mapFirebaseUser(null)).toBeNull();
  });
});

describe("firebaseAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeAuth.currentUser = null;
  });

  it("signInWithEmail succeeds for a verified user", async () => {
    firebaseAuthMock.signInWithEmailAndPassword.mockResolvedValueOnce({ user: firebaseUser() });
    await expect(firebaseAuthProvider.signInWithEmail("a@x.com", "good")).resolves.toBeNull();
  });

  it("signInWithEmail reports unconfirmed email for an unverified user", async () => {
    firebaseAuthMock.signInWithEmailAndPassword.mockResolvedValueOnce({
      user: firebaseUser({ emailVerified: false }),
    });
    const message = await firebaseAuthProvider.signInWithEmail("a@x.com", "good");
    expect(message).toBe(UNCONFIRMED_EMAIL_MESSAGE);
    // Login.tsx routes messages containing "not confirmed" to the
    // confirm-first guidance, so the phrasing must keep that substring.
    expect(message?.toLowerCase()).toContain("not confirmed");
  });

  it("signInWithEmail maps provider errors to strings", async () => {
    firebaseAuthMock.signInWithEmailAndPassword.mockRejectedValueOnce(err("auth/invalid-credential"));
    await expect(firebaseAuthProvider.signInWithEmail("a@x.com", "bad")).resolves.toBe(
      "Invalid login credentials",
    );
  });

  it("signUpWithEmail sends the verification email and returns CONFIRM_EMAIL", async () => {
    const user = firebaseUser({ emailVerified: false });
    firebaseAuthMock.createUserWithEmailAndPassword.mockResolvedValueOnce({ user });
    firebaseAuthMock.sendEmailVerification.mockResolvedValueOnce(undefined);

    await expect(firebaseAuthProvider.signUpWithEmail("a@x.com", "password1")).resolves.toBe(
      "CONFIRM_EMAIL",
    );
    expect(firebaseAuthMock.sendEmailVerification).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ url: expect.stringContaining("/login") }),
    );
  });

  it("signUpWithEmail maps already-registered errors", async () => {
    firebaseAuthMock.createUserWithEmailAndPassword.mockRejectedValueOnce(
      err("auth/email-already-in-use"),
    );
    await expect(firebaseAuthProvider.signUpWithEmail("a@x.com", "password1")).resolves.toBe(
      "User already registered",
    );
  });

  it("resendConfirmationEmail needs a pending unverified user on this device", async () => {
    await expect(firebaseAuthProvider.resendConfirmationEmail("a@x.com")).resolves.toMatch(
      /not confirmed/i,
    );

    const user = firebaseUser({ emailVerified: false });
    fakeAuth.currentUser = user;
    firebaseAuthMock.sendEmailVerification.mockResolvedValueOnce(undefined);
    await expect(firebaseAuthProvider.resendConfirmationEmail("a@x.com")).resolves.toBeNull();

    fakeAuth.currentUser = firebaseUser({ emailVerified: true });
    await expect(firebaseAuthProvider.resendConfirmationEmail("a@x.com")).resolves.toMatch(
      /not confirmed/i,
    );
  });

  it("still reports CONFIRM_EMAIL when the verification mail itself fails", async () => {
    const user = firebaseUser({ emailVerified: false });
    firebaseAuthMock.createUserWithEmailAndPassword.mockResolvedValueOnce({ user });
    firebaseAuthMock.sendEmailVerification.mockRejectedValueOnce(err("auth/too-many-requests"));

    // The account exists; telling the user sign-up failed would send them into
    // a "already registered" loop.
    await expect(firebaseAuthProvider.signUpWithEmail("a@x.com", "password1")).resolves.toBe(
      "CONFIRM_EMAIL",
    );
  });

  it("resetPassword resolves silently for unknown addresses (no account enumeration)", async () => {
    firebaseAuthMock.sendPasswordResetEmail.mockRejectedValueOnce(err("auth/user-not-found"));
    await expect(firebaseAuthProvider.resetPassword("nobody@x.com")).resolves.toBeUndefined();
    expect(firebaseAuthMock.sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.anything(),
      "nobody@x.com",
      expect.objectContaining({ url: expect.stringContaining("/login") }),
    );
  });

  it("resetPassword throws Error(message) for other failures", async () => {
    firebaseAuthMock.sendPasswordResetEmail.mockRejectedValueOnce(err("auth/network-request-failed"));
    await expect(firebaseAuthProvider.resetPassword("a@x.com")).rejects.toThrow(/Network error/);
  });

  it("signInWithGoogle swallows a user-closed popup", async () => {
    firebaseAuthMock.signInWithPopup.mockRejectedValueOnce(err("auth/popup-closed-by-user"));
    await expect(firebaseAuthProvider.signInWithGoogle()).resolves.toBeUndefined();
  });

  it("signInWithGoogle turns other failures into friendly, catchable errors", async () => {
    firebaseAuthMock.signInWithPopup.mockRejectedValueOnce(
      err("auth/account-exists-with-different-credential"),
    );
    await expect(firebaseAuthProvider.signInWithGoogle()).rejects.toThrow(/already registered/i);

    firebaseAuthMock.signInWithPopup.mockRejectedValueOnce(err("auth/unauthorized-domain"));
    await expect(firebaseAuthProvider.signInWithGoogle()).rejects.toThrow(/not available from this domain/i);
  });

  it("signOut delegates to firebase", async () => {
    firebaseAuthMock.signOut.mockResolvedValueOnce(undefined);
    await firebaseAuthProvider.signOut();
    expect(firebaseAuthMock.signOut).toHaveBeenCalled();
  });

  it("onAuthStateChanged wires the neutral mapping", () => {
    let captured: ((user: never) => void) | undefined;
    firebaseAuthMock.onAuthStateChanged.mockImplementation((auth, cb) => {
      captured = cb;
      return () => {};
    });

    const seen: (unknown)[] = [];
    const stop = firebaseAuthProvider.onAuthStateChanged((user) => seen.push(user));
    captured?.(firebaseUser() as never);
    expect(seen[0]).toMatchObject({ id: "fb-uid-1", emailVerified: true });
    stop();
  });
});
