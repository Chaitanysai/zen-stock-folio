import { describe, expect, it } from "vitest";
import {
  applySearchSymbol,
  assignFingerprints,
  createIsinResolver,
  detectHeaderRow,
  detectStatementBroker,
  lotsFromSheet,
  parseStatementDate,
  parseStatementNumber,
  parseStatementSheets,
  resolveLots,
  statementKey,
  toPortfolioStock,
  type HeaderMatch,
  type ResolvedLot,
  type StatementBroker,
  type StatementLot,
} from "@/lib/statementImport";

/** Groww-style P&L sheet: 30 metadata rows, header row 31, mixed open/closed lots. */
const GROWW_MATRIX: unknown[][] = [
  ["Tax P&L report", "", "", "", "", "", "", "", "", "", ""],
  ...Array.from({ length: 29 }, (_, i) => [`Metadata row ${i + 2}`, "", "", "", "", "", "", "", "", "", ""]),
  [
    "Stock name", "ISIN", "Quantity", "Buy date", "Buy price", "Buy value",
    "Sell date", "Sell price", "Sell value", "Realised P&L", "Remark",
  ],
  ["Reliance Industries", "INE002A01018", "15", "01-03-2024", "2,450.50", "36,757.50", "", "", "", "", ""],
  ["Infosys", "INE009A01021", "20", "12-Dec-2025", "1,890", "37,800", "28-Feb-2026", "1,756.40", "35,128", "-2,672", ""],
  ["Tata Consultancy", "INE467I01027", "(5)", "05-06-2025", "3,900", "19,500", "10-09-2025", "4,100", "20,500", "1,000", "PARTIAL"],
  ["Grand Total", "", "", "", "", "94,057.50", "", "", "", "", ""],
];

const ZERODHA_MATRIX: unknown[][] = [
  ["Stocks P&L report", ""],
  ["Name", "Kandula Chaitanya Sai"],
  ["Symbol", "ISIN", "Quantity", "Buy Date", "Buy Average", "Sell Date", "Sell Average", "Realised"],
  ["RELIANCE", "INE002A01018", "10", "2024-03-01", "2,450.50", "2024-05-10", "2,610.00", ""],
  ["INFY", "INE009A01021", "5", "2025-12-12", "1,890", "", "", ""],
];

const matrixOf = (rows: unknown[][]): { name: string; matrix: unknown[][] }[] => [{ name: "Stocks", matrix: rows }];

const resultOf = (matrix: unknown[][], fileName?: string) => {
  const result = parseStatementSheets(matrixOf(matrix), fileName ? { fileName } : {});
  expect(result.errors, result.errors.join("; ")).toEqual([]);
  return result;
};

const resolver = createIsinResolver({
  equities: [
    ["RELIANCE", "INE002A01018", "Reliance Industries Ltd"],
    ["INFY", "INE009A01021", "Infosys Ltd"],
    ["TCS", "INE467I01027", "Tata Consultancy Services Ltd"],
  ],
});

const headerOf = (matrix: unknown[][]): HeaderMatch => {
  const header = detectHeaderRow(matrix);
  expect(header, "header row must be detected").toBeTruthy();
  return header!;
};

const lot = (over: Partial<StatementLot> = {}): StatementLot => ({
  ticker: null, stockName: null, isin: null, quantity: 1,
  buyDate: null, buyPrice: 10, buyValue: 10, sellDate: null, sellPrice: null,
  sellValue: null, marketValue: null, realizedPnl: null, cmp: null, remark: null, closed: false,
  ...over,
});

const mapResolved = (
  resolved: ResolvedLot[],
  source: StatementBroker = "groww",
) => {
  const fingerprints = assignFingerprints(resolved.map((row) => row.lot), source);
  return resolved
    .map((row, index) => toPortfolioStock(row, { source, fingerprint: fingerprints[index] }))
    .filter((stock): stock is NonNullable<typeof stock> => stock !== null);
};

describe("statement number policy", () => {
  it("parses Indian grouping, currency and parenthesised negatives", () => {
    expect(parseStatementNumber("1,23,456.75")).toBe(123456.75);
    expect(parseStatementNumber("₹ 12,340")).toBe(12340);
    expect(parseStatementNumber("(500)")).toBe(-500);
    expect(parseStatementNumber("-1,000.5")).toBe(-1000.5);
    expect(parseStatementNumber("2,450.50 ")).toBe(2450.5);
  });

  it("returns null for blanks, placeholders and non-finite junk", () => {
    for (const value of ["", "-", "NA", "N/A", "Infinity", "-Infinity", "NaN", "not-a-number", "12,34.56,7x"]) {
      expect(parseStatementNumber(value), value).toBeNull();
    }
  });

  it("never truncates grouped numbers the way parseFloat did", () => {
    // parseFloat("1,23,456.75") === 1 — the bug this replaces.
    expect(parseStatementNumber("1,23,456.75")).not.toBe(1);
    expect(parseStatementNumber("1,200")).toBe(1200);
  });
});

