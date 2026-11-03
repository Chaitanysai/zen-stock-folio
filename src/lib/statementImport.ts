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
  | "marketValue"
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
  "marketValue",
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
  /** Broker's current holding value, not sale proceeds. */
  marketValue: number | null;
  realizedPnl: number | null;
  cmp: number | null;
  remark: string | null;
  closed: boolean;
}

/** Brokers whose statements can be imported as a replaceable source. */
export type StatementBroker = "groww" | "zerodha";
export type DetectedBroker = StatementBroker | "unknown";

export interface StatementExclusion {
  rowNumber: number;
  reason: "invalid-quantity" | "missing-price";
  detail: string;
}

export type BlockSection = "realised" | "unrealised" | "mixed";

/** One independent header + data table inside a worksheet. */
export interface SheetBlockReport {
  headerRowNumber: number;
  /** First row after the block's data (exclusive); null when the block runs to the end. */
  endRowNumber: number | null;
  fields: CanonicalField[];
  section: BlockSection;
  lots: StatementLot[];
  exclusions: StatementExclusion[];
  warnings: string[];
}

export interface SheetReport {
  sheetName: string;
  sheetIndex: number;
  /** First detected header row, kept for summary display. */
  headerRowNumber: number | null;
  /** Union of every block's fields. */
  fields: CanonicalField[];
  blocks: SheetBlockReport[];
  lots: StatementLot[];
  exclusions: StatementExclusion[];
  warnings: string[];
}

export interface StatementParseResult {
  sheets: SheetReport[];
  lots: StatementLot[];
  exclusions: StatementExclusion[];
  broker: DetectedBroker;
  brokerEvidence: string[];
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
addAliases("marketValue", ["market value", "current value", "current market value", "present value"]);
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

// ── Header detection ─────────────────────────────────────────────────────────

export interface HeaderMatch {
  rowIndex: number;
  mapping: Map<number, CanonicalField>;
  fields: Set<CanonicalField>;
}

/**
 * Every row that looks like a table header: ≥1 identity column, ≥2 numeric
 * columns, and a following row whose mapped numeric cells parse as numbers.
 * One worksheet may contain several independent tables (realised and
 * unrealised sections, or a repeated header after a page break).
 */
export function detectHeaderRows(matrix: unknown[][]): HeaderMatch[] {
  const rows: HeaderMatch[] = [];

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

    const match: HeaderMatch = { rowIndex: r, mapping, fields };
    const previous = rows[rows.length - 1];
    // A two-row banner can satisfy the test twice; keep the richer adjacent row
    // as the single header instead of creating an empty block before the data.
    if (previous && r - previous.rowIndex <= 1) {
      if (fields.size > previous.fields.size) rows[rows.length - 1] = match;
      continue;
    }
    rows.push(match);
  }
  return rows;
}

/** Richest detected header row, retained for single-table callers and tests. */
export function detectHeaderRow(matrix: unknown[][]): HeaderMatch | null {
  const rows = detectHeaderRows(matrix);
  if (rows.length === 0) return null;
  return rows.reduce((best, row) => (row.fields.size > best.fields.size ? row : best));
}

function hasNumericEvidence(
  matrix: unknown[][],
  headerRow: number,
  mapping: Map<number, CanonicalField>,
): boolean {
  const numericCols = [...mapping.entries()]
    .filter(([, field]) => NUMERIC_FIELDS.includes(field))
    .map(([col]) => col);
  const identityCols = [...mapping.entries()]
    .filter(([, field]) => IDENTITY_FIELDS.includes(field))
    .map(([col]) => col);
  if (numericCols.length === 0) return false;

  for (let r = headerRow + 1; r <= Math.min(headerRow + 3, matrix.length - 1); r++) {
    const row = matrix[r] ?? [];
    if (row.length === 0 || row.every((cell) => String(cell ?? "").trim() === "")) continue;
    // The evidence row must carry an identity value; otherwise a later table's
    // data can validate a legend row that has no data under it.
    const hasIdentity = identityCols.some((col) => String(row[col] ?? "").trim() !== "");
    if (!hasIdentity) continue;
    for (const col of numericCols) {
      if (parseStatementNumber(row[col]) !== null) return true;
    }
  }
  return false;
}

// ── Sheet → lots ─────────────────────────────────────────────────────────────

const TOTAL_ROW = /^(grand\s+)?(net\s+)?total\b|^summary\b|^closing balance\b/;

export interface LotExtractionOptions {
  /** First row after this block's data (exclusive). */
  endRow?: number;
  /** Collects data rows that were rejected, for the import preview. */
  exclusions?: StatementExclusion[];
}

