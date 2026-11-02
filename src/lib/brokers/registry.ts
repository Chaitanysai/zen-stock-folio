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
      "ZenFolio connects through your own Kite Connect app. One app covers one client ID and needs its own subscription, so it cannot be shared between ZenFolio accounts.",
    data: data(),
    history: {
      holdings: "snapshot",
      positions: "snapshot",
      orders: "current_day",
      trades: "current_day",
    },
    historyNote:
      "Zerodha returns today's orders and trades only. Anything older has to come from contract notes or statements.",
    tokenLifetime:
      "Access tokens expire at 06:00 IST the next day. Kite Connect has no refresh token, so reconnecting always means signing in to Zerodha again.",
    reauthNote:
      "Choose Reauthorize to reopen the Zerodha login page with the saved app credentials.",
    rateLimitNote:
      "Kite Connect does not publish rate limits. ZenFolio sends one request at a time and retries a limited number of times.",
    subscriptionNote:
      "Kite Connect is a paid add-on: ₹500 per month per API key, charged by Zerodha. Check Zerodha's current pricing before connecting.",
    scheduledSync: false,
    requiredEnv: ["BROKER_STORE", "BROKER_CREDENTIALS_KEYS", "BROKER_PUBLIC_ORIGIN"],
    limitations: [
      "One Kite Connect app covers a single client ID, so it cannot be shared between accounts.",
      "Orders and trades cover the current day only.",
      "Your Kite app must list this site's callback URL as its redirect URL.",
      "Your API secret is exchanged on the server and never reaches the browser.",
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
      "There is no shared app to connect to: each user creates their own API key inside Groww.",
    data: data(),
    history: {
      holdings: "snapshot",
      positions: "snapshot",
      orders: "current_day",
      trades: "current_day",
    },
    historyNote:
      "Groww has no date range for orders, and trades are read one order at a time. Expect the current day rather than your full history.",
    tokenLifetime:
      "Tokens expire daily at 06:00 IST. Your API key also has to be approved on Groww's Cloud API Keys page, and that approval may need to be repeated each day.",
    reauthNote:
      "Approve the key on Groww's Cloud API Keys page, then choose Reauthorize to create a new token from the saved key and secret.",
    rateLimitNote:
      "Groww's published limits: sign-in 5/s, orders 10/s, live data 10/s, other requests 20/s (500/min), and 150 token requests per 24 hours.",
    subscriptionNote:
      "A Groww Trading API subscription is required: ₹499 plus taxes per month. Check Groww's current pricing before connecting.",
    scheduledSync: false,
    requiredEnv: ["BROKER_STORE", "BROKER_CREDENTIALS_KEYS", "BROKER_PUBLIC_ORIGIN"],
    limitations: [
      "Groww has no bulk trade endpoint, so trades are read one order at a time and each sync is capped.",
      "Order pages hold up to 100 records and trade pages up to 50.",
      "Groww may ask you to approve the key again each day before a new token can be created.",
      "Orders and trades cover the current day only.",
    ],
  },
  upstox: {
    id: "upstox",
    name: "Upstox",
    authProduct: "Upstox API v2",
    docsUrl: "https://upstox.com/developer/api-documentation/authentication/",
    setupUrl: "https://account.upstox.com/developer/apps",
    // Upstox v2 is OAuth-only: an authorization code from the browser login is
    // the only documented way to obtain an access token.
    methods: { oauth: true, apiKeys: false },
    sharedMultiUser: "unavailable",
    sharedMultiUserReason:
      "ZenFolio connects through your own Upstox app. One app's API key and secret cover one Upstox account, so they cannot be shared between ZenFolio accounts.",
    data: data(),
    history: {
      holdings: "snapshot",
      positions: "snapshot",
      orders: "current_day",
      trades: "current_day",
    },
    historyNote:
      "Upstox returns today's orders and trades only. Anything older has to come from contract notes or statements.",
    tokenLifetime:
      "Upstox access tokens are daily: after expiry, a fresh browser sign-in is the only documented way to get a new one. ZenFolio never renews tokens silently.",
    reauthNote:
      "Choose Reauthorize to reopen the Upstox login page with the saved app credentials.",
    rateLimitNote:
      "Upstox publishes per-second and per-minute request limits for API v2. ZenFolio sends one request at a time and retries a limited number of times.",
    subscriptionNote:
      "Upstox does not charge for API v2 access today; check Upstox's current pricing before connecting.",
    scheduledSync: false,
    requiredEnv: ["BROKER_STORE", "BROKER_CREDENTIALS_KEYS", "BROKER_PUBLIC_ORIGIN"],
    limitations: [
      "Your Upstox app must list this site's callback URL as its registered redirect URL.",
      "Orders and trades cover the current day only.",
      "The refresh token that Upstox returns is not used: reconnecting always means signing in to Upstox again.",
      "Your API secret is exchanged on the server and never reaches the browser.",
    ],
  },
};

export const BROKER_PROVIDER_LIST: BrokerProviderCapabilities[] = [
  BROKER_PROVIDERS.zerodha,
  BROKER_PROVIDERS.groww,
  BROKER_PROVIDERS.upstox,
];

export const isBrokerProviderId = (value: string): value is BrokerProviderId =>
  value === "zerodha" || value === "groww" || value === "upstox";
