import { describe, it, expect } from "vitest";
import { portfolioData } from "@/data/sampleData";
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
    for (const s of portfolioData) {
      const p: Position = {
        quantity: s.quantity,
        entryPrice: s.entryPrice,
        cmp: s.cmp,
        exitPrice: s.exitPrice,
        status: s.status,
      };
      expect(costBasis(p)).toBeCloseTo(calcInvestedValue(s), 6);
      expect(marketValue(p)).toBeCloseTo(calcFinalValue(s), 6);
      expect(profitLoss(p)).toBeCloseTo(calcProfitLoss(s), 6);
    }
  });
});
