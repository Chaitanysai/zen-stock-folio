// Pure portfolio calculations. These mirror the existing semantics in
// src/data/sampleData.ts (calcInvestedValue / calcFinalValue / calcProfitLoss)
// so every screen computes the same numbers from one place.
//
// Conventions:
// - Cost basis  = entryPrice × quantity (no fees; fees are not in the data model)
// - Value       = exitPrice × quantity for closed rows, cmp × quantity for active rows
// - P/L         = value − cost
// - Return %    = P/L ÷ cost × 100, and 0 when cost is 0 (never divide by zero)
// Money is kept as plain numbers here; all inputs are validated upstream.

export type PositionStatus = "Active" | "Sold Profit" | "Sold Loss";

export interface Position {
  quantity: number;
  entryPrice: number;
  cmp: number;
  exitPrice?: number;
  status: PositionStatus;
}

export function costBasis(p: Position): number {
  return p.entryPrice * p.quantity;
}

export function marketValue(p: Position): number {
  const closed = p.status !== "Active" && p.exitPrice !== undefined;
  return (closed ? p.exitPrice! : p.cmp) * p.quantity;
}

export function profitLoss(p: Position): number {
  return marketValue(p) - costBasis(p);
}

export function returnPercent(p: Position): number {
  const cost = costBasis(p);
  return cost === 0 ? 0 : (profitLoss(p) / cost) * 100;
}

export interface PortfolioTotals {
  invested: number;
  currentValue: number;
  profitLoss: number;
  returnPercent: number;
}

export function portfolioTotals(positions: Position[]): PortfolioTotals {
  const invested = positions.reduce((s, p) => s + costBasis(p), 0);
  const currentValue = positions.reduce((s, p) => s + marketValue(p), 0);
  const profitLoss = currentValue - invested;
  const returnPercent = invested === 0 ? 0 : (profitLoss / invested) * 100;
  return { invested, currentValue, profitLoss, returnPercent };
}

export interface AllocationSlice {
  key: string;
  value: number;
  percent: number;
}

// Allocation by market value of the given positions (open or closed as passed in).
// Percentages sum to 100 unless the total value is 0, in which case all are 0.
export function allocationBy<T>(
  items: T[],
  keyOf: (item: T) => string,
  valueOf: (item: T) => number
): AllocationSlice[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    totals.set(key, (totals.get(key) ?? 0) + valueOf(item));
  }
  const grand = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([key, value]) => ({
      key,
      value,
      percent: grand === 0 ? 0 : (value / grand) * 100,
    }))
    .sort((a, b) => b.value - a.value);
}