export function lotsFromSheet(
  matrix: unknown[][],
  header: HeaderMatch,
  warnings: string[],
  options: LotExtractionOptions = {},
): StatementLot[] {
  const lots: StatementLot[] = [];
  const endRow = Math.min(options.endRow ?? matrix.length, matrix.length);
  const exclusions = options.exclusions;
  let blankRun = 0;

  for (let r = header.rowIndex + 1; r < endRow; r++) {
    const row = matrix[r] ?? [];
    if (row.length === 0 || row.every((cell) => String(cell ?? "").trim() === "")) {
      blankRun += 1;
      if (blankRun >= 2) break;
      continue;
    }
    blankRun = 0;

    const firstText = String(row.find((cell) => String(cell ?? "").trim() !== "") ?? "").trim();
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
    if (quantity === null || quantity <= 0) {
      exclusions?.push({
        rowNumber: r + 1,
        reason: "invalid-quantity",
        detail: `Quantity "${text("quantity")}" is missing or not a positive number.`,
      });
      continue;
    }

    const buyPrice = parseStatementNumber(cell("buyPrice"));
    const buyValue = parseStatementNumber(cell("buyValue"));
    const sellPrice = parseStatementNumber(cell("sellPrice"));
    const sellValue = parseStatementNumber(cell("sellValue"));
    const marketValue = parseStatementNumber(cell("marketValue"));
    const realizedPnl = parseStatementNumber(cell("realizedPnl"));
    const cmp = parseStatementNumber(cell("cmp"));

    const buyDate = parseStatementDate(cell("buyDate"));
    const sellDate = parseStatementDate(cell("sellDate"));

    const derivedBuyPrice = buyPrice ?? (buyValue !== null ? round4(buyValue / quantity) : null);
    const derivedBuyValue = buyValue ?? (derivedBuyPrice !== null ? round4(derivedBuyPrice * quantity) : null);
    const derivedSellPrice = sellPrice ?? (sellValue !== null ? round4(sellValue / quantity) : null);
    const derivedSellValue =
      sellValue ?? (derivedSellPrice !== null ? round4(derivedSellPrice * quantity) : null);
    // Holding exports report a total current value rather than a unit price.
    const derivedCmp = cmp ?? (marketValue !== null ? round4(marketValue / quantity) : null);

    // Closure keys off sale columns only. A "Current value" column on an open
    // holding export must never read as a sale.
    const closed = sellDate !== null || derivedSellPrice !== null || sellValue !== null;

    if (derivedBuyPrice === null && derivedCmp === null && derivedSellPrice === null) {
      exclusions?.push({
        rowNumber: r + 1,
        reason: "missing-price",
        detail: "No buy price, current price, or sale value on this row.",
      });
      warnings.push(`Row ${r + 1}: no buy price or current price — skipped`);
      continue;
    }

    const derivedPnl =
      realizedPnl ??
      (derivedBuyValue !== null && derivedSellValue !== null
        ? round4(derivedSellValue - derivedBuyValue)
        : null);

    lots.push({
      ticker: symbol,
      stockName: name,
      isin,
      quantity,
      buyDate,
      buyPrice: derivedBuyPrice,
      buyValue: derivedBuyValue,
      sellDate,
      sellPrice: derivedSellPrice,
      sellValue: derivedSellValue,
      marketValue,
      realizedPnl: derivedPnl,
      cmp: derivedCmp,
      remark: text("remark") || null,
      closed,
    });
  }
  return lots;
}

const round4 = (value: number): number => Math.round(value * 10000) / 10000;
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

const sectionOf = (lots: StatementLot[]): BlockSection => {
  const closed = lots.filter((lot) => lot.closed).length;
  if (closed === 0) return "unrealised";
  if (closed === lots.length) return "realised";
  return "mixed";
};

/**
 * Broker identity from column structure and the filename, never from values:
 * Groww reports a stock name/ISIN, Zerodha's P&L export reports a symbol.
 */
export function detectStatementBroker(
  blocks: Array<{ fields: CanonicalField[]; lots: StatementLot[] }>,
  fileName?: string,
): { broker: DetectedBroker; evidence: string[] } {
  const evidence: string[] = [];
  let groww = 0;
  let zerodha = 0;

  for (const block of blocks) {
    const fields = new Set(block.fields);
    if (fields.has("symbol") && !fields.has("name")) {
      zerodha += 2;
      evidence.push("a header with a symbol/ticker column and no stock-name column");
    } else if ((fields.has("name") || fields.has("isin")) && !fields.has("symbol")) {
      groww += 2;
      evidence.push("a header with stock name/ISIN and no symbol column");
    }
    for (const lot of block.lots) {
      if (lot.ticker && !lot.stockName) zerodha += 1;
      else if (!lot.ticker && (lot.stockName || lot.isin)) groww += 1;
    }
  }

  if (fileName && /groww/i.test(fileName)) {
    groww += 3;
    evidence.push("the file name mentions Groww");
  }
  if (fileName && /(zerodha|kite)/i.test(fileName)) {
    zerodha += 3;
    evidence.push("the file name mentions Zerodha");
  }

  const broker: DetectedBroker =
    groww > zerodha ? "groww" : zerodha > groww ? "zerodha" : "unknown";
  if (broker === "unknown" && evidence.length === 0) {
    evidence.push("the column layout matches neither Groww nor Zerodha");
  }
  return { broker, evidence };
}

