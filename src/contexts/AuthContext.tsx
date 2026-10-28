import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import {
  getAuthProvider,
  isAuthProviderConfigured,
} from "@/lib/auth";
import type { AuthSession, AuthUser } from "@/lib/auth/types";
import { clearLocalPortfolioCache } from "@/hooks/usePortfolioSync";

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  resendConfirmationEmail: (email: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isAuthProviderConfigured();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: () => void = () => {};

    /**
     * Applies a provider user to state. A user whose address is not verified
     * is treated as signed out: the Cloudflare Functions reject an unverified
     * ID token with 403, so rendering a portfolio here would show an account
     * whose every request fails. The gate mirrors that server-side rule in the
     * UI instead of relying on the first API call to reveal it.
     */
    const visibleUser = (candidate: AuthUser | null): AuthUser | null =>
      candidate && candidate.emailVerified === false ? null : candidate;

    const applyUser = (candidate: AuthUser | null, providerName: AuthSession["provider"]) => {
      const next = visibleUser(candidate);
      setUser(next);
      setSession(next ? { userId: next.id, provider: providerName } : null);
    };

    getAuthProvider().then((provider) => {
      if (cancelled) return;

      provider.getCurrentUser().then((initialUser) => {
        if (cancelled) return;
        lastUserIdRef.current = visibleUser(initialUser)?.id ?? null;
        applyUser(initialUser, provider.name);
        // A null here is ambiguous: Firebase reports `currentUser === null`
        // until it has restored the persisted session, so a signed-in user
        // would briefly read as signed out and the router would render the
        // landing page (or the login form). Only a resolved user ends loading
        // here; for null, the first onAuthStateChanged callback below is
        // authoritative and ends it.
        if (initialUser) setLoading(false);

        // Subscribed after the initial fetch, matching the original
        // getSession-then-onAuthStateChange ordering.
        unsubscribe = provider.onAuthStateChanged((nextUser) => {
          const nextUserId = visibleUser(nextUser)?.id ?? null;
          // Sign-out or account switch: drop every cached portfolio scope so
          // the next session can never render the previous account's data.
          if (lastUserIdRef.current && lastUserIdRef.current !== nextUserId) {
            clearLocalPortfolioCache();
          }
          lastUserIdRef.current = nextUserId;
          applyUser(nextUser, provider.name);
          setLoading(false);
        });
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const provider = await getAuthProvider();
    await provider.signInWithGoogle();
  };

  const signInWithEmail = async (email: string, password: string): Promise<string | null> => {
    const provider = await getAuthProvider();
    return provider.signInWithEmail(email, password);
  };

  const signUpWithEmail = async (email: string, password: string): Promise<string | null> => {
    const provider = await getAuthProvider();
    return provider.signUpWithEmail(email, password);
  };

  const resendConfirmationEmail = async (email: string): Promise<string | null> => {
    const provider = await getAuthProvider();
    return provider.resendConfirmationEmail(email);
  };

  const resetPassword = async (email: string) => {
    const provider = await getAuthProvider();
    await provider.resetPassword(email);
  };

  const signOut = async () => {
    const provider = await getAuthProvider();
    await provider.signOut();
    // Belt and braces: also clear here in case no auth event is delivered.
    clearLocalPortfolioCache();
  };

  const signIn = async (email: string, password: string) => {
    const error = await signInWithEmail(email, password);
    if (error) {
      throw new Error(error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isLoading: loading,
        isAuthenticated: !!user,
        isConfigured,
         signIn,
         signInWithGoogle,
         signInWithEmail,
         signUpWithEmail,
         resendConfirmationEmail,
         resetPassword,
         signOut,
         signOutUser: signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
