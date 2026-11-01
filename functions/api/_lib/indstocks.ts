import type {
  NormalizedFill,
  NormalizedHolding,
  UnmatchedHolding,
} from "../../../src/lib/broker/types.ts";

/**
 * INDstocks read client.
 *
 * The upstream JSON contract is not guaranteed stable, so every field is read
 * through an alias list and every unknown row is reported instead of being
 * coerced. The client is read-only: no order or position-mutation endpoints
 * are called from this repo, by design.
 */

export type BrokerErrorKind = "auth" | "unavailable" | "contract";

export class BrokerError extends Error {
  readonly kind: BrokerErrorKind;
  readonly status: number | null;

  constructor(kind: BrokerErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "BrokerError";
    this.kind = kind;
    this.status = status;
  }
}

export interface IndstocksConfig {
  baseUrl: string;
  apiKey: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface HoldingsResult {
  holdings: NormalizedHolding[];
  unmatched: UnmatchedHolding[];
  warnings: string[];
}

export interface TradeBookResult {
  fills: NormalizedFill[];
  warnings: string[];
  skipped: number;
}

export interface IndstocksClient {
  profile(): Promise<{ brokerUserId: string | null }>;
  holdings(): Promise<HoldingsResult>;
  tradeBook(): Promise<TradeBookResult>;
}

const DEFAULT_TIMEOUT_MS = 8000;
// NSE tickers may start with a digit (`3MINDIA`, `63MOONS`), so the first
// character is alphanumeric. An all-digit value is an instrument token, not a
// symbol, so at least one letter is required. ISINs are filtered separately.
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9&-]{0,19}$/;
const TICKER_LETTER_PATTERN = /[A-Z]/;
const ISIN_PATTERN = /^IN[A-Z0-9]{10}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
};

const asText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

const asNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
};

const unwrap = (body: unknown): unknown => (isRecord(body) && "data" in body ? body.data : body);

const UPSTREAM_MESSAGE_KEYS = ["message", "errorMessage", "error_message", "detail", "description", "error"];

/** Extracts a human-readable message from an upstream body, if it carries one. */
const upstreamMessage = (body: Record<string, unknown>): string => {
  for (const key of UPSTREAM_MESSAGE_KEYS) {
    const value = body[key];
    const text = asText(value);
    if (text !== "") return text;
    if (isRecord(value)) {
      for (const nestedKey of UPSTREAM_MESSAGE_KEYS) {
        const nested = asText(value[nestedKey]);
        if (nested !== "") return nested;
      }
    }
  }
  return "";
};

/** True when the upstream says the call failed, even with a 2xx transport. */
const isErrorEnvelope = (body: Record<string, unknown>): boolean => {
  const status = asText(body.status).toLowerCase();
  return status === "error" || status === "failed" || status === "failure" || body.success === false;
};

/**
 * Resolves the list of rows out of an upstream body.
 *
 * A null or absent list is a legitimate empty collection (`{data:null}`, `{}`),
 * so it yields `[]` rather than failing the sync. A non-null payload of the
 * wrong type, or a record whose list key is present but not a list, is a
 * contract break: reporting it keeps a broken upstream from looking like an
 * empty portfolio/trade book. Upstream error messages are surfaced, sanitized,
 * so the user sees the broker's reason instead of a generic one.
 */
const listFrom = (
  body: unknown,
  keys: string[],
  redact: (text: string) => string = (text) => text,
): unknown[] => {
  if (isRecord(body)) {
    if (isErrorEnvelope(body)) {
      const message = upstreamMessage(body);
      throw new BrokerError(
        "contract",
        `Broker reported an error${message ? `: ${redact(message)}` : ""}`,
      );
    }
  }

  const data = isRecord(body) && "data" in body ? body.data : body;
  if (Array.isArray(data)) return data;
  if (data === null || data === undefined) return [];
  if (isRecord(data)) {
    for (const key of keys) {
      const value = data[key];
      if (Array.isArray(value)) return value;
      if (value === null) return [];
    }
    if (Object.keys(data).length === 0) return [];
  }

  const message = isRecord(body)
    ? upstreamMessage(body) || (isRecord(data) ? upstreamMessage(data) : "")
    : "";
  throw new BrokerError(
    "contract",
    `Broker response is missing its data list${message ? `: ${redact(message)}` : ""}`,
  );
};

const toIso = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return toIso(numeric);
  }
  return null;
};

/**
 * The broker does not always expose a trade id. The spec fixes the fallback as
 * a SHA-256 of the fill's identifying fields, so repeated syncs of the same
 * fill dedupe even though no id is present.
 */
const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Broker symbols arrive as `NSE:RELIANCE`, `RELIANCE-EQ`, or plain tickers.
 * Only documented exchange prefixes and equity-series suffixes are stripped;
 * anything else that is not a plausible NSE symbol is rejected.
 */