const TRADE_LEVEL_SHEET = /^trade\s*level$/i;
const SCRIP_LEVEL_SHEET = /^scrip\s*level$/i;

const instrumentKey = (lot: StatementLot): string | null => {
  if (lot.isin) return `isin:${lot.isin}`;
  if (lot.ticker) return `ticker:${lot.ticker}`;
  const name = lot.stockName ? normalizeNameKey(lot.stockName) : "";
  return name ? `name:${name}` : null;
};

/**
 * Groww exports the same portfolio twice: "Trade Level" has one row per lot,
 * "Scrip Level" aggregates those rows per scrip. Importing both duplicates
 * every open holding and double-counts every realised result, so the summary
 * yields to the detail whenever it adds no instrument of its own.
 */
function summarisedBy(report: SheetReport, reports: SheetReport[]): string | null {
  if (!SCRIP_LEVEL_SHEET.test(report.sheetName.trim())) return null;
  const detail = reports.find(
    (other) =>
      other !== report &&
      TRADE_LEVEL_SHEET.test(other.sheetName.trim()) &&
      other.lots.length > 0,
  );
  if (!detail) return null;
  const known = new Set(
    detail.lots.map(instrumentKey).filter((key): key is string => key !== null),
  );
  const addsInstrument = report.lots.some((lot) => {
    const key = instrumentKey(lot);
    return key === null || !known.has(key);
  });
  return addsInstrument ? null : detail.sheetName;
}

