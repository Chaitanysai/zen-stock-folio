/**
 * Broker P&L statement import engine.
 *
 * Broker exports (Groww, Zerodha, Upstox, Dhan, INDmoney) share one shape: a
 * metadata banner of arbitrary height, a header row anywhere in the sheet, then
 * one row per buy→sell lot — open lots simply have empty sell columns. This
 * module finds the header row by alias matching plus numeric evidence, maps
 * columns through a combined alias dictionary, and normalises Indian number
 * grouping and broker date formats into `PortfolioStock` rows.
 *
 * Pure logic only: the dialog supplies sheet matrices and identity resolution.
 */

import type { PortfolioStock } from "@/data/sampleData";

// ── Canonical model ──────────────────────────────────────────────────────────

export type CanonicalField =
  | "symbol"
  | "name"
  | "isin"
  | "quantity"
  | "buyDate"
  | "buyPrice"
  | "buyValue"
  | "sellDate"
  | "sellPrice"
  | "sellValue"
  | "realizedPnl"
  | "cmp"
  | "remark";

const IDENTITY_FIELDS: CanonicalField[] = ["symbol", "name", "isin"];
const NUMERIC_FIELDS: CanonicalField[] = [
  "quantity",
  "buyPrice",
  "buyValue",
  "sellPrice",
  "sellValue",
  "realizedPnl",
  "cmp",
];

export interface StatementLot {
  ticker: string | null;
  stockName: string | null;
  isin: string | null;
  quantity: number;
  buyDate: string | null;
  buyPrice: number | null;
  buyValue: number | null;
  sellDate: string | null;
  sellPrice: number | null;
  sellValue: number | null;
  realizedPnl: number | null;
  cmp: number | null;
  remark: string | null;
  closed: boolean;
}

export interface SheetReport {
  sheetName: string;
  sheetIndex: number;
  headerRowNumber: number | null;
  fields: CanonicalField[];
  lots: StatementLot[];
  warnings: string[];
}

export interface StatementParseResult {
  sheets: SheetReport[];
  lots: StatementLot[];
  warnings: string[];
  errors: string[];
}

// ── Alias dictionary ─────────────────────────────────────────────────────────
// Keys are header cells after `normalizeHeaderCell`. Vocabularies of Groww,
// Zerodha Console/backoffice, Upstox, Dhan and INDmoney exports (broker-format
// coverage beyond Groww/Zerodha is unverified against real samples so far).

const ALIASES: Record<string, CanonicalField> = {};
const addAliases = (field: CanonicalField, values: string[]): void => {
  for (const value of values) {
    const key = normalizeHeaderCell(value);
    if (key && !(key in ALIASES)) ALIASES[key] = field;
  }
};

