import type {
  NormalizedHolding,
  NormalizedOrder,
  NormalizedPosition,
  NormalizedTrade,
} from "../../../../../src/lib/brokers/contracts.ts";
import type { Env } from "../../../_lib/types.ts";
import type {
  AdapterContext,
  AuthorizationStart,
  BrokerAdapter,
  TokenResult,
  TradeFetchResult,
} from "../adapter.ts";
import { BrokerError } from "../errors.ts";
import { arrayOf, cleanTicker, num, objectOf, sideOf, text } from "../normalize.ts";
import { authFailure, providerJson } from "../providerHttp.ts";
import { nextThreeThirtyAmIst, parseProviderTimestamp } from "../time.ts";

/**
 * Upstox API v2 adapter (OAuth 2.0 authorization code).
 *
 * Verified against Upstox's authentication documentation:
 *   1. Redirect the browser to
 *      https://api.upstox.com/v2/login/authorization/dialog with client_id,
 *      redirect_uri (must equal the registered app URL), response_type=code
 *      and state, which Upstox echoes back unchanged.
 *   2. Upstox redirects to `<redirect_uri>?code=…&state=…`; the shared callback
 *      route hands the code over as the request token.
 *   3. POST /v2/login/authorization/token with a form body of code, client_id,
 *      client_secret, redirect_uri and grant_type=authorization_code.
 *
 * Both OAuth steps require redirect_uri to match the registered app URL, so it
 * is built from BROKER_PUBLIC_ORIGIN; a deployment without it fails closed
 * with setup_required. The token response's expiry is used when present, with
 * the next 03:30 IST boundary as the fallback.
 *
 * Data endpoints follow the v2 reference (/v2/user/profile,
 * /v2/portfolio/long-term-holdings, /v2/portfolio/short-term-holdings,
 * /v2/portfolio/short-term-positions, /v2/portfolio/long-term-positions,
 * /v2/order/retrieve-all, /v2/order/trades). Response fields are read through
 * documented aliases because payload keys have drifted across v2 releases;
 * anything unrecognised is skipped rather than invented.
 */

const BASE = "https://api.upstox.com";

const firstText = (row: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return undefined;
};

