import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDismissal,
  dismissalKey,
  isDismissed,
  pruneDismissals,
  rememberDismissal,
} from "./dismissal";

describe("festival dismissal persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds the correct key format", () => {
    expect(dismissalKey("diwali", "2026-11-09")).toBe("zf.festival.dismissed.diwali.2026-11-09");
    expect(dismissalKey("christmas", "2026-12-26")).toBe("zf.festival.dismissed.christmas.2026-12-26");
  });

  it("reports false when not dismissed", () => {
    expect(isDismissed("diwali", "2026-11-09")).toBe(false);
  });

  it("returns false when storage reads and cleanup throw", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    try {
      expect(isDismissed("diwali", "2026-11-09")).toBe(false);
    } finally {
      read.mockRestore();
      remove.mockRestore();
    }
  });

  it("remembers dismissal and reports true", () => {
    rememberDismissal("diwali", "2026-11-09");
    expect(isDismissed("diwali", "2026-11-09")).toBe(true);

    const raw = localStorage.getItem("zf.festival.dismissed.diwali.2026-11-09");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.until).toBe("2026-11-09");
    expect(parsed.dismissedAt).toBeDefined();
  });

  it("clears dismissal when restored", () => {
    rememberDismissal("diwali", "2026-11-09");
    expect(isDismissed("diwali", "2026-11-09")).toBe(true);

    clearDismissal("diwali", "2026-11-09");
    expect(isDismissed("diwali", "2026-11-09")).toBe(false);
    expect(localStorage.getItem("zf.festival.dismissed.diwali.2026-11-09")).toBeNull();
  });

  it("invalidates and purges corrupted storage entries", () => {
    localStorage.setItem("zf.festival.dismissed.diwali.2026-11-09", "{bad json");
    expect(isDismissed("diwali", "2026-11-09")).toBe(false);
    expect(localStorage.getItem("zf.festival.dismissed.diwali.2026-11-09")).toBeNull();
  });

  it("invalidates records with mismatched windowEnd", () => {
    localStorage.setItem(
      "zf.festival.dismissed.diwali.2026-11-09",
      JSON.stringify({ dismissedAt: "2026-11-08T00:00:00.000Z", until: "2025-11-01" }),
    );
    expect(isDismissed("diwali", "2026-11-09")).toBe(false);
    expect(localStorage.getItem("zf.festival.dismissed.diwali.2026-11-09")).toBeNull();
  });

  it("prunes expired records while retaining active ones", () => {
    // Past record (expired)
    localStorage.setItem(
      "zf.festival.dismissed.diwali.2025-11-01",
      JSON.stringify({ dismissedAt: "2025-10-31T00:00:00.000Z", until: "2025-11-01" }),
    );
    // Active record (future or today)
    localStorage.setItem(
      "zf.festival.dismissed.diwali.2026-11-09",
      JSON.stringify({ dismissedAt: "2026-11-08T00:00:00.000Z", until: "2026-11-09" }),
    );
    // Unrelated key (should never be touched)
    localStorage.setItem("theme", "dark");

    pruneDismissals("2026-11-08");

    expect(localStorage.getItem("zf.festival.dismissed.diwali.2025-11-01")).toBeNull();
    expect(localStorage.getItem("zf.festival.dismissed.diwali.2026-11-09")).not.toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
