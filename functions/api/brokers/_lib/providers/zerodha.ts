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
import {
  arrayOf,
  cleanTicker,
  num,
  objectOf,
  sha256Hex,
  sideOf,
  text,
} from "../normalize.ts";
import { authFailure, providerJson } from "../providerHttp.ts";
import { nextSixAmIst, parseProviderTimestamp } from "../time.ts";

/**
 * Zerodha Kite Connect adapter.
 *
 * Authentication is the documented Kite Connect request-token flow:
 *   1. Redirect the user to https://kite.zerodha.com/connect/login?v=3&api_key=…
 *   2. Kite redirects back with ?request_token=… (the `state` value travels in
 *      `redirect_params`, which Kite appends to the registered redirect URL).
 *   3. POST /session/token with checksum = SHA-256(api_key + request_token + api_secret).
 *
 * Every data endpoint below is documented as read-only. Tokens expire at
 * 06:00 IST; Kite has no refresh-token flow, so an expired token requires the
 * user to repeat the login.
 */

const BASE = "https://api.kite.trade";
const LOGIN_URL = "https://kite.zerodha.com/connect/login";
const KITE_VERSION = "3";

const dataOf = (body: unknown): unknown => {
  const root = objectOf(body);
  return root.data !== undefined ? root.data : root;
};