describe("statement date policy", () => {
  it("normalises broker date formats to dd MMM yyyy", () => {
    expect(parseStatementDate("01-03-2024")).toBe("01 Mar 2024");
    expect(parseStatementDate("01/Mar/2024")).toBe("01 Mar 2024");
    expect(parseStatementDate("2024-03-01")).toBe("01 Mar 2024");
    expect(parseStatementDate("Mar 1, 2024")).toBe("01 Mar 2024");
    expect(parseStatementDate("45352")).toBe("01 Mar 2024");
    expect(parseStatementDate("01-03-24")).toBe("01 Mar 2024");
  });

  it("rejects junk and impossible dates", () => {
    expect(parseStatementDate("")).toBeNull();
    expect(parseStatementDate("31-02-2024")).toBeNull();
    expect(parseStatementDate("soon")).toBeNull();
  });
});

describe("header detection", () => {
  it("finds the Groww header on row 31 below the metadata banner", () => {
    const header = headerOf(GROWW_MATRIX);
    expect(header.rowIndex).toBe(30);
    expect(header.fields.has("isin")).toBe(true);
    expect(header.fields.has("realizedPnl")).toBe(true);
  });

  it("rejects a legend row whose words look like headers but nothing numeric follows", () => {
    const matrix: unknown[][] = [
      ["Symbol", "Quantity", "Buy price", "Buy value", "Sell price"],
      ["Symbol means the exchange ticker", "Quantity means shares held", "Buy price", "Buy value", "Sell price"],
      ["", "", "", "", ""],
    ];
    expect(detectHeaderRow(matrix)).toBeNull();
  });

  it("prefers the richer of two plausible header rows", () => {
    const matrix: unknown[][] = [
      ["Symbol", "Quantity", "Buy price"],
      ["RELIANCE", "10", "2,450"],
      ["Stock name", "ISIN", "Quantity", "Buy price", "Buy value", "Sell price", "Realised P&L"],
      ["Infosys", "INE009A01021", "5", "1,890", "9,450", "2,000", "550"],
    ];
    const header = headerOf(matrix);
    expect(header.rowIndex).toBe(2);
  });
});

describe("lot extraction", () => {
  it("classifies Groww open and closed lots with derived values", () => {
    const header = headerOf(GROWW_MATRIX);
    const warnings: string[] = [];
    const lots = lotsFromSheet(GROWW_MATRIX, header, warnings);

    // The parenthesised "(5)" quantity row is negative and therefore excluded
    // by the quantity gate; the Grand Total row terminates the scan.
    expect(lots).toHaveLength(2);
    const [open, loss] = lots;

    expect(open).toMatchObject({
      ticker: null, isin: "INE002A01018", quantity: 15,
      buyPrice: 2450.5, buyValue: 36757.5, closed: false, realizedPnl: null,
    });

    expect(loss.closed).toBe(true);
    expect(loss.stockName).toBe("Infosys");
    expect(loss.sellPrice).toBe(1756.4);
    expect(loss.realizedPnl).toBe(-2672);

    expect(warnings).toEqual([]);
  });

  it("stops at a Grand Total row", () => {
    const header = headerOf(GROWW_MATRIX);
    const lots = lotsFromSheet(GROWW_MATRIX, header, []);
    expect(lots.some((lot) => lot.stockName === "Grand Total")).toBe(false);
  });

  it("derives buy price from buy value and P&L from values when columns are missing", () => {
    const matrix: unknown[][] = [
      ["Stock name", "ISIN", "Quantity", "Buy value", "Sell value", "Sell date"],
      ["Infosys", "INE009A01021", "2", "3,780", "4,000", "10-01-2026"],
    ];
    const lots = lotsFromSheet(matrix, headerOf(matrix), []);
    expect(lots[0]).toMatchObject({ buyPrice: 1890, buyValue: 3780, realizedPnl: 220, closed: true });
  });

  it("skips rows with no price information at all", () => {
    const matrix: unknown[][] = [
      ["Stock name", "ISIN", "Quantity", "Buy price"],
      ["Ghost Holdings", "INE999999999", "5", ""],
    ];
    const warnings: string[] = [];
    const exclusions: { rowNumber: number; reason: string }[] = [];
    const lots = lotsFromSheet(matrix, headerOf(matrix), warnings, {
      exclusions: exclusions as never,
    });
    expect(lots).toHaveLength(0);
    expect(exclusions[0]).toMatchObject({ rowNumber: 2, reason: "missing-price" });
    expect(warnings[0]).toMatch(/no buy price or current price/);
  });

  it("stops after two blank rows so a later banner is not read as data", () => {
    const matrix: unknown[][] = [
      ["Stock name", "ISIN", "Quantity", "Buy price"],
      ["Infosys", "INE009A01021", "5", "100"],
      ["", "", "", ""],
      ["", "", "", ""],
      ["Reliance Industries", "INE002A01018", "7", "200"],
    ];
    const lots = lotsFromSheet(matrix, headerOf(matrix), []);
    expect(lots).toHaveLength(1);
  });
});

