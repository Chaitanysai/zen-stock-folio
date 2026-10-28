import type {
  NormalizedHolding,
  NormalizedOrder,
  NormalizedPosition,
  NormalizedTrade,
} from "../../../../../src/lib/brokers/contracts.ts";
import type { Env } from "../../../_lib/types.ts";
import type {
  AdapterContext,
  BrokerAdapter,
  TokenResult,
  TradeFetchResult,
} from "../adapter.ts";
import { BrokerError } from "../errors.ts";
import { arrayOf, cleanTicker, num, objectOf, sha256Hex, sideOf, text } from "../normalize.ts";
import { authFailure, providerJson } from "../providerHttp.ts";
import { nextSixAmIst, parseProviderTimestamp } from "../time.ts";

/**
 * Groww Trading API adapter.
 *
 * Groww has no OAuth redirect; the documented flow is an API key plus secret
 * that is exchanged for a short-lived token:
 *   POST /v1/token/api/access
 *     Authorization: Bearer <api_key>
 *     { key_type: "approval", timestamp: <epoch seconds>,
 *       checksum: SHA-256(api_secret + timestamp) }
 * The key must also be approved in the Groww app (daily), which is why a
 * minted token can succeed while data calls still fail with 403.
 *
 * Tokens expire daily at 06:00 IST. Read-only data calls use
 * `Authorization: Bearer <token>` + `X-API-VERSION: 1.0`.
 *
 * Response field names are read through several documented aliases because
 * Groww's payload keys differ per endpoint; anything unrecognised is skipped
 * rather than invented.
 */

const BASE = "https://api.groww.in";
const API_VERSION = "1.0";
const SEGMENTS = ["CASH", "FNO"] as const;
const ORDER_PAGE_SIZE = 100;
const MAX_ORDER_PAGES = 20;
const TRADE_PAGE_SIZE = 50;
const MAX_TRADE_ORDERS = 40;

const payloadOf = (body: unknown): unknown => {
  const root = objectOf(body);
  return root.payload !== undefined ? root.payload : root;
};

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

const listOf = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const row = objectOf(value);
  for (const key of [
    "order_list",
    "orders",
    "trade_list",
    "trades",
    "holdings",
    "positions",
    "results",
    "data",
  ]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
};

const mintToken = async (env: Env, apiKey: string, apiSecret: string, now: Date): Promise<TokenResult> => {
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const checksum = await sha256Hex(`${apiSecret}${timestamp}`);
  const response = await providerJson(`${BASE}/v1/token/api/access`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-VERSION": API_VERSION,
    },
    body: JSON.stringify({ key_type: "approval", checksum, timestamp }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new BrokerError("invalid_credentials", "Groww rejected the API key or approval");
  }
  if (response.status >= 400) throw new BrokerError("provider_error", "Groww token request failed");

  const payload = objectOf(payloadOf(response.body));
  const accessToken =
    text(payload.token) ?? text(payload.access_token) ?? text(payload.accessToken);
  if (!accessToken) throw new BrokerError("provider_error", "Groww returned no token");

  const expiryText = firstText(payload, ["expiry", "expires_at", "token_expiry", "tokenExpiry"]);
  const expiry =
    expiryText && !Number.isNaN(Date.parse(expiryText))
      ? new Date(expiryText).toISOString()
      : parseProviderTimestamp(expiryText) ?? nextSixAmIst(now);
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
      "X-API-VERSION": API_VERSION,
    },
  });
  if (response.status === 401 || response.status === 403) throw authFailure(response.status);
  return response;
};

const ensureOk = (response: { status: number }): void => {
  if (response.status >= 400) throw new BrokerError("provider_error");
};

const isPermissionDenied = (response: { status: number }): boolean =>
  response.status === 400 || response.status === 403 || response.status === 422;