export function normalizeBrokerTicker(raw: string): string | null {
  let value = raw.trim().toUpperCase();
  value = value.replace(/^(NSE|BSE):/, "").replace(/^NSE_/, "");
  value = value.replace(/-(EQ|BE|BZ)$/, "");
  if (ISIN_PATTERN.test(value)) return null;
  return TICKER_PATTERN.test(value) && TICKER_LETTER_PATTERN.test(value) ? value : null;
}

/**
 * Collapses an exchange or segment value onto its market.
 *
 * INDstocks reports the exchange as `NSE`, `NSE_EQ`, `NSE_EQ|NSE_FO`, `NSE-CM`
 * or similar; only the leading segment before `_`, `|`, `-`, or a space names
 * the market. An empty value names no market at all and is never guessed.
 */
const exchangeMarket = (value: unknown): string => {
  const text = asText(value).toUpperCase();
  return text.split(/[_\s|-]/)[0];
};

const assertBaseUrl = (raw: string): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BrokerError("contract", "Broker base URL is invalid");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new BrokerError("contract", "Broker base URL must use HTTPS");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new BrokerError("contract", "Broker base URL must not include a query or hash");
  }
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  return url;
};

const normalizeSide = (value: unknown): "BUY" | "SELL" | null => {
  const text = asText(value).toUpperCase();
  if (text === "BUY" || text === "B" || text === "BUY_ORDER") return "BUY";
  if (text === "SELL" || text === "S" || text === "SELL_ORDER") return "SELL";
  return null;
};

