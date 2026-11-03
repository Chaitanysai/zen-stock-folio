import { describe, it, expect } from "vitest";
import { portfolioData, hasKnownCost, type PortfolioStock } from "@/data/sampleData";
import {
  calcInvestedValue,
  calcFinalValue,
  calcProfitLoss,
} from "@/data/sampleData";
import { costBasis, marketValue, profitLoss, type Position } from "./calculations";

// Guards against the portfolio engine drifting from the helpers the screens still use.
describe("engine parity with existing sample-data helpers", () => {
  it("matches calcInvestedValue, calcFinalValue, and calcProfitLoss for every sample row", () => {
    expect(portfolioData.length).toBeGreaterThan(0);
    // `Sold` and an unknown cost are statement-import states the numeric engine
    // cannot represent; every hard-coded sample row still has both.
    const comparable = portfolioData.filter(
      (row): row is PortfolioStock & {
        entryPrice: number;
        status: "Active" | "Sold Profit" | "Sold Loss";
      } => row.status !== "Sold" && hasKnownCost(row),
    );
    expect(comparable.length).toBe(portfolioData.length);

    for (const s of comparable) {
      const p: Position = {
        quantity: s.quantity,
        entryPrice: s.entryPrice,
        cmp: s.cmp,
        exitPrice: s.exitPrice,
        status: s.status,
      };
      const invested = calcInvestedValue(s);
      const realised = calcProfitLoss(s);
      expect(invested).not.toBeNull();
      expect(realised).not.toBeNull();
      expect(costBasis(p)).toBeCloseTo(invested, 6);
      expect(marketValue(p)).toBeCloseTo(calcFinalValue(s), 6);
      expect(profitLoss(p)).toBeCloseTo(realised, 6);
    }
  });
});