describe("workbook scan", () => {
  it("merges open and closed sheets and ignores sheets without a header", () => {
    const openSheet = {
      name: "Holdings",
      matrix: [
        ["Stock name", "ISIN", "Quantity", "Buy price", "Buy value"],
        ["Reliance Industries", "INE002A01018", "15", "2,450.50", "36,757.50"],
      ] as unknown[][],
    };
    const closedSheet = {
      name: "Closed",
      matrix: [
        ["Stock name", "ISIN", "Quantity", "Buy price", "Sell price", "Sell date", "Realised P&L"],
        ["Infosys", "INE009A01021", "20", "1,890", "1,756.40", "28-02-2026", "-2,672"],
      ] as unknown[][],
    };
    const junkSheet = { name: "Notes", matrix: [["hello", "world"]] as unknown[][] };

    const result = parseStatementSheets([openSheet, junkSheet, closedSheet]);
    expect(result.errors).toEqual([]);
    expect(result.sheets.map((sheet) => sheet.sheetName)).toEqual(["Holdings", "Closed"]);
    expect(result.lots).toHaveLength(2);
    expect(result.lots.filter((entry) => entry.closed)).toHaveLength(1);
  });

  it("parses separate realised and unrealised blocks in one worksheet", () => {
    const matrix: unknown[][] = [
      ["Unrealised holdings", "", "", "", ""],
      ["Stock name", "ISIN", "Quantity", "Buy price", "Buy value"],
      ["Reliance Industries", "INE002A01018", "15", "2,450.50", "36,757.50"],
      ["Infosys", "INE009A01021", "20", "1,890", "37,800"],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["Realised trades", "", "", "", "", "", "", ""],
      ["Stock name", "ISIN", "Quantity", "Buy date", "Buy price", "Sell date", "Sell price", "Realised P&L"],
      ["Tata Consultancy", "INE467I01027", "5", "01-03-2024", "3,900", "10-09-2025", "4,100", "1,000"],
      ["Grand Total", "", "", "", "", "", "", "1,000"],
    ];

    const result = resultOf(matrix);
    const sheet = result.sheets[0];
    expect(sheet.blocks).toHaveLength(2);
    expect(sheet.blocks.map((block) => block.section)).toEqual(["unrealised", "realised"]);
    expect(sheet.blocks.map((block) => block.lots.length)).toEqual([2, 1]);
    expect(result.lots).toHaveLength(3);
    expect(result.lots.filter((entry) => entry.closed)).toHaveLength(1);
  });

  it("does not treat a repeated header as a new transaction", () => {
    const matrix: unknown[][] = [
      ["Stock name", "ISIN", "Quantity", "Buy price", "Buy value"],
      ["Reliance Industries", "INE002A01018", "15", "2,450.50", "36,757.50"],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["Stock name", "ISIN", "Quantity", "Buy price", "Buy value"],
      ["Infosys", "INE009A01021", "20", "1,890", "37,800"],
    ];
    const result = resultOf(matrix);
    expect(result.sheets[0].blocks).toHaveLength(2);
    expect(result.lots).toHaveLength(2);
    expect(result.lots.some((entry) => entry.stockName === "Stock name")).toBe(false);
  });

  it("warns about US-listed rows instead of silently mislabelling currency", () => {
    const usSheet = {
      name: "US",
      matrix: [
        ["Stock name", "ISIN", "Quantity", "Buy price"],
        ["Apple Inc.", "US0378331005", "2", "17,500"],
      ] as unknown[][],
    };
    const result = parseStatementSheets([usSheet]);
    expect(result.warnings.join(" ")).toMatch(/USD/);
  });

  it("fails loudly when no sheet carries a statement header", () => {
    const result = parseStatementSheets([{ name: "S", matrix: [["a", "b"]] as unknown[][] }]);
    expect(result.lots).toHaveLength(0);
    expect(result.errors[0]).toMatch(/No statement header found/);
  });
});

