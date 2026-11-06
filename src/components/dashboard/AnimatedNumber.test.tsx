import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OdometerInr } from "./AnimatedNumber";

/** Absolute strip positions of the visible digit columns, left to right. */
function columns(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".zf-odo-track")).map((el) =>
    Number(el.style.getPropertyValue("--slot")),
  );
}

/** The digit each strip position actually shows — the figure the reader sees. */
function shown(container: HTMLElement): number[] {
  return columns(container).map((pos) => ((pos % 10) + 10) % 10);
}

function amount(container: HTMLElement): string {
  return container.querySelector(".zf-sr-only")?.textContent ?? "";
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("OdometerInr", () => {
  it("paints zero first and then rolls to the amount", async () => {
    const { container } = render(<OdometerInr value={1250} />);

    expect(columns(container)).toEqual([0, 0, 0, 0]);
    await waitFor(() => expect(shown(container)).toEqual([1, 2, 5, 0]));
  });

  it("keeps the exact amount as accessible text, without the rolling digits", async () => {
    const { container } = render(<OdometerInr value={1370} />);

    await waitFor(() => expect(amount(container)).toBe("+₹1,370"));
    expect(container.querySelector(".zf-odo-row")).toHaveAttribute("aria-hidden", "true");
  });

  it("signs a loss without disturbing digit order", async () => {
    const { container } = render(<OdometerInr value={-480} />);

    await waitFor(() => expect(amount(container)).toBe("−₹480"));
    await waitFor(() => expect(shown(container)).toEqual([4, 8, 0]));
  });

  it("renders a genuine zero without a sign", async () => {
    const { container } = render(<OdometerInr value={0} />);

    expect(amount(container)).toBe("₹0");
    await waitFor(() => expect(shown(container)).toEqual([0]));
  });

  it("rolls down through the strip when the amount falls", async () => {
    const { container, rerender } = render(<OdometerInr value={1250} />);
    await waitFor(() => expect(shown(container)).toEqual([1, 2, 5, 0]));

    rerender(<OdometerInr value={480} />);

    await waitFor(() => expect(shown(container)).toEqual([4, 8, 0]));
    expect(amount(container)).toBe("+₹480");
  });

  it("keeps every column on its own digit when the figure gains a leading digit", async () => {
    const { container, rerender } = render(<OdometerInr value={1372} />);
    await waitFor(() => expect(shown(container)).toEqual([1, 3, 7, 2]));

    rerender(<OdometerInr value={21695} />);

    await waitFor(() => expect(shown(container)).toEqual([2, 1, 6, 9, 5]));
  });

  it("does not replay the roll when re-rendered with the same amount", async () => {
    const { container, rerender } = render(<OdometerInr value={900} />);
    await waitFor(() => expect(shown(container)).toEqual([9, 0, 0]));

    const before = columns(container);
    rerender(<OdometerInr value={900} />);
    expect(columns(container)).toEqual(before);
  });

  it("leaves the currency symbol and separators static", () => {
    const { container } = render(<OdometerInr value={1250} />);
    const fixed = Array.from(container.querySelectorAll(".zf-odo-fixed")).map((el) => el.textContent);

    expect(fixed).toEqual(["+", "₹", ","]);
  });

  it("stagger-delays the actual moving tracks, rightmost column first", () => {
    const { container } = render(<OdometerInr value={1250} />);
    const delays = Array.from(container.querySelectorAll<HTMLElement>(".zf-odo-track"))
      .map((track) => track.style.transitionDelay);
    expect(delays).toEqual(["135ms", "90ms", "45ms", "0ms"]);
  });

  it("lands on the amount immediately under reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );

    const { container } = render(<OdometerInr value={1250} />);
    expect(shown(container)).toEqual([1, 2, 5, 0]);
  });

  it("rebases repeated carry, borrow and direction-reversal rolls before a strip can exhaust", async () => {
    vi.useFakeTimers();
    const values = [9, 10, 19, 20, 99, 100, 109, 108, 99, 10, 9, 0, -1, -10, -9, 0];
    const { container, rerender } = render(<OdometerInr value={values[0]} />);

    // Paint the initial zero-to-value roll, then allow its scheduled rebase.
    act(() => vi.advanceTimersByTime(1100));
    for (const value of values.slice(1)) {
      rerender(<OdometerInr value={value} />);
      act(() => vi.advanceTimersByTime(1100));

      // Every displayed track remains on a real, rendered digit in the safe band.
      expect(columns(container).every((position) => position >= -9 && position <= 19)).toBe(true);
      expect(shown(container).join("")).toBe(String(Math.abs(value)));
    }
  });

  it("keeps decimal, negative and large custom-formatted values on fixed digit tracks", async () => {
    const format = (value: number) => `${value < 0 ? "−" : "+"}₹${Math.abs(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const { container, rerender } = render(<OdometerInr value={-1234.5} format={format} />);

    await waitFor(() => expect(amount(container)).toBe("−₹1,234.50"));
    await waitFor(() => expect(shown(container)).toEqual([1, 2, 3, 4, 5, 0]));

    rerender(<OdometerInr value={9876543.21} format={format} />);
    await waitFor(() => expect(shown(container)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]));
    expect(Array.from(container.querySelectorAll(".zf-odo"))).toHaveLength(9);
  });

  it("cleans up its rebase timeout and animation frame on unmount", () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { unmount } = render(<OdometerInr value={9999} />);

    act(() => vi.advanceTimersByTime(20));
    unmount();

    expect(clear).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});
