import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import AccentPicker from "./AccentPicker";
import { ACCENT_STORAGE_KEY } from "@/lib/theme/accent";

describe("AccentPicker", () => {
  beforeEach(() => localStorage.clear());

  it("applies a preset and persists it", () => {
    render(<AccentPicker />);
    fireEvent.click(screen.getByLabelText("Accent colour"));
    fireEvent.click(screen.getByLabelText("Teal"));
    const stored = JSON.parse(localStorage.getItem(ACCENT_STORAGE_KEY) ?? "null");
    expect(stored.accent).toEqual({ h: 174, s: 72, l: 38 });
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("174 72% 38%");
  });
});
