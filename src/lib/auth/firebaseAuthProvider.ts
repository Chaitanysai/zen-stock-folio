import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/app";
import type { AuthProvider, AuthUser } from "./types";

/**
 * Firebase adapter — the only AuthProvider implementation (contract in
 * ./types.ts). Firebase-specific behaviour handled here so no consumer sees it:
 *  - error codes are translated to the message strings Login.tsx matches on
 *  - signUp sends the verification email and returns "CONFIRM_EMAIL"; the
 *    unverified user is treated as signed out at the AuthContext level
 *  - sendPasswordResetEmail resolves silently for unknown addresses, keeping
 *    account-existence privacy (the user cannot probe for registered emails)
 */

export const mapFirebaseUser = (user: User | null): AuthUser | null => {
  if (!user) return null;
  return {
    id: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified,
  };
};

/** AuthContext treats emailVerified === false as signed out (GoTrue parity). */
export const UNCONFIRMED_EMAIL_MESSAGE =
  "Email not confirmed. Please confirm your email before signing in.";

export const messageForFirebaseError = (error: unknown): string => {
  const code = (error as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid login credentials";
    case "auth/email-already-in-use":
      return "User already registered";
    case "auth/account-exists-with-different-credential":
      return "User already registered with a different sign-in method. Sign in with your original method.";
    case "auth/weak-password":
      return "Password should be at least 8 characters";
    case "auth/invalid-email":
      return "The email address is invalid";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
    case "auth/unauthorized-domain":
      return "Sign-in is not available from this domain. Please try again later.";
    case "auth/user-disabled":
      return "This account has been disabled. Please contact support.";
    case "auth/requires-recent-login":
      return "Please sign in again to continue.";
    case "auth/operation-not-allowed":
      return "Sign-in is temporarily unavailable. Please try again later.";
    default:
      return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
};

const verificationRedirect = () => `${window.location.origin}/login`;

export const firebaseAuthProvider: AuthProvider = {
  name: "firebase",
  isConfigured: isFirebaseConfigured,

  async getCurrentUser() {
    return mapFirebaseUser(getFirebaseAuth().currentUser);
  },

  onAuthStateChanged(cb) {
    return firebaseOnAuthStateChanged(getFirebaseAuth(), (user) => cb(mapFirebaseUser(user)));
  },

  async signInWithGoogle() {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      // User closed the popup â€” not an error worth surfacing.
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      // Every other failure is surfaced as a friendly message; never leave the
      // caller with an unhandled rejection or a raw Firebase error string.
      throw new Error(messageForFirebaseError(error));
    }
  },

  async signInWithEmail(email, password) {
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      if (!credential.user.emailVerified) {
        return UNCONFIRMED_EMAIL_MESSAGE;
      }
      return null;
    } catch (error) {
      return messageForFirebaseError(error);
    }
  },

  async signUpWithEmail(email, password) {
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (error) {
      return messageForFirebaseError(error);
    }

    try {
      await sendEmailVerification(credential.user, { url: verificationRedirect() });
    } catch {
      // The account exists and is signed in; only the verification mail failed.
      // Report CONFIRM_EMAIL so the UI offers "resend" instead of implying the
      // sign-up itself failed (a second sign-up would be "already in use").
    }
    return "CONFIRM_EMAIL";
  },

  async resendConfirmationEmail() {
    const user = getFirebaseAuth().currentUser;
    if (!user || user.emailVerified) {
      // Firebase has no client API for resending without a session. Say so
      // plainly: the friendlyError mapping turns "not confirmed" into the
      // user-facing instruction to confirm first.
      return "Email not confirmed. Sign in once on this device to resend the confirmation email.";
    }
    try {
      await sendEmailVerification(user, { url: verificationRedirect() });
      return null;
    } catch (error) {
      return messageForFirebaseError(error);
    }
  },

  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email, { url: verificationRedirect() });
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      // Never reveal whether an account exists (same as Supabase).
      if (code === "auth/user-not-found") return;
      throw new Error(messageForFirebaseError(error));
    }
  },

  async signOut() {
    await firebaseSignOut(getFirebaseAuth());
  },
};
