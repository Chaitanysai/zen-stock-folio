import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RangeMeter, rangeFraction } from "./range-meter";
import { KpiStat } from "./kpi-stat";

describe("rangeFraction", () => {
  it("places a value inside the range", () => {
    expect(rangeFraction(50, 0, 100)).toBe(0.5);
  });

  it("clamps outside the range instead of overflowing the track", () => {
    expect(rangeFraction(-10, 0, 100)).toBe(0);
    expect(rangeFraction(150, 0, 100)).toBe(1);
  });

  it("returns 0 for a zero-width or inverted range rather than dividing by zero", () => {
    expect(rangeFraction(5, 10, 10)).toBe(0);
    expect(rangeFraction(5, 10, 0)).toBe(0);
    expect(rangeFraction(Number.NaN, 0, 100)).toBe(0);
  });
});

describe("RangeMeter", () => {
  it("exposes the value through the meter role, not colour alone", () => {
    render(<RangeMeter label="52-week position" value={75} min={0} max={100} />);
    const meter = screen.getByRole("meter", { name: "52-week position" });
    expect(meter).toHaveAttribute("aria-valuenow", "75");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
  });

  it("prints the readable value alongside the label", () => {
    render(<RangeMeter label="Exposure" value={40} min={0} max={100} valueLabel="40%" />);
    expect(screen.getByText("40%")).toBeInTheDocument();
  });
});

describe("KpiStat", () => {
  it("derives a positive tone from a positive value", () => {
    render(<KpiStat label="Unrealised P&L" value="₹1,200" numericValue={1200} />);
    expect(screen.getByText("₹1,200").className).toContain("--profit");
  });

  it("derives a negative tone from a negative value", () => {
    render(<KpiStat label="Unrealised P&L" value="-₹1,200" numericValue={-1200} />);
    expect(screen.getByText("-₹1,200").className).toContain("--loss");
  });

  it("honours an explicit tone over the sign of the value", () => {
    // A cost reported as a positive magnitude must still read as negative.
    render(<KpiStat label="Total invested" value="₹5,000" numericValue={5000} tone="negative" />);
    expect(screen.getByText("₹5,000").className).toContain("--loss");
  });

  it("treats zero as neutral", () => {
    render(<KpiStat label="Today's P&L" value="₹0" numericValue={0} />);
    expect(screen.getByText("₹0").className).toContain("muted-foreground");
  });

  it("never shows a figure while loading", () => {
    render(<KpiStat label="Portfolio value" value="₹0" numericValue={0} loading />);
    expect(screen.queryByText("₹0")).toBeNull();
  });
});
