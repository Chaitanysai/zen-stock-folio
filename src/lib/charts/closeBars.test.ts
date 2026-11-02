import { describe, expect, it } from "vitest";
import { buildCloseBars, closeBarBase } from "./closeBars";

const candles = [
  { time: 100, open: 10, high: 12, low: 9, close: 10, volume: null },
  { time: 200, open: 10, high: 14, low: 10, close: 13, volume: null },
  { time: 300, open: 13, high: 13, low: 8, close: 9, volume: null },
];

describe("close bars", () => {
  it("uses close values in chronological order", () => {
    expect(buildCloseBars(candles)).toEqual([
      { time: 100, value: 10, up: true },
      { time: 200, value: 13, up: true },
      { time: 300, value: 9, up: false },
    ]);
  });

  it("never uses volume and pads the baseline below the minimum close", () => {
    expect(closeBarBase(candles)).toBe(8.82);
    expect(closeBarBase([])).toBe(0);
  });
});
