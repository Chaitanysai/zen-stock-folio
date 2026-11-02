import { describe, expect, it } from "vitest";
import { parseRows } from "./csvImport.ts";

const usRow = {
  Ticker: "AAPL",
  "Stock Name": "Apple",
  Market: "US",
  Currency: "USD",
  "FX at cost": "80",
  "Entry Price": "100",
  CMP: "120",
  "52W High": "130",
  Quantity: "10",
  Status: "Active",
};

describe("parseRows market handling", () => {
  it("imports a U.S. row with its currency and rate at cost", () => {
    const { parsed, errors } = parseRows([usRow]);
    expect(errors).toEqual([]);
    expect(parsed[0]).toMatchObject({
      ticker: "AAPL", market: "US", currency: "USD", fxAtCost: 80, source: "manual",
      entryPrice: 100, cmp: 120,
    });
  });

  it("defaults legacy rows to NSE / INR with no FX cost", () => {
    const { parsed } = parseRows([{
      Ticker: "RELIANCE", "Stock Name": "Reliance", "Entry Price": "100", CMP: "110", Quantity: "5",
    }]);
    expect(parsed[0]).toMatchObject({ market: "NSE", currency: "INR", source: "manual" });
    expect(parsed[0].fxAtCost).toBeUndefined();
  });

  it("does not guess a U.S. currency when the market says US", () => {
    const { parsed } = parseRows([{ ...usRow, Currency: "" }]);
    expect(parsed[0].currency).toBe("USD");
  });

  it("still rejects rows without ticker, price, or quantity", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Quantity: "0" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/Invalid price or quantity/);
  });
});

describe("parseRows market coercion", () => {
  it("recognises NYSE Arca as the U.S. market despite the space", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Market: "NYSE Arca", Currency: "" }]);
    expect(errors).toEqual([]);
    expect(parsed[0]).toMatchObject({ market: "US", currency: "USD" });
  });

  it("errors on an unrecognized non-empty market instead of quietly importing INR", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Market: "LSE", Currency: "USD" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/^Row 2: /);
    expect(errors[0]).toMatch(/LSE/);
  });

  it("errors when a Currency column contradicts the market", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Currency: "INR" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/^Row 2: /);
    expect(errors[0]).toMatch(/Currency/);
  });
});

describe("parseRows shares the manual-entry invariants", () => {
  it("rejects a junk ticker", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Ticker: "$$$" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/^Row 2: /);
  });

  it("rejects a fractional quantity instead of truncating it", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Quantity: "1.5" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/^Row 2: /);
  });

  it("rejects a quantity with trailing junk instead of parsing its prefix", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Quantity: "10abc" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/^Row 2: /);
  });

  it("rejects a closed trade without an exit price", () => {
    const { parsed, errors } = parseRows([{ ...usRow, Status: "Sold Profit" }]);
    expect(parsed).toEqual([]);
    expect(errors[0]).toMatch(/^Row 2: /);
    expect(errors[0]).toMatch(/exit price/i);
  });
});
