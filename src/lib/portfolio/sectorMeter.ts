export const SECTOR_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--muted-foreground))",
] as const;

export const CONCENTRATION_PCT = 40;

type Slice = { sector: string; value: number; percentage: number };

export interface SectorMeterSegment {
  id: string;
  label: string;
  pct: number;
  widthPct: number;
  colorIndex: number;
  color: string;
  isOther: boolean;
}

/** Slices keep their true share; CSS gives sub-pixel segments a 2px visual floor. */
export function buildSectorSegments(slices: Slice[]): SectorMeterSegment[] {
  return slices.map((slice, index) => ({
    id: slice.sector,
    label: slice.sector,
    pct: slice.percentage,
    widthPct: slice.percentage,
    colorIndex: index,
    color: SECTOR_COLORS[index % SECTOR_COLORS.length],
    isOther: slice.sector === "Other",
  }));
}

export function isConcentrated(slices: Slice[]): boolean {
  const top = slices[0];
  return Boolean(top && top.percentage >= CONCENTRATION_PCT);
}