export function createIndstocksClient(config: IndstocksConfig): IndstocksClient {
  const baseUrl = assertBaseUrl(config.baseUrl);
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const secrets = [config.apiKey, config.token].filter((secret) => secret !== "");

  /** Keeps credentials out of any detail copied from an upstream message. */
  const redact = (text: string): string => {
    let result = text;
    for (const secret of secrets) result = result.split(secret).join("[redacted]");
    return result.replace(/\s+/g, " ").trim().slice(0, 200);
  };

  async function request(path: string): Promise<unknown> {
    const url = new URL(path.replace(/^\/+/, ""), baseUrl).toString();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            "x-api-key": config.apiKey,
            // INDstocks expects the raw access token; a Bearer prefix is
            // rejected with 401 "Unable to validate user token".
            Authorization: config.token,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        if (attempt === 0) continue;
        throw new BrokerError("unavailable", "Broker is unreachable");
      }

      if (response.status === 401 || response.status === 403) {
        throw new BrokerError("auth", "Broker token rejected", response.status);
      }
      if (response.status >= 500) {
        if (attempt === 0) continue;
        throw new BrokerError("unavailable", "Broker is unavailable", response.status);
      }
      if (!response.ok) {
        throw new BrokerError("contract", `Broker request failed (${response.status})`, response.status);
      }

      try {
        return await response.json();
      } catch {
        throw new BrokerError("contract", "Broker returned malformed JSON", response.status);
      }
    }
    throw new BrokerError("unavailable", "Broker is unreachable");
  }

  return {
    async profile() {
      const body = unwrap(await request("/user/profile"));
      if (!isRecord(body)) throw new BrokerError("contract", "Broker profile response is malformed");
      const brokerUserId = pick(body, ["user_id", "userId", "client_id", "clientId", "userName", "username"]);
      return { brokerUserId: asText(brokerUserId) || null };
    },

    async holdings() {
      const rows = listFrom(await request("/portfolio/holdings"), ["holdings"], redact);
      const holdings: NormalizedHolding[] = [];
      const unmatched: UnmatchedHolding[] = [];
      const warnings: string[] = [];

      for (const raw of rows) {
        if (!isRecord(raw)) {
          unmatched.push({
            ticker: "",
            brokerRef: "UNKNOWN:?",
            reason: "invalid-row",
            detail: "Broker holding row is not an object.",
          });
          continue;
        }
        const ticker = normalizeBrokerTicker(asText(pick(raw, [
          "tradingsymbol", "trading_symbol", "tradingSymbol", "symbol", "securitySymbol", "security_symbol",
        ])));
        const exchange = exchangeMarket(pick(raw, ["exchange", "exchangeSegment", "exchange_segment"]));
        const quantity = asNumber(pick(raw, ["quantity", "qty", "holdingQuantity", "holding_quantity", "totalQty"]));
        const averagePrice = asNumber(pick(raw, [
          "averagePrice", "average_price", "avgPrice", "avg_price", "averageCost", "avg_cost",
        ]));
        const lastPrice = asNumber(pick(raw, ["lastPrice", "last_price", "ltp", "closePrice", "close_price", "marketPrice"]));
        const isin = asText(pick(raw, ["isin", "ISIN"]));

        // An absent exchange is never assumed to be NSE: a BSE-only security
        // stored under an NSE ticker could resolve to a different company.
        if (exchange === "") {
          unmatched.push({
            ticker: ticker ?? "",
            brokerRef: `UNKNOWN:${ticker ?? "?"}`,
            reason: "invalid-row",
            detail: "missing exchange",
          });
          continue;
        }
        if (exchange !== "NSE") {
          unmatched.push({
            ticker: ticker ?? asText(raw.tradingsymbol),
            brokerRef: `${exchange}:${ticker ?? "?"}`,
            reason: "unsupported-exchange",
            detail: "INDstocks sync covers NSE holdings only; this row is on another exchange.",
          });
          continue;
        }
        if (!ticker || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averagePrice) || averagePrice <= 0) {
          unmatched.push({
            ticker: ticker ?? "",
            brokerRef: `NSE:${ticker ?? "?"}`,
            reason: "invalid-row",
            detail: "Broker holding is missing a symbol, quantity, or average price.",
          });
          continue;
        }

        holdings.push({
          market: "NSE",
          ticker,
          isin: isin || null,
          quantity,
          averagePrice,
          lastPrice: Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null,
          brokerRef: `NSE:${ticker}`,
        });
      }

      if (unmatched.length > 0) {
        warnings.push(`${unmatched.length} broker holding(s) were not imported: ${unmatched.map((row) => row.brokerRef).join(", ")}.`);
      }
      return { holdings, unmatched, warnings };
    },

    async tradeBook() {
      const rows = listFrom(await request("/trade-book"), ["trades", "tradeBook", "tradebook"], redact);
      const fills: NormalizedFill[] = [];
      const warnings: string[] = [];
      let skipped = 0;
      let nonNseSkipped = 0;
      let missingExchangeSkipped = 0;
      let malformedSkipped = 0;
      const unsupportedExchanges = new Set<string>();

      for (const raw of rows) {
        if (!isRecord(raw)) {
          skipped += 1;
          malformedSkipped += 1;
          continue;
        }

        // A fill's exchange is part of its identity. Anything that is not a
        // recognised NSE execution is skipped: emitting it as NSE would let a
        // BSE trade enter the NSE FIFO ledger. A missing exchange is reported,
        // never defaulted.
        const exchange = exchangeMarket(pick(raw, ["exchange", "exchangeSegment", "exchange_segment"]));
        if (exchange === "") {
          skipped += 1;
          missingExchangeSkipped += 1;
          continue;
        }
        if (exchange !== "NSE") {
          skipped += 1;
          nonNseSkipped += 1;
          unsupportedExchanges.add(exchange);
          continue;
        }

        const ticker = normalizeBrokerTicker(asText(pick(raw, [
          "tradingsymbol", "trading_symbol", "tradingSymbol", "symbol", "securitySymbol", "security_symbol",
        ])));
        const side = normalizeSide(pick(raw, ["transactionType", "transaction_type", "side", "tradeType", "trade_type"]));
        const quantity = asNumber(pick(raw, ["quantity", "qty", "filledQuantity", "filled_quantity", "tradeQuantity"]));
        const price = asNumber(pick(raw, [
          "averagePrice", "average_price", "price", "executedPrice", "executed_price", "tradePrice", "fillPrice",
        ]));
        const executedAt = toIso(pick(raw, [
          "exchangeTimestamp", "exchange_timestamp", "fillTime", "fill_time", "tradeTime", "trade_time",
          "executedAt", "executed_at", "orderTimestamp", "order_timestamp",
        ]));

        if (
          !ticker || !side || !executedAt ||
          !Number.isFinite(quantity) || quantity <= 0 ||
          !Number.isFinite(price) || price <= 0
        ) {
          skipped += 1;
          malformedSkipped += 1;
          continue;
        }

        const brokerId = asText(pick(raw, ["tradeId", "trade_id", "fillId", "fill_id", "executionId", "execution_id", "id"]));
        const id = brokerId
          ? `indmoney:${brokerId}`
          : `indmoney:hash:${await sha256Hex(`${ticker}|${side}|${quantity}|${price}|${executedAt}`)}`;
        fills.push({
          id,
          market: "NSE",
          ticker,
          side,
          quantity,
          price,
          executedAt,
          currency: "INR",
        });
      }

      if (nonNseSkipped > 0) {
        warnings.push(
          `${nonNseSkipped} broker trade row(s) were skipped because they are not NSE executions (` +
            `${[...unsupportedExchanges].join(", ")}).`,
        );
      }
      if (missingExchangeSkipped > 0) {
        warnings.push(
          `${missingExchangeSkipped} broker trade row(s) were skipped because the exchange was missing.`,
        );
      }
      if (malformedSkipped > 0) {
        warnings.push(`${malformedSkipped} broker trade row(s) were skipped because required fields were missing.`);
      }
      return { fills, warnings, skipped };
    },
  };
}
