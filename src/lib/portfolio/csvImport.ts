import type { PortfolioStock } from "../../data/sampleData.ts";
import { buildManualPosition } from "./manual.ts";

export const REQUIRED_FIELDS = ["ticker", "stockName", "entryPrice", "cmp", "quantity"];

/** Refuse oversized files before buffering: an XLSX is a zip, so a small file
 * can inflate to arbitrary size in memory and on the main thread. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
/** Bound on persisted free-text fields, so a hostile row cannot store a
 * megabyte-long name that later bloats the snapshot and the export. */
export const MAX_FIELD_CHARS = 200;

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

const clampText = (value: string): string => value.slice(0, MAX_FIELD_CHARS);

export const COLUMN_MAP: Record<string, string> = {
  ticker: "ticker",
  symbol: "ticker",
  stock_ticker: "ticker",
  stockname: "stockName",
  stock_name: "stockName",
  name: "stockName",
  "stock name": "stockName",
  market: "market",
  exchange: "market",
  currency: "currency",
  fxatcost: "fxAtCost",
  fx_at_cost: "fxAtCost",
  "fx at cost": "fxAtCost",
  "usd inr": "fxAtCost",
  "rate at cost": "fxAtCost",
  entrydate: "entryDate",
  entry_date: "entryDate",
  "entry date": "entryDate",
  date: "entryDate",
  entryprice: "entryPrice",
  entry_price: "entryPrice",
  "entry price": "entryPrice",
  "buy price": "entryPrice",
  buyprice: "entryPrice",
  cmp: "cmp",
  "current price": "cmp",
  currentprice: "cmp",
  ltp: "cmp",
  weekhigh52: "weekHigh52",
  "52w high": "weekHigh52",
  "52 week high": "weekHigh52",
  quantity: "quantity",
  qty: "quantity",
  exitprice: "exitPrice",
  exit_price: "exitPrice",
  "exit price": "exitPrice",
  "sell price": "exitPrice",
  sellprice: "exitPrice",
  exitdate: "exitDate",
  exit_date: "exitDate",
  "exit date": "exitDate",
  status: "status",
};

function normalizeHeader(header: string): string | null {
  const key = header.trim().toLowerCase().replace(/[^a-z0-9 _]/g, "");
  return COLUMN_MAP[key] || null;
}

function parseStatus(val: string | undefined): PortfolioStock["status"] {
  if (!val) return "Active";
  const v = val.toLowerCase().trim();
  if (v.includes("profit") || v === "sold profit") return "Sold Profit";
  if (v.includes("loss") || v === "sold loss") return "Sold Loss";
  if (v.includes("sold") || v.includes("closed") || v.includes("exit")) return "Sold Profit";
  return "Active";
}

const US_MARKETS = new Set(["US", "NASDAQ", "NYSE", "NYSEARCA"]);
const NSE_MARKETS = new Set(["NSE", "NSEEQ"]);

/**
 * Blank defaults to NSE, a recognized exchange maps to its market, and any
 * other non-empty value is an error: silently re-labelling an LSE row as NSE
 * would persist rupee prices that were never rupees.
 */
function parseMarket(val: string): "NSE" | "US" | null {
  const v = val.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!v) return "NSE";
  if (US_MARKETS.has(v)) return "US";
  if (NSE_MARKETS.has(v)) return "NSE";
  return null;
}

