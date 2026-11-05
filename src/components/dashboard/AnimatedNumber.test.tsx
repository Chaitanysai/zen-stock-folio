import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimatedCurrency } from "./AnimatedNumber";

const text = (container: HTMLElement) => container.querySelector(".zf-count")?.textContent ?? "";

function stubReducedMotion(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: matches && query.includes("prefers-reduced-motion: reduce"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList);
}

describe("AnimatedCurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts from zero up to a positive figure", async () => {
    const { container } = render(<AnimatedCurrency value={1250} />);

    expect(text(container)).toBe("₹0");
    await waitFor(() => expect(text(container)).toBe("+₹1,250"));
  });

  it("counts to a negative figure with the loss sign", async () => {
    const { container } = render(<AnimatedCurrency value={-480} />);

    expect(text(container)).toBe("₹0");
    await waitFor(() => expect(text(container)).toBe("−₹480"));
  });

  it("leaves a genuine zero at zero", async () => {
    const { container } = render(<AnimatedCurrency value={0} />);

    expect(text(container)).toBe("₹0");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(text(container)).toBe("₹0");
  });

  it("continues from the previous figure on a refresh instead of resetting", async () => {
    const { container, rerender } = render(<AnimatedCurrency value={1250} />);
    await waitFor(() => expect(text(container)).toBe("+₹1,250"));

    rerender(<AnimatedCurrency value={480} />);
    // The refresh starts where the reader left off, never back at zero.
    expect(text(container)).toBe("+₹1,250");
    await waitFor(() => expect(text(container)).toBe("+₹480"));
  });

  it("does not replay when re-rendered with the same figure", async () => {
    const { container, rerender } = render(<AnimatedCurrency value={900} />);
    await waitFor(() => expect(text(container)).toBe("+₹900"));

    rerender(<AnimatedCurrency value={900} />);
    expect(text(container)).toBe("+₹900");
  });

  it("shows the final figure immediately under reduced motion", () => {
    stubReducedMotion(true);
    const { container } = render(<AnimatedCurrency value={1250} />);

    expect(text(container)).toBe("+₹1,250");
  });

  it("stops its animation frame when unmounted mid-count", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, unmount } = render(<AnimatedCurrency value={1250} />);
    expect(text(container)).toBe("₹0");

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(consoleError).not.toHaveBeenCalled();
  });
});
