import { describe, expect, it } from "vitest";
import { DASHBOARD_SECTION_IDS } from "../navigation/routes";
import { ASSISTANT_TOOL_NAMES, SECTION_SUGGESTIONS, suggestionsForSection } from "./toolCatalog";

describe("assistant section suggestions (B1.2)", () => {
  it("has a non-empty suggestion set for every canonical section", () => {
    expect(DASHBOARD_SECTION_IDS).toHaveLength(14);
    for (const section of DASHBOARD_SECTION_IDS) {
      const suggestions = suggestionsForSection(section);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((value) => value.trim().length > 0)).toBe(true);
      expect(SECTION_SUGGESTIONS[section]).toBe(suggestions);
    }
  });

  it("falls back to the general set when the section is unknown", () => {
    expect(suggestionsForSection(null).length).toBeGreaterThan(0);
    expect(suggestionsForSection()).toBe(suggestionsForSection(null));
  });

  it("keeps the read-only catalog intact", () => {
    expect(ASSISTANT_TOOL_NAMES.length).toBe(7);
    expect(ASSISTANT_TOOL_NAMES).not.toContain("write_trade");
  });
});
