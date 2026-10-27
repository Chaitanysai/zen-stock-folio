/**
 * Authentication surface implemented by the Firebase adapter.
 *
 * The contract is intentionally provider-neutral in shape (one adapter, one
 * consumer: AuthContext) so the auth UI never imports Firebase directly:
 *  - operations return an error STRING or null, never throw
 *    (the single exception is resetPassword, which throws Error(message) —
 *    preserved from the original AuthContext)
 *  - signUpWithEmail returns the "CONFIRM_EMAIL" sentinel when the account
 *    must confirm the email address before signing in
 *  - error strings keep the phrasing Login.tsx friendlyError() matches on
 *    ("invalid login", "already registered", "not confirmed", …)
 */
export type AuthProviderName = "firebase";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  /**
   * Firebase's own emailVerified flag. AuthContext treats `false` as signed
   * out, which mirrors the server-side gate the Cloudflare Functions enforce
   * (403 "Email verification required") so the UI can never show a portfolio
   * to an identity the API would reject.
   */
  emailVerified: boolean;
}

export interface AuthSession {
  userId: string;
  provider: AuthProviderName;
}

export interface AuthProvider {
  readonly name: AuthProviderName;
  readonly isConfigured: boolean;
  getCurrentUser(): Promise<AuthUser | null>;
  onAuthStateChanged(cb: (user: AuthUser | null) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<string | null>;
  signUpWithEmail(email: string, password: string): Promise<string | null>;
  resendConfirmationEmail(email: string): Promise<string | null>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
}