export const growwAdapter: BrokerAdapter = {
  id: "groww",

  async validateCredentials(env, apiKey, apiSecret, now): Promise<TokenResult> {
    return mintToken(env, apiKey, apiSecret, now);
  },

  async refreshAccessToken(context): Promise<TokenResult> {
    // Groww tokens are re-minted from the stored key and secret, if approval is current.
    return mintToken(
      context.env,
      context.credentials.apiKey,
      context.credentials.apiSecret,
      context.now,
    );
  },

  async testConnection(context): Promise<void> {
    // Groww documents no profile endpoint; a holdings read proves both the
    // token and the read scope that the sync depends on.
    const response = await dataGet(context, "/v1/holdings/user");
    ensureOk(response);
  },

  async fetchHoldings(context): Promise<NormalizedHolding[]> {
    const response = await dataGet(context, "/v1/holdings/user");
    ensureOk(response);
    const asOf = context.now.toISOString();
    return listOf(payloadOf(response.body)).flatMap((entry) => {
      const row = objectOf(entry);
      const ticker = firstText(row, ["trading_symbol", "tradingsymbol", "symbol"]);
      const quantity = firstNum(row, ["quantity", "total_quantity"]);
      const averagePrice = firstNum(row, ["average_price", "avg_price", "average_buy_price"]);
      if (!ticker || quantity === undefined || averagePrice === undefined) return [];
      const exchange = firstText(row, ["exchange"]);
      const isin = firstText(row, ["isin"]);
      const lastPrice = firstNum(row, ["last_price", "ltp", "close_price"]);
      return [
        {
          instrumentId: isin ?? `${exchange ?? "NSE"}:${ticker.toUpperCase()}`,
          ticker: cleanTicker(ticker),
          ...(isin ? { isin } : {}),
          ...(exchange ? { exchange } : {}),
          currency: "INR" as const,
          quantity,
          averagePrice,
          ...(lastPrice !== undefined ? { lastPrice } : {}),
          asOf,
        },
      ];
    });
  },

  async fetchPositions(context): Promise<NormalizedPosition[]> {
    const asOf = context.now.toISOString();
    const positions: NormalizedPosition[] = [];
    const seen = new Set<string>();

    for (const segment of SEGMENTS) {
      const response = await dataGet(context, `/v1/positions/user?segment=${segment}`);
      if (isPermissionDenied(response)) continue;
      ensureOk(response);
      for (const entry of listOf(payloadOf(response.body))) {
        const row = objectOf(entry);
        const ticker = firstText(row, ["trading_symbol", "tradingsymbol", "symbol"]);
        const quantity = firstNum(row, ["quantity", "net_quantity", "net_qty"]);
        if (!ticker || quantity === undefined || quantity === 0) continue;
        const exchange = firstText(row, ["exchange"]);
        const instrumentId = `${exchange ?? "NSE"}:${ticker.toUpperCase()}`;
        if (seen.has(instrumentId)) continue;
        seen.add(instrumentId);
        const product = firstText(row, ["product", "product_type", "productType"]);
        const lastPrice = firstNum(row, ["last_price", "ltp"]);
        const realised = firstNum(row, ["realised_pnl", "realized_pnl", "pnl"]);
        positions.push({
          instrumentId,
          ticker: cleanTicker(ticker),
          ...(exchange ? { exchange } : {}),
          segment,
          ...(product ? { product } : {}),
          quantity,
          averagePrice: firstNum(row, ["average_price", "avg_price", "net_price"]) ?? 0,
          ...(lastPrice !== undefined ? { lastPrice } : {}),
          ...(realised !== undefined ? { realisedPnl: realised } : {}),
          asOf,
        });
      }
    }
    return positions;
  },

  async fetchOrders(context): Promise<NormalizedOrder[]> {
    const orders: NormalizedOrder[] = [];
    const seen = new Set<string>();

    for (const segment of SEGMENTS) {
      for (let page = 0; page < MAX_ORDER_PAGES; page++) {
        const response = await dataGet(
          context,
          `/v1/order/list?segment=${segment}&page=${page}&page_size=${ORDER_PAGE_SIZE}`,
        );
        if (page === 0 && isPermissionDenied(response)) break;
        ensureOk(response);
        const rows = listOf(payloadOf(response.body));
        for (const entry of rows) {
          const row = objectOf(entry);
          const orderId = firstText(row, ["order_id", "groww_order_id", "id"]);
          const ticker = firstText(row, ["trading_symbol", "tradingsymbol", "symbol"]);
          const side = sideOf(firstText(row, ["transaction_type", "side"]));
          const quantity = firstNum(row, ["quantity", "order_quantity"]);
          if (!orderId || !ticker || !side || quantity === undefined || seen.has(orderId)) continue;
          seen.add(orderId);
          const placed = firstText(row, [
            "order_timestamp",
            "created_at",
            "order_time",
            "exchange_timestamp",
          ]);
          const placedAt = parseProviderTimestamp(placed);
          const price = firstNum(row, ["average_price", "avg_fill_price", "executed_price"]);
          orders.push({
            orderId,
            ticker: cleanTicker(ticker),
            ...(firstText(row, ["exchange"]) ? { exchange: firstText(row, ["exchange"]) } : {}),
            segment,
            ...(firstText(row, ["product", "product_type"])
              ? { product: firstText(row, ["product", "product_type"]) }
              : {}),
            side,
            quantity,
            filledQuantity: firstNum(row, ["filled_quantity", "executed_quantity", "traded_quantity"]) ?? 0,
            ...(price !== undefined ? { averagePrice: price } : {}),
            status: firstText(row, ["order_status", "status"]) ?? "UNKNOWN",
            ...(placedAt ? { placedAt } : {}),
          });
        }
        if (rows.length < ORDER_PAGE_SIZE) break;
      }
    }
    return orders;
  },

  async fetchTrades(context, orders): Promise<TradeFetchResult> {
    const trades: NormalizedTrade[] = [];
    let partial = orders.length > MAX_TRADE_ORDERS;
    const walk = orders.slice(0, MAX_TRADE_ORDERS);

    for (const order of walk) {
      const segment = order.segment === "FNO" ? "FNO" : "CASH";
      for (let page = 0; page < MAX_ORDER_PAGES; page++) {
        let response: { status: number; body: unknown };
        try {
          response = await dataGet(
            context,
            `/v1/order/trades/${encodeURIComponent(order.orderId)}?segment=${segment}&page=${page}&page_size=${TRADE_PAGE_SIZE}`,
          );
        } catch (error) {
          if (error instanceof BrokerError && error.code === "permission_missing") {
            partial = true;
            break;
          }
          throw error;
        }
        if (response.status === 404 || response.status === 422) {
          partial = true;
          break;
        }
        ensureOk(response);
        const rows = listOf(payloadOf(response.body));
        for (const entry of rows) {
          const row = objectOf(entry);
          const tradeId = firstText(row, ["trade_id", "id"]);
          const ticker = firstText(row, ["trading_symbol", "tradingsymbol", "symbol"]) ?? order.ticker;
          const side = sideOf(firstText(row, ["transaction_type", "side"])) ?? order.side;
          const quantity = firstNum(row, ["quantity", "traded_quantity", "fill_quantity"]);
          const price = firstNum(row, ["price", "trade_price", "average_price", "fill_price"]);
          if (!tradeId || quantity === undefined || price === undefined) continue;
          const at = parseProviderTimestamp(
            firstText(row, ["trade_timestamp", "created_at", "trade_time", "exchange_timestamp"]),
          );
          trades.push({
            tradeId,
            orderId: order.orderId,
            ticker: cleanTicker(ticker),
            ...(order.exchange ? { exchange: order.exchange } : {}),
            segment,
            ...(order.product ? { product: order.product } : {}),
            side,
            quantity,
            price,
            ...(at ? { tradedAt: at } : {}),
          });
        }
        if (rows.length < TRADE_PAGE_SIZE) break;
      }
    }

    return {
      trades,
      partial,
      ...(partial
        ? {
            note:
              orders.length > MAX_TRADE_ORDERS
                ? `Trade details were read for the first ${MAX_TRADE_ORDERS} of ${orders.length} orders today.`
                : "Some orders did not return trade details.",
          }
        : {}),
    };
  },
};