const request = async (
  context: AdapterContext,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> => {
  const token = context.credentials.accessToken;
  if (!token) throw new BrokerError("authentication_expired");
  const response = await providerJson(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "X-Kite-Version": KITE_VERSION,
      Authorization: `token ${context.credentials.apiKey}:${token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (response.status === 401 || response.status === 403) throw authFailure(response.status);
  return response;
};

const ensureOk = (response: { status: number }): void => {
  if (response.status >= 400) throw new BrokerError("provider_error");
};

export const zerodhaAdapter: BrokerAdapter = {
  id: "zerodha",

  async beginAuthorization(
    _env: Env,
    credentials,
    state: string,
    now: Date,
  ): Promise<AuthorizationStart> {
    const url = new URL(LOGIN_URL);
    url.searchParams.set("v", "3");
    url.searchParams.set("api_key", credentials.apiKey);
    // Kite echoes `redirect_params` onto the registered redirect URL; the
    // encoded `state=…` is what the callback verifies.
    url.searchParams.set("redirect_params", `state=${state}`);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    return { authorizationUrl: url.toString(), expiresAt };
  },

  async completeAuthorization(
    _env: Env,
    credentials,
    requestToken: string,
    now: Date,
  ): Promise<TokenResult> {
    const checksum = await sha256Hex(
      `${credentials.apiKey}${requestToken}${credentials.apiSecret}`,
    );
    const form = new URLSearchParams({
      api_key: credentials.apiKey,
      request_token: requestToken,
      checksum,
    });
    const response = await providerJson(`${BASE}/session/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new BrokerError("invalid_credentials", "Kite rejected the request token");
    }
    ensureOk(response);
    const data = objectOf(dataOf(response.body));
    const accessToken = text(data.access_token);
    if (!accessToken) throw new BrokerError("provider_error", "Kite returned no access token");
    const expiresAt = text(data.expires_at);
    return {
      accessToken,
      tokenExpiresAt: expiresAt && !Number.isNaN(Date.parse(expiresAt))
        ? new Date(expiresAt).toISOString()
        : nextSixAmIst(now),
    };
  },

  async testConnection(context): Promise<void> {
    const response = await request(context, "/user/profile");
    ensureOk(response);
  },

  async fetchHoldings(context): Promise<NormalizedHolding[]> {
    const response = await request(context, "/portfolio/holdings");
    ensureOk(response);
    const asOf = context.now.toISOString();
    return arrayOf(dataOf(response.body)).flatMap((entry) => {
      const row = objectOf(entry);
      const ticker = text(row.tradingsymbol);
      const quantity = num(row.quantity);
      const averagePrice = num(row.average_price);
      if (!ticker || quantity === undefined || averagePrice === undefined) return [];
      const exchange = text(row.exchange);
      const isin = text(row.isin);
      return [
        {
          instrumentId: isin ?? `${exchange ?? "NSE"}:${ticker.toUpperCase()}`,
          ticker: cleanTicker(ticker),
          ...(isin ? { isin } : {}),
          ...(exchange ? { exchange } : {}),
          currency: "INR" as const,
          quantity,
          averagePrice,
          ...(num(row.last_price) !== undefined ? { lastPrice: num(row.last_price) } : {}),
          asOf,
        },
      ];
    });
  },

  async fetchPositions(context): Promise<NormalizedPosition[]> {
    const response = await request(context, "/portfolio/positions");
    ensureOk(response);
    const payload = objectOf(dataOf(response.body));
    const rows = [...arrayOf(payload.net), ...arrayOf(payload.day)];
    const seen = new Set<string>();
    const asOf = context.now.toISOString();
    const positions: NormalizedPosition[] = [];

    for (const entry of rows) {
      const row = objectOf(entry);
      const ticker = text(row.tradingsymbol);
      const quantity = num(row.quantity);
      if (!ticker || quantity === undefined || quantity === 0) continue;
      const exchange = text(row.exchange);
      const instrumentId = `${exchange ?? "NSE"}:${ticker.toUpperCase()}`;
      if (seen.has(instrumentId)) continue;
      seen.add(instrumentId);
      const derivative = exchange !== undefined && !["NSE", "BSE"].includes(exchange);
      positions.push({
        instrumentId,
        ticker: cleanTicker(ticker),
        ...(exchange ? { exchange } : {}),
        segment: derivative ? "FNO" : "CASH",
        ...(text(row.product) ? { product: text(row.product) } : {}),
        quantity,
        averagePrice: num(row.average_price) ?? 0,
        ...(num(row.last_price) !== undefined ? { lastPrice: num(row.last_price) } : {}),
        ...(num(row.pnl) !== undefined ? { realisedPnl: num(row.pnl) } : {}),
        asOf,
      });
    }
    return positions;
  },

  async fetchOrders(context): Promise<NormalizedOrder[]> {
    // Kite returns the full order book for the day in a single response.
    const response = await request(context, "/orders");
    ensureOk(response);
    const orders: NormalizedOrder[] = [];
    for (const entry of arrayOf(dataOf(response.body))) {
      const row = objectOf(entry);
      const orderId = text(row.order_id);
      const ticker = text(row.tradingsymbol);
      const side = sideOf(row.transaction_type);
      const quantity = num(row.quantity);
      if (!orderId || !ticker || !side || quantity === undefined) continue;
      orders.push({
        orderId,
        ticker: cleanTicker(ticker),
        ...(text(row.exchange) ? { exchange: text(row.exchange) } : {}),
        ...(text(row.product) ? { product: text(row.product) } : {}),
        side,
        quantity,
        filledQuantity: num(row.filled_quantity) ?? 0,
        ...(num(row.average_price) !== undefined ? { averagePrice: num(row.average_price) } : {}),
        status: text(row.status) ?? "UNKNOWN",
        ...(parseProviderTimestamp(row.order_timestamp)
          ? { placedAt: parseProviderTimestamp(row.order_timestamp)! }
          : {}),
      });
    }
    return orders;
  },

  async fetchTrades(_context, _orders): Promise<TradeFetchResult> {
    // Kite exposes the day's executed trades directly; no per-order walk.
    const response = await request(_context, "/trades");
    ensureOk(response);
    const trades: NormalizedTrade[] = [];
    for (const entry of arrayOf(dataOf(response.body))) {
      const row = objectOf(entry);
      const tradeId = text(row.trade_id);
      const ticker = text(row.tradingsymbol);
      const side = sideOf(row.transaction_type);
      const quantity = num(row.quantity);
      const price = num(row.average_price);
      if (!tradeId || !ticker || !side || quantity === undefined || price === undefined) continue;
      trades.push({
        tradeId,
        ...(text(row.order_id) ? { orderId: text(row.order_id) } : {}),
        ticker: cleanTicker(ticker),
        ...(text(row.exchange) ? { exchange: text(row.exchange) } : {}),
        ...(text(row.product) ? { product: text(row.product) } : {}),
        side,
        quantity,
        price,
        ...(num(row.fees) !== undefined ? { fees: num(row.fees) } : {}),
        ...(parseProviderTimestamp(row.trade_timestamp)
          ? { tradedAt: parseProviderTimestamp(row.trade_timestamp)! }
          : {}),
      });
    }
    return { trades, partial: false };
  },
};
