/**
 * Instrument-master search — series classification only. No network.
 *
 * The records below reproduce the real `NSE_EQ` mix verified 2026-10-27: the
 * segment is not an equity list, so the assertions here are about what we label
 * each row, not about what NSE happens to list today.
 */

import { describe, expect, it } from "vitest";
import {
  emptyInstrumentIndex,
  instrumentTypeFor,
  searchInstruments,
  type InstrumentIndex,
  type InstrumentRecord,
} from "@/lib/market-data/instruments.ts";

function record(overrides: Partial<InstrumentRecord>): InstrumentRecord {
  return {
    segment: "NSE_EQ",
    instrument_key: "test",
    ...overrides,
  };
}

function indexWith(records: InstrumentRecord[]): InstrumentIndex {
  const index = emptyInstrumentIndex("test");
  for (const item of records) {
    const symbol = (item.trading_symbol ?? "").toUpperCase();
    index.equityBySymbol.set(symbol, item);
  }
  return index;
}

describe("instrumentTypeFor", () => {
  it("classifies an ordinary share as EQUITY", () => {
    expect(instrumentTypeFor(record({ instrument_type: "EQ" }))).toBe("EQUITY");
    expect(instrumentTypeFor(record({ instrument_type: "SM" }))).toBe("EQUITY");
    expect(instrumentTypeFor(record({ instrument_type: "BE" }))).toBe("EQUITY");
  });

  it("does not call a government security an equity", () => {
    expect(instrumentTypeFor(record({ instrument_type: "GS" }))).toBe("DEBT");
    expect(instrumentTypeFor(record({ instrument_type: "SG" }))).toBe("DEBT");
    expect(instrumentTypeFor(record({ instrument_type: "N1" }))).toBe("DEBT");
    expect(instrumentTypeFor(record({ instrument_type: "TB" }))).toBe("TBILL");
    expect(instrumentTypeFor(record({ instrument_type: "GB" }))).toBe("GOLD_BOND");
    expect(instrumentTypeFor(record({ instrument_type: "RR" }))).toBe("TRUST");
  });

  it("reports null rather than guessing when the series is absent", () => {
    expect(instrumentTypeFor(record({}))).toBeNull();
  });
});

describe("searchInstruments", () => {
  it("ranks a share ahead of a bond that shares the symbol prefix", () => {
    const index = indexWith([
      record({ trading_symbol: "SUMMIT", name: "SUMMIT SECURITIES LTD", instrument_type: "EQ" }),
      record({ trading_symbol: "SUMMITN1", name: "SUMMIT 8.05% 2029", instrument_type: "N1" }),
    ]);

    const rows = searchInstruments(index, "SUMMIT");

    expect(rows[0]?.symbol).toBe("SUMMIT");
    expect(rows[0]?.instrumentType).toBe("EQUITY");
    expect(rows[1]?.instrumentType).toBe("DEBT");
  });

  it("carries the provider's real series through to the caller", () => {
    const index = indexWith([
      record({ trading_symbol: "789SDIL29", name: "SUMMIT DIG 7.89% 2029", instrument_type: "N1" }),
    ]);

    const [row] = searchInstruments(index, "789SDIL");

    expect(row.instrumentType).toBe("DEBT");
  });
});
