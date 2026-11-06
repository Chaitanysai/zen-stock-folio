import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnrealisedHolding } from "@/lib/portfolio/positions";
import UnrealisedChart from "./UnrealisedChart";

// jsdom has no measured SVG layout. Observe the animation policy at the real
// component's Recharts boundary; the browser harness verifies the rendered bars.
const bar = vi.hoisted(() => vi.fn((_props: { isAnimationActive?: boolean }) => null));
vi.mock("recharts", () => {
  const container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const empty = () => null;
  return {
    Bar: bar, BarChart: container, ResponsiveContainer: container,
    CartesianGrid: empty, Cell: empty, ReferenceLine: empty,
    Tooltip: empty, XAxis: empty, YAxis: empty,
  };
});

const holding: UnrealisedHolding = {
  key: "NSE:AAA:manual", ticker: "AAA", label: "Alpha Ltd", market: "NSE",
  sourceLabel: "Manual", axisLabel: "AAA", value: 200,
};
const animationActive = () => bar.mock.lastCall?.[0]?.isAnimationActive;

afterEach(() => {
  bar.mockClear();
  vi.restoreAllMocks();
});

describe("UnrealisedChart entry", () => {
  it("animates its first entry, not a subsequent value or held-set update", () => {
    const { rerender } = render(<UnrealisedChart holdings={[holding]} />);
    expect(animationActive()).toBe(true);

    rerender(<UnrealisedChart holdings={[{ ...holding, value: 480 }]} />);
    expect(animationActive()).toBe(false);

    rerender(<UnrealisedChart holdings={[holding, { ...holding, key: "NSE:BBB", ticker: "BBB", value: -100 }]} />);
    expect(animationActive()).toBe(false);
  });

  it("renders static bars from entry under reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} } as unknown as MediaQueryList);
    render(<UnrealisedChart holdings={[holding]} />);
    expect(animationActive()).toBe(false);
  });

  it("stops the entry when reduced motion is enabled while it is running", () => {
    const media = new EventTarget();
    Object.assign(media, { matches: false });
    vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
    render(<UnrealisedChart holdings={[holding]} />);
    expect(animationActive()).toBe(true);

    act(() => {
      Object.assign(media, { matches: true });
      media.dispatchEvent(new Event("change"));
    });
    expect(animationActive()).toBe(false);
  });

  it("does not replay entry when motion is re-enabled", () => {
    const media = new EventTarget();
    Object.assign(media, { matches: true });
    vi.spyOn(window, "matchMedia").mockReturnValue(media as unknown as MediaQueryList);
    render(<UnrealisedChart holdings={[holding]} />);
    expect(animationActive()).toBe(false);

    act(() => {
      Object.assign(media, { matches: false });
      media.dispatchEvent(new Event("change"));
    });
    expect(animationActive()).toBe(false);
  });
});
