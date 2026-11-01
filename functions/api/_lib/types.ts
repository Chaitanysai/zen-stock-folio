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
  /**
   * Comma-separated Firebase uids allowed to see /api/health. Authenticated is
   * not privileged: the payload names configured integrations. Empty or unset
   * disables the endpoint entirely (fail closed).
   */
  HEALTH_OPERATOR_UIDS?: string;
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
  /** Firebase project id for Firestore REST calls made with the caller's token. */
  FIREBASE_PROJECT_ID?: string;
  /** INDstocks API origin. Unset means broker sync is disabled (503). */
  INDSTOCKS_BASE_URL?: string;
  /** INDstocks API key. Server-side only; never exposed to the browser. */
  INDSTOCKS_API_KEY?: string;
  /** Base64-encoded 32-byte AES-256 key for broker tokens. */
  BROKER_TOKEN_KEY?: string;
  /**
   * EOD price-cache KV binding (resource creation awaiting approval).
   * When absent the endpoints degrade gracefully to no-cache mode.
   */
  PRICE_CACHE?: KVNamespace;
  /**
   * Broker connection store (server-only). Holds connection metadata, one-time
   * authorization state and AES-GCM credential envelopes. When absent every
   * broker endpoint fails closed with `setup_required`.
   */
  BROKER_STORE?: KVNamespace;
  /**
   * JSON map of key version -> base64 32-byte AES-GCM key, e.g.
   * `{"1":"<base64>"}`. Server-only; never exposed to the browser.
   */
  BROKER_CREDENTIALS_KEYS?: string;
  /** Version used for new envelopes; defaults to the highest listed version. */
  BROKER_CREDENTIALS_ACTIVE_KEY_VERSION?: string;
  /**
   * Public HTTPS origin used to build callback URLs and post-callback
   * redirects, e.g. `https://zenfolio-7jd.pages.dev`. Never user-supplied.
   */
  BROKER_PUBLIC_ORIGIN?: string;
  /** `"false"` disables the provider; absent means enabled when storage is ready. */
  BROKER_ZERODHA_ENABLED?: string;
  BROKER_GROWW_ENABLED?: string;
  /**
   * Shared-app Zerodha mode stays disabled unless written multi-user approval
   * exists AND this is explicitly `"true"`. Even then it remains
   * approval-gated and is not implemented in this release.
   */
  BROKER_ZERODHA_SHARED_APP?: string;
  /** Optional shared Kite app credentials. Only relevant to the gated mode. */
  ZERODHA_API_KEY?: string;
  ZERODHA_API_SECRET?: string;
}

/** Minimal shape of a Pages Function handler (runtime-compatible). */
export type PagesHandler = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[] | undefined>;
}) => Promise<Response>;