/** Parses every independent header block in every sheet. */
export function parseStatementSheets(
  sheets: Array<{ name: string; matrix: unknown[][] }>,
  options: { fileName?: string } = {},
): StatementParseResult {
  const reports: SheetReport[] = [];
  const errors: string[] = [];
  let headersFound = 0;

  sheets.forEach((sheet, sheetIndex) => {
    const headers = detectHeaderRows(sheet.matrix);
    headersFound += headers.length;
    const blocks: SheetBlockReport[] = [];

    headers.forEach((header, index) => {
      const next = headers[index + 1];
      const endRow = next ? next.rowIndex : undefined;
      const warnings: string[] = [];
      const exclusions: StatementExclusion[] = [];
      const lots = lotsFromSheet(sheet.matrix, header, warnings, {
        endRow,
        exclusions,
      });
      if (lots.length === 0 && exclusions.length === 0) return;
      blocks.push({
        headerRowNumber: header.rowIndex + 1,
        endRowNumber: next ? next.rowIndex : null,
        fields: [...header.fields],
        section: sectionOf(lots),
        lots,
        exclusions,
        warnings,
      });
    });

    if (blocks.length === 0) return;
    reports.push({
      sheetName: sheet.name,
      sheetIndex,
      headerRowNumber: blocks[0].headerRowNumber,
      fields: [...new Set(blocks.flatMap((block) => block.fields))],
      blocks,
      lots: blocks.flatMap((block) => block.lots),
      exclusions: blocks.flatMap((block) => block.exclusions),
      warnings: blocks.flatMap((block) => block.warnings),
    });
  });

  const summaryWarnings: string[] = [];
  const kept = reports.filter((report) => {
    const detail = summarisedBy(report, reports);
    if (detail === null) return true;
    summaryWarnings.push(
      `${report.sheetName} mirrors ${detail} per scrip; the summary sheet was skipped so holdings are not counted twice.`,
    );
    return false;
  });

  if (kept.length === 0) {
    errors.push(
      headersFound > 0
        ? "Statement header found but no usable data rows — check that rows contain quantity and price values."
        : "No statement header found in any sheet. Expected broker P&L columns such as Symbol/Stock name, ISIN, Quantity, Buy price, Sell price.",
    );
  }

  const lots = kept.flatMap((report) => report.lots);
  const exclusions = kept.flatMap((report) => report.exclusions);
  const warnings = kept.flatMap((report) =>
    report.warnings.map((warning) => `${report.sheetName}: ${warning}`),
  );
  warnings.push(...summaryWarnings);

  const hasUsIsin = lots.some((lot) => lot.isin?.startsWith("US"));
  if (hasUsIsin) {
    warnings.push(
      "US-listed holdings detected: values are imported exactly as the statement states them (USD) — currency conversion lands with US market support.",
    );
  }

  const detection = detectStatementBroker(
    kept.flatMap((report) => report.blocks),
    options.fileName,
  );

  return {
    sheets: kept,
    lots,
    exclusions,
    broker: detection.broker,
    brokerEvidence: detection.evidence,
    warnings,
    errors,
  };
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

export interface MapLotOptions {
  source: StatementBroker;
  /** Stable identity of this row inside the broker's statements. */
  fingerprint: string;
}

export function toPortfolioStock(
  resolved: ResolvedLot,
  options: MapLotOptions,
): PortfolioStock | null {
  const { lot, symbol } = resolved;
  // A missing source or fingerprint would make broker replacement unsafe.
  if (!symbol || !options?.source || !options.fingerprint) return null;

  // The statement's own buy price only. CMP is a market price, never a cost.
  const entryPrice = lot.buyPrice !== null && lot.buyPrice > 0 ? lot.buyPrice : null;
  // `0` is the stored "no market price" sentinel, not a ₹0 valuation.
  const cmp = lot.cmp !== null && Number.isFinite(lot.cmp) && lot.cmp > 0 ? lot.cmp : 0;
  const exitPrice =
    lot.closed && lot.sellPrice !== null && lot.sellPrice > 0 ? lot.sellPrice : null;

  if (entryPrice === null && cmp === 0 && exitPrice === null) return null;

  let status: PortfolioStock["status"];
  if (!lot.closed) {
    status = "Active";
  } else if (exitPrice === null || entryPrice === null) {
    // Closed with no usable exit price or no cost: P&L is unavailable, so the
    // row must not be labelled as a profit or a loss.
    status = "Sold";
  } else {
    const pnlPerShare =
      lot.realizedPnl !== null ? lot.realizedPnl / lot.quantity : exitPrice - entryPrice;
    status = pnlPerShare >= 0 ? "Sold Profit" : "Sold Loss";
  }

  const stock: PortfolioStock = {
    ticker: clamp(symbol, MAX_TICKER_CHARS),
    stockName: clamp(lot.stockName ?? symbol, MAX_TEXT_CHARS),
    entryPrice,
    cmp,
    quantity: lot.quantity,
    status,
    source: options.source,
    statementFingerprint: options.fingerprint,
  };
  // No transaction date in the statement means the date is unknown; it is
  // never replaced with the import date.
  if (lot.buyDate) stock.entryDate = clamp(lot.buyDate, 40);
  if (exitPrice !== null) stock.exitPrice = exitPrice;
  if (lot.closed && lot.sellDate) stock.exitDate = clamp(lot.sellDate, 40);
  // Identity and the broker's own result are kept for reconciliation; neither
  // substitutes for a missing cost or price.
  if (lot.isin) stock.isin = clamp(lot.isin, 24);
  if (lot.closed && lot.realizedPnl !== null && Number.isFinite(lot.realizedPnl)) {
    stock.statementPnl = lot.realizedPnl;
  }
  return stock;
}

/**
 * Stable, broker-scoped identities for one statement.
 *
 * Only attributes the statement actually carries are included: never the
 * import date and never the current market price, so re-importing the same
 * file produces the same fingerprints. A per-statement occurrence suffix
 * keeps genuinely identical lots distinct instead of collapsing them.
 */
export function assignFingerprints(lots: StatementLot[], source: StatementBroker): string[] {
  const seen = new Map<string, number>();
  return lots.map((lot) => {
    const base = [
      source,
      lot.isin ?? "",
      lot.ticker ?? "",
      lot.stockName ? normalizeNameKey(lot.stockName) : "",
      lot.buyDate ?? "",
      lot.sellDate ?? "",
      lot.quantity,
      lot.buyValue ?? "",
      lot.buyPrice ?? "",
      lot.sellValue ?? "",
      lot.sellPrice ?? "",
      lot.realizedPnl ?? "",
    ].join("|");
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return `${base}#${occurrence}`;
  });
}

/**
 * Stable identity of a holding row, shared by the template CSV import and
 * manual entries, so re-importing the same template never duplicates history.
 */
export function statementKey(
  stock: Pick<PortfolioStock, "ticker" | "entryDate" | "entryPrice" | "quantity" | "exitDate">,
): string {
  return [
    stock.ticker.trim().toUpperCase(),
    stock.entryDate?.trim() ?? "",
    stock.quantity,
    stock.entryPrice ?? "",
    stock.exitDate?.trim() ?? "",
  ].join("|");
}