const firstNum = (row: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = num(row[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

/** v2 wraps results in `data`; list payloads are arrays or net/day objects. */
const rowsOf = (body: unknown): unknown[] => {
  const root = objectOf(body);
  const data = root.data !== undefined ? root.data : root;
  if (Array.isArray(data)) return data;
  const row = objectOf(data);
  return [...arrayOf(row.net), ...arrayOf(row.day)];
};

const registeredRedirectUri = (env: Env): string => {
  const origin = env.BROKER_PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  let ok = false;
  let host = "";
  if (origin) {
    try {
      const url = new URL(origin);
      ok = url.protocol === "https:" || url.hostname === "localhost";
      host = url.origin;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    throw new BrokerError(
      "setup_required",
      "BROKER_PUBLIC_ORIGIN must be a valid HTTPS origin before Upstox can be connected",
    );
  }
  return `${host}/api/brokers/callback/upstox`;
};

const exchangeToken = async (env: Env, form: URLSearchParams, now: Date): Promise<TokenResult> => {
  const response = await providerJson(`${BASE}/v2/login/authorization/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new BrokerError("invalid_credentials", "Upstox rejected the authorization code");
  }
  if (response.status >= 400) throw new BrokerError("provider_error", "Upstox token request failed");

  const payload = objectOf(response.body);
  const accessToken = text(payload.access_token) ?? text(payload.token);
  if (!accessToken) throw new BrokerError("provider_error", "Upstox returned no access token");

  const expiresIn = num(payload.expires_in);
  const expiryText = firstText(payload, ["expiry_time", "expires_at", "expiry"]);
  const expiry =
    expiryText && !Number.isNaN(Date.parse(expiryText))
      ? new Date(expiryText).toISOString()
      : expiresIn !== undefined && expiresIn > 0
        ? new Date(now.getTime() + expiresIn * 1000).toISOString()
        : nextThreeThirtyAmIst(now);
  return { accessToken, tokenExpiresAt: expiry };
};

const dataGet = async (
  context: AdapterContext,
  path: string,
): Promise<{ status: number; body: unknown }> => {
  const token = context.credentials.accessToken;
  if (!token) throw new BrokerError("authentication_expired");
  const response = await providerJson(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (response.status === 401 || response.status === 403) throw authFailure(response.status);
  return response;
};

const ensureOk = (response: { status: number }): void => {
  if (response.status >= 400) throw new BrokerError("provider_error");
};

/** Optional companion endpoints (T2T holdings, overnight positions) may be absent. */
const isOptionalEndpointMiss = (response: { status: number }): boolean =>
  response.status === 400 || response.status === 403 || response.status === 404 || response.status === 422;

const segmentOf = (row: Record<string, unknown>, exchange: string | undefined): "CASH" | "FNO" => {
  const declared = firstText(row, ["segment", "segment_type"])?.toUpperCase();
  if (declared === "FO" || declared === "FNO") return "FNO";
  if (declared === "CASH") return "CASH";
  return exchange !== undefined && !["NSE", "BSE"].includes(exchange) ? "FNO" : "CASH";
};

export const upstoxAdapter: BrokerAdapter = {
  id: "upstox",

  async beginAuthorization(
    env: Env,
    credentials,
    state: string,
    now: Date,
  ): Promise<AuthorizationStart> {
    const redirectUri = registeredRedirectUri(env);
    const url = new URL(`${BASE}/v2/login/authorization/dialog`);
    url.searchParams.set("client_id", credentials.apiKey);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    return { authorizationUrl: url.toString(), expiresAt };
  },

  async completeAuthorization(
    env: Env,
    credentials,
    requestToken: string,
    now: Date,
  ): Promise<TokenResult> {
    const form = new URLSearchParams({
      code: requestToken,
      client_id: credentials.apiKey,
      client_secret: credentials.apiSecret,
      redirect_uri: registeredRedirectUri(env),
      grant_type: "authorization_code",
    });
    return exchangeToken(env, form, now);
  },

  async testConnection(context): Promise<void> {
    const response = await dataGet(context, "/v2/user/profile");
    ensureOk(response);
  },

  async fetchHoldings(context): Promise<NormalizedHolding[]> {
    const asOf = context.now.toISOString();
    const holdings: NormalizedHolding[] = [];
    const seen = new Set<string>();

    for (const path of ["/v2/portfolio/long-term-holdings", "/v2/portfolio/short-term-holdings"]) {
      const response = await dataGet(context, path);
      if (path !== "/v2/portfolio/long-term-holdings" && isOptionalEndpointMiss(response)) continue;
      ensureOk(response);
      for (const entry of rowsOf(response.body)) {
        const row = objectOf(entry);
        const isin = firstText(row, ["isin"]);
        // The v2 holdings payloads are keyed by ISIN and company name; when no
        // symbol alias is present the ISIN stands in so a real holding is
        // never dropped over a missing display ticker.
        const ticker =
          firstText(row, ["symbol", "trading_symbol", "tradingsymbol"]) ?? isin;
        const quantity = firstNum(row, ["quantity", "total_quantity", "net_quantity"]);
        const averagePrice = firstNum(row, ["average_price", "avg_price", "average_buy_price"]);
        if (!ticker || quantity === undefined || averagePrice === undefined) continue;
        const exchange = firstText(row, ["exchange"]);
        const instrumentId = isin ?? `${exchange ?? "NSE"}:${ticker.toUpperCase()}`;
        if (seen.has(instrumentId)) continue;
        seen.add(instrumentId);
        holdings.push({
          instrumentId,
          ticker: cleanTicker(ticker),
          ...(isin ? { isin } : {}),
          ...(exchange ? { exchange } : {}),
          currency: "INR" as const,
          quantity,
          averagePrice,
          ...(firstNum(row, ["last_price", "ltp", "close_price"]) !== undefined
            ? { lastPrice: firstNum(row, ["last_price", "ltp", "close_price"]) }
            : {}),
          asOf,
        });
      }
    }
    return holdings;
  },

  async fetchPositions(context): Promise<NormalizedPosition[]> {
    const asOf = context.now.toISOString();
    const positions: NormalizedPosition[] = [];
    const seen = new Set<string>();

    for (const path of ["/v2/portfolio/short-term-positions", "/v2/portfolio/long-term-positions"]) {
      const response = await dataGet(context, path);
      if (path !== "/v2/portfolio/short-term-positions" && isOptionalEndpointMiss(response)) continue;
      ensureOk(response);
      for (const entry of rowsOf(response.body)) {
        const row = objectOf(entry);
        const ticker = firstText(row, ["symbol", "trading_symbol", "tradingsymbol"]);
        const quantity = firstNum(row, ["quantity", "net_quantity", "net_qty"]);
        if (!ticker || quantity === undefined || quantity === 0) continue;
        const exchange = firstText(row, ["exchange"]);
        const instrumentId = `${exchange ?? "NSE"}:${ticker.toUpperCase()}`;
        if (seen.has(instrumentId)) continue;
        seen.add(instrumentId);
        positions.push({
          instrumentId,
          ticker: cleanTicker(ticker),
          ...(exchange ? { exchange } : {}),
          segment: segmentOf(row, exchange),
          ...(firstText(row, ["product", "product_type"]) ? { product: firstText(row, ["product", "product_type"]) } : {}),
          quantity,
          averagePrice: firstNum(row, ["average_price", "avg_price", "net_price"]) ?? 0,
          ...(firstNum(row, ["last_price", "ltp"]) !== undefined
            ? { lastPrice: firstNum(row, ["last_price", "ltp"]) }
            : {}),
          ...(firstNum(row, ["pnl", "realised_pnl", "realized_pnl"]) !== undefined
            ? { realisedPnl: firstNum(row, ["pnl", "realised_pnl", "realized_pnl"]) }
            : {}),
          asOf,
        });
      }
    }
    return positions;
  },

  async fetchOrders(context): Promise<NormalizedOrder[]> {
    const response = await dataGet(context, "/v2/order/retrieve-all");
    ensureOk(response);
    const orders: NormalizedOrder[] = [];
    for (const entry of rowsOf(response.body)) {
      const row = objectOf(entry);
      const orderId = firstText(row, ["order_id", "id"]);
      const ticker = firstText(row, ["symbol", "trading_symbol", "tradingsymbol"]);
      const side = sideOf(firstText(row, ["side", "transaction_type"]));
      const quantity = firstNum(row, ["quantity", "order_quantity"]);
      if (!orderId || !ticker || !side || quantity === undefined) continue;
      const exchange = firstText(row, ["exchange"]);
      // v2 sends epoch numbers here, so the raw value goes straight to the
      // timestamp parser instead of through the string-only alias reader.
      const placed = parseProviderTimestamp(row.order_timestamp ?? row.exchange_timestamp ?? row.created_at);
      orders.push({
        orderId,
        ticker: cleanTicker(ticker),
        ...(exchange ? { exchange } : {}),
        segment: segmentOf(row, exchange),
        ...(firstText(row, ["product", "product_type"]) ? { product: firstText(row, ["product", "product_type"]) } : {}),
        side,
        quantity,
        filledQuantity: firstNum(row, ["filled_quantity", "traded_quantity", "filled_qty"]) ?? 0,
        ...(firstNum(row, ["average_price", "avg_price"]) !== undefined
          ? { averagePrice: firstNum(row, ["average_price", "avg_price"]) }
          : {}),
        status: firstText(row, ["status", "order_status"]) ?? "UNKNOWN",
        ...(placed ? { placedAt: placed } : {}),
      });
    }
    return orders;
  },

  async fetchTrades(context, _orders): Promise<TradeFetchResult> {
    // Upstox exposes the day's executed trades directly; no per-order walk.
    const response = await dataGet(context, "/v2/order/trades");
    ensureOk(response);
    const trades: NormalizedTrade[] = [];
    for (const entry of rowsOf(response.body)) {
      const row = objectOf(entry);
      const tradeId = firstText(row, ["trade_id", "id"]);
      const ticker = firstText(row, ["symbol", "trading_symbol", "tradingsymbol"]);
      const side = sideOf(firstText(row, ["side", "transaction_type"]));
      const quantity = firstNum(row, ["quantity", "traded_quantity"]);
      const price = firstNum(row, ["average_price", "price", "trade_price"]);
      if (!tradeId || !ticker || !side || quantity === undefined || price === undefined) continue;
      const exchange = firstText(row, ["exchange"]);
      const at = parseProviderTimestamp(row.trade_timestamp ?? row.exchange_timestamp ?? row.created_at);
      trades.push({
        tradeId,
        ...(firstText(row, ["order_id"]) ? { orderId: firstText(row, ["order_id"]) } : {}),
        ticker: cleanTicker(ticker),
        ...(exchange ? { exchange } : {}),
        segment: segmentOf(row, exchange),
        ...(firstText(row, ["product", "product_type"]) ? { product: firstText(row, ["product", "product_type"]) } : {}),
        side,
        quantity,
        price,
        ...(at ? { tradedAt: at } : {}),
      });
    }
    return { trades, partial: false };
  },
};