addAliases("symbol", [
  "symbol", "ticker", "trading symbol", "trading symbol", "scrip", "scrip code",
  "scrip name", "script name", "security", "security name", "instrument",
  "nse code", "bse code", "stock symbol", "stock code", "stock/etf name",
  "stock ticker", "ticker symbol",
]);
addAliases("name", [
  "stock name", "company", "company name", "security full name", "stock",
  "stock description", "issuer", "fund name", "asset name",
]);
addAliases("isin", ["isin", "isin number", "isin code"]);
addAliases("quantity", [
  "quantity", "qty", "no of shares", "number of shares", "shares", "units",
  "no of units", "filled quantity", "traded quantity", "buy qty", "sell qty",
  "buy quantity", "sell quantity", "total qty", "net qty",
]);
addAliases("buyDate", [
  "buy date", "purchase date", "acquisition date", "buy date time",
  "trade date", "transaction date", "date of purchase", "investment date",
  "purchase date time",
]);
addAliases("buyPrice", [
  "buy price", "buy average", "average buy price", "avg buy price",
  "avg price", "average price", "purchase price", "buy rate", "cost price",
  "weighted avg price", "weighted average price", "average cost",
  "buy avg", "avg cost", "average cost price",
]);
addAliases("buyValue", [
  "buy value", "purchase value", "invested amount", "invested value",
  "investment value", "cost value", "amount invested", "buy amount",
]);
addAliases("sellDate", [
  "sell date", "exit date", "sale date", "date of sale", "sell date time",
  "redemption date", "date of exit", "sold date", "settlement date",
]);
addAliases("sellPrice", [
  "sell price", "sell average", "average sell price", "avg sell price",
  "sell rate", "sale price", "exit price", "selling price", "sold price",
  "sell avg",
]);
addAliases("sellValue", [
  "sell value", "sale value", "exit value", "sell amount", "sold value",
  "realised value", "realized value", "redemption value",
]);
addAliases("realizedPnl", [
  "realised p&l", "realized p&l", "realised pnl", "realized pnl",
  "realised profit", "realized profit", "realised profit and loss",
  "net p&l", "net pnl", "p&l", "pnl", "profit", "profit and loss",
  "gain loss", "gain/loss", "profit loss", "returns", "unrealised p&l",
  "unrealized p&l", "unrealised pnl", "unrealized pnl", "current p&l",
  "net profit", "total p&l", "total pnl", "total returns",
]);
addAliases("cmp", [
  "cmp", "current price", "market price", "ltp", "last traded price",
  "current value per unit", "market value per unit", "present price",
  "current market price", "closing price", "close price",
  "last price", "last close price",
]);
addAliases("sellValue", ["market value", "current value", "current market value", "present value"]);
addAliases("remark", [
  "remark", "remarks", "note", "notes", "comment", "comments",
]);

/** Alias keys that resolve differently per context must not exist; assert in tests. */
export const aliasDictionary = (): Record<string, CanonicalField> => ({ ...ALIASES });

export function normalizeHeaderCell(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u00a0\u200b]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9&/ ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Number normalisation ─────────────────────────────────────────────────────

const NUM_NOISE = /[\u00a0\u200b\s]|₹|\$|rs\.?|inr|usd|%|per share/gi;

/** Indian-grouped ("1,23,456.75"), parenthesised negative, currency-suffixed. */
export function parseStatementNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let text = String(raw ?? "").trim();
  if (!text) return null;
  text = text.replace(NUM_NOISE, "");
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^\+/, "").replace(/−/g, "-");
  text = text.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative && value > 0 ? -value : value;
}

// ── Date normalisation ───────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Returns `dd MMM yyyy` (the app's stored entryDate format) or null. */
export function parseStatementDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatDay(raw.getUTCDate(), raw.getUTCMonth() + 1, raw.getUTCFullYear());
  }
  const text = String(raw ?? "").trim();
  if (!text) return null;

  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
  if (match) return fromParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(text);
  if (match) {
    const year = normalizeYear(Number(match[3]));
    return fromParts(year, Number(match[2]), Number(match[1]));
  }

  match = /^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/.exec(text);
  if (match) {
    const month = monthOf(match[2]);
    if (month) return fromParts(normalizeYear(Number(match[3])), month, Number(match[1]));
  }

  match = /^([A-Za-z]{3,9})[-/ ](\d{1,2}),?[-/ ](\d{2,4})$/.exec(text);
  if (match) {
    const month = monthOf(match[1]);
    if (month) return fromParts(normalizeYear(Number(match[3])), month, Number(match[2]));
  }

  // Excel-style serial (as number-as-string): 45352 → 2024-03-01.
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      return formatDay(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear());
    }
  }

  const fallback = Date.parse(text);
  if (!Number.isNaN(fallback)) {
    const date = new Date(fallback);
    return formatDay(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear());
  }
  return null;
}

function monthOf(text: string): number | null {
  return MONTHS[text.slice(0, 4).toLowerCase()] ?? MONTHS[text.slice(0, 3).toLowerCase()] ?? null;
}

function normalizeYear(year: number): number {
  if (year >= 1000) return year;
  return year < 70 ? 2000 + year : 1900 + year;
}

function fromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1) return null;
  return formatDay(day, month, year);
}

