import { describe, expect, it } from "vitest";
import {
  DASHBOARD_BASE,
  DEFAULT_DASHBOARD_SECTION,
  DASHBOARD_SECTION_IDS,
  sectionFromSlug,
  sectionPath,
  isDashboardSection,
} from "./routes";

describe("dashboard routes", () => {
  it("maps every section id to a unique URL path", () => {
    const paths = DASHBOARD_SECTION_IDS.map(sectionPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path.startsWith(`${DASHBOARD_BASE}/`)).toBe(true);
    }
  });

  it("round-trips a section id through its path segment", () => {
    for (const id of DASHBOARD_SECTION_IDS) {
      const slug = sectionPath(id).slice(`${DASHBOARD_BASE}/`.length);
      expect(sectionFromSlug(slug)).toBe(id);
    }
  });

  it("treats a missing segment (/dashboard) as the default section", () => {
    expect(sectionFromSlug(undefined)).toBe(DEFAULT_DASHBOARD_SECTION);
  });

  it("returns null for an unknown segment so the caller can show Not Found", () => {
    expect(sectionFromSlug("nope")).toBeNull();
    expect(sectionFromSlug("")).toBeNull();
  });

  it("recognises only known section ids", () => {
    expect(isDashboardSection("holdings")).toBe(true);
    expect(isDashboardSection(undefined)).toBe(false);
    expect(isDashboardSection("nope")).toBe(false);
  });
});
