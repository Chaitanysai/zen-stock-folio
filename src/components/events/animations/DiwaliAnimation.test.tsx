import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DiwaliAnimation from "./DiwaliAnimation";

describe("DiwaliAnimation", () => {
  it("renders three diyas, a rangoli and the configured motes", () => {
    const { container } = render(
      <DiwaliAnimation config={{ particleCount: 6, showRangoli: true }} />,
    );

    expect(container.querySelectorAll(".zl-ev-diya")).toHaveLength(3);
    expect(container.querySelector(".zl-ev-rangoli")).not.toBeNull();
    expect(container.querySelectorAll(".zl-ev-particle")).toHaveLength(6);
    expect(container.querySelector(".zl-ev-glow")).toHaveAttribute("data-tone", "warm");
  });

  it("falls back to the default mote count", () => {
    const { container } = render(<DiwaliAnimation />);
    expect(container.querySelectorAll(".zl-ev-particle")).toHaveLength(14);
  });

  it("honours showRangoli: false", () => {
    const { container } = render(<DiwaliAnimation config={{ showRangoli: false }} />);
    expect(container.querySelector(".zl-ev-rangoli")).toBeNull();
  });

  it("renders a static composition under reduced motion", () => {
    const { container } = render(<DiwaliAnimation reducedMotion />);

    expect(container.querySelector(".zl-ev-diwali")).toHaveAttribute("data-reduced", "1");
    expect(container.querySelectorAll(".zl-ev-particle")).toHaveLength(0);
    expect(container.querySelectorAll(".zl-ev-diya")).toHaveLength(3);
    expect(container.querySelector(".zl-ev-rangoli")).not.toBeNull();
  });

  it("keeps every flame inside its own SVG", () => {
    const { container } = render(<DiwaliAnimation />);
    const flames = container.querySelectorAll(".zl-ev-flame");
    expect(flames).toHaveLength(3);
    flames.forEach((flame) => expect(flame.closest("svg")).not.toBeNull());
  });
});
