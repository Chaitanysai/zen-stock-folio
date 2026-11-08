import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChristmasAnimation from "./ChristmasAnimation";

describe("ChristmasAnimation", () => {
  it("renders the configured snow, sparkles and evergreen ridge", () => {
    const { container } = render(
      <ChristmasAnimation config={{ particleCount: 8, showEvergreen: true }} />,
    );

    expect(container.querySelectorAll(".zl-ev-flake")).toHaveLength(8);
    expect(container.querySelectorAll(".zl-ev-star")).toHaveLength(5);
    expect(container.querySelector(".zl-ev-evergreen")).not.toBeNull();
    expect(container.querySelector(".zl-ev-glow")).toHaveAttribute("data-tone", "cool");
  });

  it("falls back to the default flake count", () => {
    const { container } = render(<ChristmasAnimation />);
    expect(container.querySelectorAll(".zl-ev-flake")).toHaveLength(22);
  });

  it("honours showEvergreen: false", () => {
    const { container } = render(<ChristmasAnimation config={{ showEvergreen: false }} />);
    expect(container.querySelector(".zl-ev-evergreen")).toBeNull();
  });

  it("renders a static composition under reduced motion", () => {
    const { container } = render(<ChristmasAnimation reducedMotion />);

    expect(container.querySelector(".zl-ev-christmas")).toHaveAttribute("data-reduced", "1");
    expect(container.querySelectorAll(".zl-ev-flake")).toHaveLength(0);
    expect(container.querySelectorAll(".zl-ev-star")).toHaveLength(0);
    expect(container.querySelector(".zl-ev-evergreen")).not.toBeNull();
  });
});
