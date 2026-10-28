import type {
  BrokerCategoryId,
  BrokerProviderCapabilities,
  BrokerProviderId,
} from "./contracts";

const ALL_CATEGORIES: BrokerCategoryId[] = ["holdings", "positions", "orders", "trades"];

const data = (supported: Partial<Record<BrokerCategoryId, boolean>> = {}) =>
  Object.fromEntries(
    ALL_CATEGORIES.map((id) => [id, supported[id] ?? true]),
  ) as Record<BrokerCategoryId, boolean>;

/**
 * Static, documented capability descriptions.
 *
 * Enablement is computed server-side from configuration; these objects say what
 * the provider *documents*, not what this deployment can currently do.
 */
export const BROKER_PROVIDERS: Record<BrokerProviderId, BrokerProviderCapabilities> = {
  zerodha: {
    id: "zerodha",
    name: "Zerodha",
    authProduct: "Kite Connect",
    docsUrl: "https://kite.trade/docs/connect/v3/user/",
    setupUrl: "https://developers.kite.trade/",
    // Kite Connect has no keys-only mode: an access token only exists after the
    // browser login that returns a request_token. "Use my API keys" therefore
    // means the user's own Kite app credentials, followed by the official login.
    methods: { oauth: true, apiKeys: false },
    sharedMultiUser: "unavailable",
    sharedMultiUserReason:
      "A Kite Connect app is tied to one client ID and its own subscription. Shared multi-user access needs Zerodha approval and is not enabled.",
    data: data(),
    history: {
      holdings: "snapshot",
      positions: "snapshot",
      orders: "current_day",
      trades: "current_day",
    },
    historyNote:
      "Kite's order and trade endpoints return the current day's records. They are not an all-time tradebook.",
    tokenLifetime:
      "Access tokens expire at 06:00 IST the next day. Reauthorization needs a fresh browser login; there is no refresh token.",
    reauthNote:
      "Use Reauthorize to open the Kite login page again with the stored app credentials.",
    rateLimitNote:
      "Kite's published rate limits were not stated on the pages reviewed. Requests are issued sequentially with bounded retries.",
    subscriptionNote:
      "Kite Connect is a paid product (₹500/month per API key per Zerodha's current support article). Each user needs their own app and subscription.",
    scheduledSync: false,
    requiredEnv: ["BROKER_STORE", "BROKER_CREDENTIALS_KEYS", "BROKER_PUBLIC_ORIGIN"],
    limitations: [
      "One Kite Connect app serves one client ID; shared multi-user mode is disabled.",
      "Order and trade data covers the current day only.",
      "The Kite app's registered redirect URL must point to this deployment's callback.",
      "The API secret is exchanged server-side and never reaches the browser.",
    ],
  },
  groww: {
    id: "groww",
    name: "Groww",
    authProduct: "Groww Trading API",
    docsUrl: "https://groww.in/trade-api/docs/curl",
    setupUrl: "https://groww.in/trade-api/docs/curl",
    methods: { oauth: false, apiKeys: true },
    sharedMultiUser: "not_applicable",
    sharedMultiUserReason:
      "Each user creates their own API key in Groww; there is no shared third-party app registration in the documented flow.",
    data: data(),
    history: {
      holdings: "snapshot",
      positions: "snapshot",
      orders: "current_day",
      trades: "current_day",
    },
    historyNote:
      "The documented order list has no date-range parameters, and trades are fetched per order. Treat results as current-day coverage, not an all-time tradebook.",
    tokenLifetime:
      "Access tokens expire daily at 06:00 IST. The API key must be approved on Groww's Cloud API Keys page, and approval may need to be repeated daily.",
    reauthNote:
      "Approve the key on Groww's Cloud API Keys page, then use Reauthorize to mint a new token with the stored key and secret.",
    rateLimitNote:
      "Documented limits: authentication 5/s, orders 10/s, live data 10/s, non-trading 20/s and 500/min. The token endpoint allows 150 requests per 24 hours.",
    subscriptionNote:
      "Groww requires an active Trading API subscription (₹499 + taxes per month per its pricing page). Verify current terms before use.",
    scheduledSync: false,
    requiredEnv: ["BROKER_STORE", "BROKER_CREDENTIALS_KEYS", "BROKER_PUBLIC_ORIGIN"],
    limitations: [
      "There is no bulk executed-trade endpoint; trades are fetched per order and capped per sync.",
      "Order list pages hold at most 100 records; trade list pages hold at most 50.",
      "Daily key approval on Groww may be required before a token can be minted.",
      "Order and trade coverage is current-day only.",
    ],
  },
};

export const BROKER_PROVIDER_LIST: BrokerProviderCapabilities[] = [
  BROKER_PROVIDERS.zerodha,
  BROKER_PROVIDERS.groww,
];

export const isBrokerProviderId = (value: string): value is BrokerProviderId =>
  value === "zerodha" || value === "groww";
