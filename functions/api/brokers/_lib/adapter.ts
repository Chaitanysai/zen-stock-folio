import type {
  BrokerProviderId,
  NormalizedHolding,
  NormalizedOrder,
  NormalizedPosition,
  NormalizedTrade,
} from "../../../../src/lib/brokers/contracts.ts";
import type { Env } from "../../_lib/types.ts";
import type { CredentialBundle } from "./crypto.ts";

export interface AdapterContext {
  env: Env;
  credentials: CredentialBundle;
  now: Date;
}

export interface TokenResult {
  accessToken: string;
  tokenExpiresAt: string;
}

export interface AuthorizationStart {
  authorizationUrl: string;
  expiresAt: string;
}

export interface TradeFetchResult {
  trades: NormalizedTrade[];
  /** True when the provider could not be walked in full (cap, per-order miss). */
  partial: boolean;
  note?: string;
}

/**
 * Provider seam. Unsupported operations are omitted, never stubbed to return an
 * empty success.
 */
export interface BrokerAdapter {
  readonly id: BrokerProviderId;

  /** Keys-only providers validate and mint a token in one step. */
  validateCredentials?(
    env: Env,
    apiKey: string,
    apiSecret: string,
    now: Date,
  ): Promise<TokenResult>;

  beginAuthorization?(
    env: Env,
    credentials: CredentialBundle,
    state: string,
    now: Date,
  ): Promise<AuthorizationStart>;

  completeAuthorization?(
    env: Env,
    credentials: CredentialBundle,
    requestToken: string,
    now: Date,
  ): Promise<TokenResult>;

  refreshAccessToken?(context: AdapterContext): Promise<TokenResult>;

  testConnection(context: AdapterContext): Promise<void>;

  fetchHoldings(context: AdapterContext): Promise<NormalizedHolding[]>;
  fetchPositions(context: AdapterContext): Promise<NormalizedPosition[]>;
  fetchOrders(context: AdapterContext): Promise<NormalizedOrder[]>;
  fetchTrades(context: AdapterContext, orders: NormalizedOrder[]): Promise<TradeFetchResult>;
}