describe("identity resolution", () => {
  it("prefers the statement's own symbol, then ISIN, then a unique name", () => {
    const resolved = resolveLots(
      [
        lot({ ticker: "TCS" }),
        lot({ isin: "INE002A01018" }),
        lot({ stockName: "Infosys Ltd" }),
        lot({ stockName: "Infosys Ltd", isin: "INE009A01021" }),
      ],
      resolver,
    );
    expect(resolved.map((row) => row.source)).toEqual(["symbol", "isin", "name", "isin"]);
    expect(resolved.map((row) => row.symbol)).toEqual(["TCS", "RELIANCE", "INFY", "INFY"]);
  });

  it("matches names after dropping ltd/limited/pvt/private", () => {
    const resolved = resolveLots([lot({ stockName: "Tata Consultancy Services" })], resolver);
    expect(resolved[0]).toMatchObject({ symbol: "TCS", source: "name" });
  });

  it("leaves ambiguous names unresolved instead of guessing", () => {
    const doubled = createIsinResolver({
      equities: [
        ["AAA", "INE1111111111", "Same Name Ltd"],
        ["BBB", "INE2222222222", "Same Name Ltd"],
      ],
    });
    const resolved = resolveLots([lot({ stockName: "Same Name Ltd" })], doubled);
    expect(resolved[0].source).toBe("unresolved");
  });

  it("accepts a search fallback only for unresolved rows", () => {
    const resolved: ResolvedLot = resolveLots([lot({ stockName: "Unknown Industries" })], resolver)[0];
    const patched = applySearchSymbol(resolved, "unk");
    expect(patched).toMatchObject({ symbol: "UNK", source: "search" });
    const already = applySearchSymbol(resolveLots([lot({ ticker: "TCS" })], resolver)[0], "other");
    expect(already.symbol).toBe("TCS");
  });
});

describe("portfolio mapping", () => {
  it("maps open and closed lots, clamping persisted text", () => {
    const lots: StatementLot[] = [
      lot({ ticker: "INFY", stockName: "I".repeat(300), quantity: 15, buyPrice: 2450.5, cmp: 2612.35 }),
      lot({
        stockName: "Infosys Ltd", isin: "INE009A01021", quantity: 20,
        buyDate: "12 Dec 2025", buyPrice: 1890, sellDate: "28 Feb 2026",
        sellPrice: 1756.4, realizedPnl: -2672, closed: true,
      }),
    ];
    const stocks = mapResolved(resolveLots(lots, resolver));

    expect(stocks[0]).toMatchObject({
      ticker: "INFY", entryPrice: 2450.5, cmp: 2612.35, quantity: 15, status: "Active",
      source: "groww",
    });
    expect(stocks[0].stockName).toHaveLength(200);
    expect(stocks[0].weekHigh52).toBeUndefined();
    expect(stocks[0].statementFingerprint).toBeTruthy();

    expect(stocks[1]).toMatchObject({
      ticker: "INFY", entryDate: "12 Dec 2025", exitPrice: 1756.4,
      exitDate: "28 Feb 2026", status: "Sold Loss",
    });
  });

  it("leaves entryDate unknown when the statement has no purchase date", () => {
    const stocks = mapResolved(resolveLots([lot({ ticker: "INFY", stockName: "Infosys Ltd" })], resolver));
    expect(stocks[0].entryDate).toBeUndefined();
  });

  it("never substitutes CMP for a missing purchase price", () => {
    const stocks = mapResolved(resolveLots([
      lot({ isin: "INE002A01018", quantity: 15, buyPrice: null, buyValue: null, cmp: 2612.35 }),
    ], resolver));

    expect(stocks[0]).toMatchObject({
      ticker: "RELIANCE", entryPrice: null, cmp: 2612.35, quantity: 15, status: "Active",
    });
    // No 52-week high is stated, so none is invented from CMP.
    expect(stocks[0].weekHigh52).toBeUndefined();
  });

  it("marks a closed lot without an exit price as Sold instead of guessing a result", () => {
    const stocks = mapResolved(resolveLots([
      lot({ isin: "INE467I01027", quantity: 5, buyPrice: 3900, sellDate: "10 Sep 2025", closed: true }),
    ], resolver));
    expect(stocks[0]).toMatchObject({ ticker: "TCS", status: "Sold" });
    expect(stocks[0].exitPrice).toBeUndefined();
  });

  it("drops rows with no resolvable symbol or no usable price", () => {
    const unresolved = mapResolved(resolveLots([lot({ stockName: "Mystery" })], resolver));
    expect(unresolved[0]).toBeUndefined();

    const zeroPrice = mapResolved(resolveLots([
      lot({ ticker: "INFY", buyPrice: null, buyValue: null, cmp: null, closed: false }),
    ], resolver));
    expect(zeroPrice[0]).toBeUndefined();
  });
});

