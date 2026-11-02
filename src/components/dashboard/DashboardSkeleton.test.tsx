import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardSkeleton } from "./DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("announces loading once and hides decorative blocks", () => {
    const { container } = render(<DashboardSkeleton />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your dashboard");
    expect(container.querySelectorAll(".zf-skeleton-block").length).toBeGreaterThan(8);
    for (const node of container.querySelectorAll(".zf-skeleton-block")) {
      expect(node.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
