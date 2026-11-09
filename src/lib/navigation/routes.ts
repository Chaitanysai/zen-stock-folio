// Central route definitions for the dashboard.
//
// The dashboard used to be a single `/` route whose section lived only in React
// state, so sections had no URL, Back/Forward did nothing, and a refresh lost
// the selection. This module is the single source of truth that maps a section
// id (the value the shell and its components already use) to a URL slug and
// back again, so the URL — not component state — selects the section.

/** Path prefix every authenticated dashboard section lives under. */
export const DASHBOARD_BASE = "/dashboard";

/**
 * Section ids, in sidebar order. The id strings are the existing `ActiveTab`
 * values in `pages/Index.tsx` and must not change: components, analytics and
 * tests already key off them.
 */
export const DASHBOARD_SECTION_IDS = [
  "overview",
  "holdings",
  "trades",
  "history",
  "journal",
  "charts",
  "sector",
  "analytics",
  "watchlist",
  "news",
  "ai",
  "alerts",
  "export",
  "brokers",
] as const;

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number];

/** The section shown at `/dashboard` with no further path segment. */
export const DEFAULT_DASHBOARD_SECTION: DashboardSectionId = "overview";

/**
 * URL slugs. Kept stable and human-readable; where a slug differs from the id
 * (e.g. `holdings` -> `portfolio`, `analytics` -> `performance`, `ai` ->
 * `insights`, `sector` -> `sectors`) the slug is the friendlier public name.
 * Each slug is unique, so the reverse lookup is unambiguous.
 */
const SLUG_BY_SECTION: Record<DashboardSectionId, string> = {
  overview: "overview",
  holdings: "portfolio",
  trades: "trades",
  history: "history",
  journal: "journal",
  charts: "charts",
  sector: "sectors",
  analytics: "performance",
  watchlist: "watchlist",
  news: "news",
  ai: "insights",
  alerts: "alerts",
  export: "export",
  brokers: "brokers",
};

const SECTION_BY_SLUG: Record<string, DashboardSectionId> = Object.fromEntries(
  (Object.entries(SLUG_BY_SECTION) as [DashboardSectionId, string][]).map(
    ([id, slug]) => [slug, id],
  ),
);

/** Absolute path for a section, e.g. `sectionPath("holdings")` -> `/dashboard/portfolio`. */
export function sectionPath(id: DashboardSectionId): string {
  return `${DASHBOARD_BASE}/${SLUG_BY_SECTION[id]}`;
}

/**
 * Resolve a `:section` path segment to a section id. `undefined` (the bare
 * `/dashboard` route) resolves to the default section; an unknown segment
 * returns `null` so the caller can render Not Found instead of silently
 * falling back.
 */
export function sectionFromSlug(slug: string | undefined): DashboardSectionId | null {
  if (slug === undefined) return DEFAULT_DASHBOARD_SECTION;
  return SECTION_BY_SLUG[slug] ?? null;
}

/** True when `id` is a known dashboard section (guards the shell's params). */
export function isDashboardSection(id: string | undefined | null): id is DashboardSectionId {
  return id !== undefined && id !== null && (DASHBOARD_SECTION_IDS as readonly string[]).includes(id);
}