describe("broker detection", () => {
  it("recognises Groww from name/ISIN columns and Zerodha from a symbol column", () => {
    expect(resultOf(GROWW_MATRIX).broker).toBe("groww");
    expect(resultOf(ZERODHA_MATRIX).broker).toBe("zerodha");
  });

  it("uses the file name only as supporting evidence", () => {
    const anonymous = [
      ["Code", "Qty", "Rate", "Value"],
      ["RELIANCE", "10", "2,450", "24,500"],
    ];
    const named = detectStatementBroker([{ fields: ["symbol", "quantity", "buyPrice", "buyValue"], lots: [] }], "stocks_pnl_zerodha.xlsx");
    expect(named.broker).toBe("zerodha");
    expect(named.evidence.some((line) => /file name mentions Zerodha/i.test(line))).toBe(true);
    expect(parseStatementSheets(matrixOf(anonymous), { fileName: "stocks_pnl_zerodha.xlsx" }).broker).toBe("zerodha");
  });
});

describe("statement fingerprints", () => {
  it("is identical for the same statement and does not depend on the import date", () => {
    const lots = resultOf(ZERODHA_MATRIX).lots;
    expect(assignFingerprints(lots, "zerodha")).toEqual(assignFingerprints(lots, "zerodha"));
  });

  it("keeps genuinely identical lots distinct with an occurrence suffix", () => {
    const repeated = resultOf(ZERODHA_MATRIX).lots[1];
    const fingerprints = assignFingerprints([repeated, { ...repeated }], "zerodha");
    expect(fingerprints[0]).not.toBe(fingerprints[1]);
    expect(fingerprints[0]).toMatch(/#0$/);
    expect(fingerprints[1]).toMatch(/#1$/);
  });

  it("changes when the statement changes a stable attribute", () => {
    const lots = resultOf(ZERODHA_MATRIX).lots;
    const changed = { ...lots[0], quantity: lots[0].quantity + 1 };
    expect(assignFingerprints([lots[0]], "zerodha")[0])
      .not.toBe(assignFingerprints([changed], "zerodha")[0]);
  });

  it("scopes fingerprints by broker so equal rows never collide", () => {
    const rows = resultOf(ZERODHA_MATRIX).lots;
    expect(assignFingerprints(rows, "zerodha")[0])
      .not.toBe(assignFingerprints(rows, "groww")[0]);
  });
});

describe("statement keys", () => {
  it("distinguishes open and closed lots and is import-order independent", () => {
    const base = { ticker: "infy", entryDate: "12 Dec 2025", entryPrice: 1890, quantity: 20 };
    expect(statementKey({ ...base, exitDate: undefined }))
      .toBe(statementKey({ ...base, exitDate: undefined }));
    expect(statementKey({ ...base, exitDate: undefined }))
      .not.toBe(statementKey({ ...base, exitDate: "28 Feb 2026" }));
    expect(statementKey({ ...base, exitDate: undefined }))
      .not.toBe(statementKey({ ...base, entryPrice: 1891 }));
  });

  it("treats an unknown cost and an absent date as real values, not today", () => {
    const key = statementKey({ ticker: "INFY", entryDate: undefined, entryPrice: null, quantity: 2 });
    expect(key).toBe("INFY||2||");
  });
});

// ── Broker profiles (synthetic, unverified) ──────────────────────────────────
// Shapes anticipated from broker UIs; each stays unverified until a real
// export confirms the columns. Revisit when the user supplies samples.

describe("broker profiles (synthetic, unverified)", () => {
  const UPSTOX_MATRIX: unknown[][] = [
    ["Profit and Loss Report", "", "", "", "", "", "", "", "", "", ""],
    ["Kandula Chaitanya Sai", "", "", "", "", "", "", "", "", "", ""],
    [
      "Trading Symbol", "ISIN", "Buy date", "Buy quantity", "Buy rate", "Buy value",
      "Sell date", "Sell quantity", "Sell rate", "Sell value", "Net P&L",
    ],
    ["RELIANCE", "INE002A01018", "01-Mar-2024", "15", "2,450.50", "36,757.50", "10-May-2024", "15", "2,610.00", "39,150.00", "2,392.50"],
    ["INFY", "INE009A01021", "12-Dec-2025", "5", "1,890", "9,450", "", "", "", "", ""],
  ];

  const DHAN_MATRIX: unknown[][] = [
    ["P&L Statement", "", "", "", "", "", "", "", ""],
    [
      "Trading Symbol", "ISIN", "Total Qty", "Buy Average", "Buy Value",
      "Sell Date", "Sell Average", "Realized P&L", "Current Price",
    ],
    ["TCS", "INE467I01027", "10", "3,900", "39,000", "10-Sep-2025", "4,100", "2,000", "4,105.60"],
    ["INFY", "INE009A01021", "20", "1,890", "37,800", "", "", "", "1,990"],
  ];

  const INDMONEY_IN_MATRIX: unknown[][] = [
    ["Portfolio", "", "", "", "", "", "", ""],
    [
      "Stock Name", "ISIN", "Quantity", "Average Price", "Invested Amount",
      "Current Price", "Current Value", "Returns",
    ],
    ["Reliance Industries", "INE002A01018", "15", "2,450.50", "36,757.50", "2,612.35", "39,185.25", "2,427.75"],
  ];

  const INDMONEY_US_MATRIX: unknown[][] = [
    ["Portfolio", "", "", "", "", "", "", "", ""],
    [
      "Stock Name", "Ticker", "ISIN", "Quantity", "Average Cost",
      "Current Price", "Market Value", "Total Returns",
    ],
    ["Apple Inc.", "AAPL", "US0378331005", "3", "172.30", "226.21", "678.63", "161.73"],
  ];

  it("Upstox: maps buy quantity, not sell quantity, when both columns alias quantity", () => {
    const header = headerOf(UPSTOX_MATRIX);
    const quantityCols = [...header.mapping.entries()]
      .filter(([, field]) => field === "quantity")
      .map(([col]) => col);
    expect(quantityCols).toEqual([3]);

    const result = resultOf(UPSTOX_MATRIX);
    expect(result.warnings).toEqual([]);
    expect(result.lots).toHaveLength(2);
    expect(result.lots[0]).toMatchObject({
      ticker: "RELIANCE", quantity: 15, closed: true,
      buyPrice: 2450.5, sellPrice: 2610, realizedPnl: 2392.5,
    });
    expect(result.lots[1]).toMatchObject({
      ticker: "INFY", quantity: 5, closed: false, buyPrice: 1890,
    });
  });

  it("Dhan: Total Qty, Buy Average and open lots with Current Price", () => {
    const result = resultOf(DHAN_MATRIX);
    expect(result.warnings).toEqual([]);
    expect(result.lots).toHaveLength(2);
    expect(result.lots[0]).toMatchObject({
      ticker: "TCS", quantity: 10, buyPrice: 3900, sellPrice: 4100,
      realizedPnl: 2000, closed: true,
    });
    expect(result.lots[1]).toMatchObject({
      ticker: "INFY", quantity: 20, buyPrice: 1890, cmp: 1990, closed: false,
    });
  });

  it("INDmoney IN: Current Value on open holdings never marks the lot closed", () => {
    const result = resultOf(INDMONEY_IN_MATRIX);
    expect(result.warnings).toEqual([]);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]).toMatchObject({
      ticker: null, stockName: "Reliance Industries", quantity: 15,
      buyPrice: 2450.5, cmp: 2612.35, realizedPnl: 2427.75, closed: false,
    });
    const stocks = mapResolved(resolveLots(result.lots, resolver));
    expect(stocks[0]?.status).toBe("Active");
  });

  it("INDmoney US: USD holdings import as-is with a currency warning", () => {
    const result = parseStatementSheets(matrixOf(INDMONEY_US_MATRIX));
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]).toMatchObject({
      stockName: "Apple Inc.", quantity: 3, buyPrice: 172.3, cmp: 226.21, closed: false,
    });
    expect(result.warnings.some((w) => /USD/i.test(w))).toBe(true);
  });
});
