/**
 * Cloudflare Pages Functions — shared types.
 *
 * The `api/` directory stays frozen as the Vercel rollback path; everything
 * in `functions/` targets Cloudflare Pages Functions and is inert on Vercel.
 */

export interface Env {
  /** Server-side copy of the Firebase web API key (used for ID-token lookup). */
  FIREBASE_API_KEY?: string;
  /** Comma-separated origins allowed to call the API cross-origin. Same-origin SPA calls need no CORS headers. */
  ALLOWED_ORIGINS?: string;
  /** Market data providers. */
  UPSTOX_ACCESS_TOKEN?: string;
  NEWS_API_KEY?: string;
  FINNHUB_API_KEY?: string;
  /** AI providers. */
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /** Upstox ops callback: OAuth client + shared ops secret (never a user-facing route). */
  UPSTOX_API_KEY?: string;
  UPSTOX_API_SECRET?: string;
  UPSTOX_OPS_KEY?: string;
  /**
   * EOD price-cache KV binding (resource creation awaiting approval).
   * When absent the endpoints degrade gracefully to no-cache mode.
   */
  PRICE_CACHE?: KVNamespace;
}

/** Minimal shape of a Pages Function handler (runtime-compatible). */
export type PagesHandler = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}) => Promise<Response>;
