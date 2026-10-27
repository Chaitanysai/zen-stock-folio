/**
 * Twelve Data adapter — row interpretation only. No network.
 *
 * The fixture rows below mirror the real `?exchange=NSE&country=India` directory
 * shape, including the series suffixes that directory actually contains.
 */

import { describe, expect, it } from "vitest";
import { twelveDataRowsToHits } from "@/lib/market-data/twelvedata.ts";

describe("twelveDataRowsToHits", () => {
  it("keeps bare NSE mainboard symbols and drops other-board series", () => {
    const hits = twelveDataRowsToHits([
      { symbol: "RELIANCE", name: "Reliance Industries Ltd.", exchange: "NSE", type: "Common Stock" },
      // NSE SME platform — a separate board the quote path cannot resolve.
      { symbol: "AAKAAR.SM", name: "Aakaar", exchange: "NSE", type: "Common Stock" },
      // BSE listing carried inside the "NSE" directory.
      { symbol: "ADANIENT.BL", name: "Adani Enterprises", exchange: "NSE", type: "Common Stock" },
      { symbol: "SOMEFUND.IV", name: "Some Fund", exchange: "NSE", type: "Common Stock" },
    ]);

    expect(hits.map((hit) => hit.symbol)).toEqual(["RELIANCE"]);
  });

  it("never relabels a row from another exchange as NSE", () => {
    const hits = twelveDataRowsToHits([
      { symbol: "INFY", name: "Infosys", exchange: "NYSE", type: "Common Stock" },
    ]);

    expect(hits).toHaveLength(0);
  });

  it("reports a placeholder ISIN as null rather than as an identifier", () => {
    const [hit] = twelveDataRowsToHits([
      {
        symbol: "RELIANCE",
        name: "Reliance Industries Ltd.",
        exchange: "NSE",
        type: "Common Stock",
        isin: "request_access_via_add_ons",
      },
    ]);

    expect(hit.isin).toBeNull();
    expect(hit.provider).toBe("twelvedata");
    expect(hit.exchange).toBe("NSE");
  });

  it("keeps a well-formed ISIN", () => {
    const [hit] = twelveDataRowsToHits([
      { symbol: "INFY", name: "Infosys", exchange: "NSE", type: "Common Stock", isin: "INE009A01021" },
    ]);

    expect(hit.isin).toBe("INE009A01021");
  });
});
