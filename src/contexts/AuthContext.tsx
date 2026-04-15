import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthSession,
  fetchCurrentUser,
  getStoredSession,
  isSupabaseConfigured,
  refreshSession,
  signInWithPassword,
  signOut,
  storeSession,
} from "@/lib/supabaseAuth";

interface AuthContextValue {
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  const applySession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession);
    storeSession(nextSession);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!isConfigured) {
        setIsLoading(false);
        return;
      }

      const stored = getStoredSession();
      if (!stored) {
        setIsLoading(false);
        return;
      }

      try {
        const expiresSoon = stored.expiresAt <= Date.now() + 60_000;
        const nextSession = expiresSoon
          ? await refreshSession(stored.refreshToken)
          : {
              ...stored,
              user: await fetchCurrentUser(stored.accessToken),
            };

        if (!cancelled) {
          applySession(nextSession);
        }
      } catch {
        if (!cancelled) {
          applySession(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applySession, isConfigured]);

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      const nextSession = await signInWithPassword(email, password);
      applySession(nextSession);
    },
    [applySession],
  );

  const handleSignOut = useCallback(async () => {
    if (session) {
      await signOut(session.accessToken);
    }
    applySession(null);
  }, [applySession, session]);

  const value = useMemo(
    () => ({
      session,
      isAuthenticated: !!session,
      isLoading,
      isConfigured,
      signIn: handleSignIn,
      signOutUser: handleSignOut,
    }),
    [handleSignIn, handleSignOut, isConfigured, isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
