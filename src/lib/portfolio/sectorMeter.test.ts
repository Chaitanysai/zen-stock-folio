import { describe, expect, it } from "vitest";
import { buildSectorSegments, isConcentrated } from "./sectorMeter";

const slices = [
  { sector: "Financials", value: 50000, percentage: 50 },
  { sector: "IT", value: 30000, percentage: 30 },
  { sector: "Other", value: 20000, percentage: 20 },
];

describe("sector meter", () => {
  it("keeps true percentage widths and order", () => {
    const segments = buildSectorSegments(slices);
    expect(segments.map((s) => s.widthPct)).toEqual([50, 30, 20]);
    expect(segments.map((s) => s.label)).toEqual(["Financials", "IT", "Other"]);
    expect(segments[2].isOther).toBe(true);
  });

  it("marks tiny slices without changing their percentage", () => {
    const segments = buildSectorSegments([
      { sector: "A", value: 99, percentage: 99.4 },
      { sector: "B", value: 1, percentage: 0.6 },
    ]);
    expect(segments[1].pct).toBe(0.6);
    expect(segments[1].widthPct).toBe(0.6);
    expect(segments[1].colorIndex).toBe(1);
  });

  it("flags concentration at 40% or more", () => {
    expect(isConcentrated(slices)).toBe(true);
    expect(isConcentrated([{ sector: "A", value: 39, percentage: 39 }, { sector: "B", value: 61, percentage: 61 }])).toBe(false);
    expect(isConcentrated([])).toBe(false);
  });

  it("returns no segments for an empty portfolio", () => {
    expect(buildSectorSegments([])).toEqual([]);
  });
});
