import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayGlow } from "./DayGlow";

describe("DayGlow", () => {
  it.each(["up", "down", "flat"] as const)("renders the %s tone behind the page", (tone) => {
    const { container } = render(<DayGlow tone={tone} />);
    const glow = container.querySelector(".zf-dayglow");

    expect(glow).toHaveAttribute("data-tone", tone);
    expect(glow).toHaveAttribute("aria-hidden", "true");
  });
});