function formatDay(day: number, month: number, year: number): string | null {
  if (year < 1990 || year > 2100) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(day).padStart(2, "0")} ${months[month - 1]} ${year}`;
}

export const todayStamp = (): string =>
  formatDay(
    new Date().getDate(),
    new Date().getMonth() + 1,
    new Date().getFullYear(),
  ) ?? "01 Jan 2000";

// ── Header detection ─────────────────────────────────────────────────────────

export interface HeaderMatch {
  rowIndex: number;
  mapping: Map<number, CanonicalField>;
  fields: Set<CanonicalField>;
}

/**
 * Finds the header row: a row matching ≥1 identity column and ≥2 numeric
 * columns, followed within 3 rows by a row whose mapped numeric cells parse as
 * numbers (rejects legends and "column description" blocks).
 */
export function detectHeaderRow(matrix: unknown[][]): HeaderMatch | null {
  let best: HeaderMatch | null = null;

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const mapping = new Map<number, CanonicalField>();
    for (let c = 0; c < row.length; c++) {
      const field = ALIASES[normalizeHeaderCell(row[c])];
      if (field && ![...mapping.values()].includes(field)) mapping.set(c, field);
    }
    const fields = new Set(mapping.values());
    const identity = IDENTITY_FIELDS.filter((f) => fields.has(f)).length;
    const numeric = NUMERIC_FIELDS.filter((f) => fields.has(f)).length;
    if (identity < 1 || numeric < 2) continue;

    if (!hasNumericEvidence(matrix, r, mapping)) continue;

    if (!best || fields.size > best.fields.size) {
      best = { rowIndex: r, mapping, fields };
      if (fields.size >= 9) break;
    }
  }
  return best;
}

function hasNumericEvidence(
  matrix: unknown[][],
  headerRow: number,
  mapping: Map<number, CanonicalField>,
): boolean {
  const numericCols = [...mapping.entries()]
    .filter(([, field]) => NUMERIC_FIELDS.includes(field))
    .map(([col]) => col);
  if (numericCols.length === 0) return false;

  for (let r = headerRow + 1; r <= Math.min(headerRow + 3, matrix.length - 1); r++) {
    const row = matrix[r] ?? [];
    if (row.length === 0 || row.every((cell) => String(cell ?? "").trim() === "")) continue;
    for (const col of numericCols) {
      if (parseStatementNumber(row[col]) !== null) return true;
    }
  }
  return false;
}

// ── Sheet → lots ─────────────────────────────────────────────────────────────

const TOTAL_ROW = /^(grand\s+)?(net\s+)?total\b|^summary\b|^closing balance\b/;

export function lotsFromSheet(
  matrix: unknown[][],
  header: HeaderMatch,
  warnings: string[],
): StatementLot[] {
  const lots: StatementLot[] = [];
  let blankRun = 0;

  for (let r = header.rowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (row.length === 0 || row.every((cell) => String(cell ?? "").trim() === "")) {
      blankRun += 1;
      if (blankRun >= 2) break;
      continue;
    }
    blankRun = 0;

    const firstText = String(row[0] ?? "").trim();
    if (TOTAL_ROW.test(firstText.toLowerCase())) break;

    const cell = (field: CanonicalField): unknown => {
      for (const [col, mapped] of header.mapping) {
        if (mapped === field) return row[col];
      }
      return undefined;
    };
    const text = (field: CanonicalField): string => String(cell(field) ?? "").trim();

    const isinRaw = text("isin").toUpperCase().replace(/\s/g, "");
    const isin = ISIN_RE.test(isinRaw) ? isinRaw : null;
    const symbol = text("symbol").toUpperCase().replace(/\s+/g, "") || null;
    const name = text("name") || null;
    if (!isin && !symbol && !name) continue;

    const quantity = parseStatementNumber(cell("quantity"));
    const buyPrice = parseStatementNumber(cell("buyPrice"));
    const buyValue = parseStatementNumber(cell("buyValue"));
    const sellPrice = parseStatementNumber(cell("sellPrice"));
    const sellValue = parseStatementNumber(cell("sellValue"));
    const realizedPnl = parseStatementNumber(cell("realizedPnl"));
    const cmp = parseStatementNumber(cell("cmp"));
    if (quantity === null || quantity <= 0) continue;

    const buyDate = parseStatementDate(cell("buyDate"));
    const sellDate = parseStatementDate(cell("sellDate"));
    // An "Invested/Current value" pair on open-holding exports must not read
    // as a closed lot, so closure keys off the sell date/price only.
    const closed = sellDate !== null || sellPrice !== null;

    const derivedBuyPrice = buyPrice ?? (buyValue !== null ? round4(buyValue / quantity) : null);
    const derivedBuyValue = buyValue ?? (derivedBuyPrice !== null ? round4(derivedBuyPrice * quantity) : null);
    const derivedSellValue = sellValue ?? (sellPrice !== null ? round4(sellPrice * quantity) : null);
    const derivedPnl =
      realizedPnl ??
      (derivedBuyValue !== null && derivedSellValue !== null
        ? round4(derivedSellValue - derivedBuyValue)
        : null);

    if (derivedBuyPrice === null && cmp === null) {
      warnings.push(`Row ${r + 1}: no buy price or current price — skipped`);
      continue;
    }

    lots.push({
      ticker: symbol,
      stockName: name,
      isin,
      quantity,
      buyDate,
      buyPrice: derivedBuyPrice,
      buyValue: derivedBuyValue,
      sellDate,
      sellPrice,
      sellValue: derivedSellValue,
      realizedPnl: derivedPnl,
      cmp,
      remark: text("remark") || null,
      closed,
    });
  }
  return lots;
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;


/** Parses every sheet that carries a detectable statement header. */
export function parseStatementSheets(
  sheets: Array<{ name: string; matrix: unknown[][] }>,
): StatementParseResult {
  const reports: SheetReport[] = [];
  const errors: string[] = [];

  sheets.forEach((sheet, sheetIndex) => {
    const header = detectHeaderRow(sheet.matrix);
    if (!header) return;
    const warnings: string[] = [];
    const lots = lotsFromSheet(sheet.matrix, header, warnings);
    if (lots.length === 0) return;
    reports.push({
      sheetName: sheet.name,
      sheetIndex,
      headerRowNumber: header.rowIndex + 1,
      fields: [...header.fields],
      lots,
      warnings,
    });
  });

  if (reports.length === 0) {
    const headerFound = sheets.some((sheet) => detectHeaderRow(sheet.matrix) !== null);
    errors.push(
      headerFound
        ? "Statement header found but no usable data rows — check that rows contain quantity and price values."
        : "No statement header found in any sheet. Expected broker P&L columns such as Symbol/Stock name, ISIN, Quantity, Buy price, Sell price.",
    );
  }

  const lots = reports.flatMap((report) => report.lots);
  const warnings = reports.flatMap((report) =>
    report.warnings.map((warning) => `${report.sheetName}: ${warning}`),
  );

  const hasUsIsin = lots.some((lot) => lot.isin?.startsWith("US"));
  if (hasUsIsin) {
    warnings.push(
      "US-listed holdings detected: values are imported exactly as the statement states them (USD) — currency conversion lands with US market support.",
    );
  }

  return { sheets: reports, lots, warnings, errors };
}

// ── Identity resolution ──────────────────────────────────────────────────────

export interface IsinRow {
  /** NSE trading symbol. */
  s: string;
  /** ISIN. */
  i: string;
  /** Company name. */
  n: string;
}

export interface IsinMapData {
  /** Rows are [symbol, isin, name]; typed as string[][] so the JSON module's
   * inferred `string[][]` (resolveJsonModule) is directly assignable. */
  equities: string[][];
}

export interface IsinResolver {
  byIsin(isin: string): IsinRow | null;
  byName(name: string): IsinRow | null;
  size: number;
}

export function createIsinResolver(data: IsinMapData | { default: IsinMapData }): IsinResolver {
  const source = "equities" in data ? data : data.default;
  const byIsin = new Map<string, IsinRow>();
  const byName = new Map<string, IsinRow[]>();

  for (const [symbol, isin, name] of source.equities) {
    const row: IsinRow = { s: symbol, i: isin, n: name };
    byIsin.set(isin, row);
    const key = normalizeNameKey(name);
    if (key) {
      const list = byName.get(key);
      if (list) list.push(row);
      else byName.set(key, [row]);
    }
  }

  return {
    byIsin: (isin) => byIsin.get(isin.trim().toUpperCase()) ?? null,
    byName: (name) => {
      const list = byName.get(normalizeNameKey(name));
      return list && list.length === 1 ? list[0] : null;
    },
    size: byIsin.size,
  };
}

/** Collateral suffixes so "RELIANCE INDUSTRIES LTD" matches "Reliance Industries". */
export function normalizeNameKey(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !["ltd", "limited", "pvt", "private"].includes(token))
    .join(" ");
}

export type ResolutionSource = "symbol" | "isin" | "name" | "search" | "unresolved";

export interface ResolvedLot {
  lot: StatementLot;
  symbol: string | null;
  source: ResolutionSource;
}

/**
 * Resolution precedence: the statement's own symbol column, an exact ISIN hit,
 * a unique name hit. Anything else is returned unresolved — the dialog may run
 * a search fallback and call `applySearchSymbol` for those rows.
 */
export function resolveLots(lots: StatementLot[], resolver: IsinResolver | null): ResolvedLot[] {
  return lots.map((lot) => {
    if (lot.ticker) return { lot, symbol: lot.ticker, source: "symbol" as const };
    if (lot.isin && resolver) {
      const hit = resolver.byIsin(lot.isin);
      if (hit) return { lot, symbol: hit.s, source: "isin" as const };
    }
    if (lot.stockName && resolver) {
      const hit = resolver.byName(lot.stockName);
      if (hit) return { lot, symbol: hit.s, source: "name" as const };
    }
    return { lot, symbol: null, source: "unresolved" as const };
  });
}

export const applySearchSymbol = (resolved: ResolvedLot, symbol: string): ResolvedLot =>
  resolved.source === "unresolved" ? { ...resolved, symbol: symbol.toUpperCase(), source: "search" } : resolved;

// ── Portfolio mapping ────────────────────────────────────────────────────────

/** Bound on persisted free-text fields, so a hostile row cannot bloat the snapshot. */
const MAX_TEXT_CHARS = 200;
const MAX_TICKER_CHARS = 24;
const clamp = (value: string, max: number): string => value.slice(0, max);

export function toPortfolioStock(resolved: ResolvedLot): PortfolioStock | null {
  const { lot, symbol } = resolved;
  if (!symbol) return null;

  const entryPrice = lot.buyPrice ?? lot.cmp ?? 0;
  if (entryPrice <= 0) return null;
  const cmp = lot.cmp ?? entryPrice;
  const status: PortfolioStock["status"] = !lot.closed
    ? "Active"
    : (lot.realizedPnl ?? (lot.sellPrice !== null && lot.buyPrice !== null ? lot.sellPrice - lot.buyPrice : 0)) >= 0
      ? "Sold Profit"
      : "Sold Loss";

  return {
    ticker: clamp(symbol, MAX_TICKER_CHARS),
    stockName: clamp(lot.stockName ?? symbol, MAX_TEXT_CHARS),
    entryDate: clamp(lot.buyDate ?? todayStamp(), 40),
    entryPrice,
    cmp,
    weekHigh52: cmp,
    quantity: lot.quantity,
    ...(lot.closed && lot.sellPrice !== null ? { exitPrice: lot.sellPrice } : {}),
    ...(lot.closed && lot.sellDate ? { exitDate: clamp(lot.sellDate, 40) } : {}),
    status,
  };
}

/**
 * Stable identity of a holding row, shared by statement imports and manual
 * entries, so re-importing the same statement never duplicates history.
 */
export function statementKey(stock: Pick<PortfolioStock, "ticker" | "entryDate" | "entryPrice" | "quantity" | "exitDate">): string {
  return [
    stock.ticker.trim().toUpperCase(),
    stock.entryDate.trim(),
    stock.quantity,
    stock.entryPrice,
    stock.exitDate?.trim() ?? "",
  ].join("|");
}
