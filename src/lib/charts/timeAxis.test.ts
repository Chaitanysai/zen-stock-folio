import { describe, expect, it } from "vitest";
import { chartTimeAxisOptions, formatIstTick, isIntradayResolution } from "./timeAxis";

// 2024-11-01T03:45:00Z === 09:15 IST on 01 Nov
const T = 1730432700;

describe("chart time axis", () => {
  it("classifies intraday resolutions", () => {
    expect(isIntradayResolution("1m")).toBe(true);
    expect(isIntradayResolution("5m")).toBe(true);
    expect(isIntradayResolution("15m")).toBe(true);
    expect(isIntradayResolution("1d")).toBe(false);
  });

  it("formats intraday ticks in IST, not UTC", () => {
    expect(formatIstTick(T, "5m")).toBe("09:15");
  });

  it("formats daily ticks with the IST date", () => {
    expect(formatIstTick(T, "1d")).toBe("01 Nov");
  });

  it("shows time only for intraday series", () => {
    expect(chartTimeAxisOptions("5m").timeScale.timeVisible).toBe(true);
    expect(chartTimeAxisOptions("1d").timeScale.timeVisible).toBe(false);
    expect(chartTimeAxisOptions("1d").timeScale.secondsVisible).toBe(false);
  });
});