export function parseRows(data: Record<string, string>[]): { parsed: PortfolioStock[]; errors: string[] } {
  const parsed: PortfolioStock[] = [];
  const errors: string[] = [];

  if (data.length === 0) {
    errors.push("No data rows found in file");
    return { parsed, errors };
  }

  const rawHeaders = Object.keys(data[0]);
  const headerMap: Record<string, string> = {};
  rawHeaders.forEach((h) => {
    const mapped = normalizeHeader(h);
    if (mapped) headerMap[h] = mapped;
  });

  const mappedFields = new Set(Object.values(headerMap));
  const missing = REQUIRED_FIELDS.filter((f) => !mappedFields.has(f));
  if (missing.length > 0) {
    errors.push(`Missing required columns: ${missing.join(", ")}. Found: ${rawHeaders.join(", ")}`);
    return { parsed, errors };
  }

  data.forEach((row, i) => {
    const mapped: Record<string, string> = {};
    Object.entries(headerMap).forEach(([raw, field]) => {
      mapped[field] = row[raw]?.toString().trim() || "";
    });

    if (!mapped.ticker || !mapped.entryPrice || !mapped.quantity) {
      errors.push(`Row ${i + 2}: Missing ticker, entry price, or quantity`);
      return;
    }

    const market = parseMarket(mapped.market ?? "");
    if (market === null) {
      errors.push(`Row ${i + 2}: Unknown market "${mapped.market}" for ${mapped.ticker}. Use NSE or US.`);
      return;
    }

    // The market decides the currency. A Currency cell can confirm it, but a
    // contradiction (INR on a US row) is a data error, not something to
    // silently override or preserve.
    const expectedCurrency = market === "US" ? "USD" : "INR";
    const declaredCurrency = (mapped.currency ?? "").toUpperCase();
    if (declaredCurrency && declaredCurrency !== expectedCurrency) {
      errors.push(
        `Row ${i + 2}: Currency ${mapped.currency} contradicts market ${market} for ${mapped.ticker}. Leave it blank or use ${expectedCurrency}.`,
      );
      return;
    }

    // Number, not parseFloat/parseInt: "10abc" and "1.5" must reach the same
    // guards as manual entry instead of being truncated to a plausible number.
    const entryPrice = Number(mapped.entryPrice);
    const quantity = Number(mapped.quantity);

    // isFinite, not isNaN: "Infinity" parses and would poison every KPI.
    if (!Number.isFinite(entryPrice) || !Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Row ${i + 2}: Invalid price or quantity for ${mapped.ticker}`);
      return;
    }

    const status = parseStatus(mapped.status);
    const exitPrice = Number(mapped.exitPrice);
    const hasExitPrice = Number.isFinite(exitPrice) && exitPrice > 0;
    if (status !== "Active" && !hasExitPrice) {
      errors.push(`Row ${i + 2}: Missing exit price for closed trade ${mapped.ticker}`);
      return;
    }

    const fxAtCost = parseFloat(mapped.fxAtCost);
    const stock = buildManualPosition({
      market,
      ticker: clampText(mapped.ticker.toUpperCase()),
      stockName: clampText(mapped.stockName || mapped.ticker.toUpperCase()),
      entryDate: mapped.entryDate ? clampText(mapped.entryDate) : undefined,
      entryPrice,
      quantity,
      cmp: parseFloat(mapped.cmp) || undefined,
      weekHigh52: parseFloat(mapped.weekHigh52) || undefined,
      status,
      ...(hasExitPrice ? { exitPrice } : {}),
      ...(mapped.exitDate ? { exitDate: clampText(mapped.exitDate) } : {}),
      ...(Number.isFinite(fxAtCost) && fxAtCost > 0 ? { fxAtCost } : {}),
    });

    if (!stock) {
      // Same ticker/quantity rules as the Add Trade dialog.
      errors.push(`Row ${i + 2}: Invalid trade for ${mapped.ticker}`);
      return;
    }

    parsed.push(stock);
  });

  return { parsed, errors };
}

export const SAMPLE_CSV = `Ticker,Stock Name,Market,Currency,FX at cost,Entry Date,Entry Price,CMP,52W High,Quantity,Exit Price,Exit Date,Status
RELIANCE,Reliance Industries,NSE,INR,,10-Jan-2026,2450,2612.35,2856.15,15,,,Active
AAPL,Apple Inc,US,USD,80,02-Jan-2026,100,120,130,10,,,Active
INFY,Infosys,NSE,INR,,12-Dec-2025,1890,1756.4,2012,20,1756.4,28-Feb-2026,Sold Loss`;
