export interface PortfolioStock {
  ticker: string;
  stockName: string;
  entryDate: string;
  entryPrice: number;
  cmp: number;
  weekHigh52: number;
  quantity: number;
  exitPrice?: number;
  exitDate?: string;
  status: "Active" | "Sold Profit" | "Sold Loss";
}

export interface TradeStrategy {
  ticker: string;
  entryPrice: number;
  livePrice: number;
  target1: number;
  target2: number;
  target3: number;
  stopLoss: number;
  trailingStopLoss: number;
}

export interface WatchlistStock {
  stockName: string;
  cmp: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  rsi: number;
  sma50: number;
  ema10: number;
  ema21: number;
}

export const portfolioData: PortfolioStock[] = [
  { ticker: "ASTERDM", stockName: "Aster DM Health Care", entryDate: "16-Feb-2026", entryPrice: 608.8, cmp: 673.95, weekHigh52: 732.2, quantity: 38, exitPrice: 674.25, exitDate: "6-Mar-2026", status: "Sold Profit" },
  { ticker: "RELIANCE", stockName: "Reliance Industries", entryDate: "10-Jan-2026", entryPrice: 2450.0, cmp: 2612.35, weekHigh52: 2856.15, quantity: 15, status: "Active" },
  { ticker: "TCS", stockName: "Tata Consultancy Services", entryDate: "22-Jan-2026", entryPrice: 3920.5, cmp: 3845.2, weekHigh52: 4256.8, quantity: 8, status: "Active" },
  { ticker: "HDFCBANK", stockName: "HDFC Bank", entryDate: "5-Feb-2026", entryPrice: 1685.0, cmp: 1742.8, weekHigh52: 1880.0, quantity: 25, status: "Active" },
  { ticker: "INFY", stockName: "Infosys", entryDate: "12-Dec-2025", entryPrice: 1890.0, cmp: 1756.4, weekHigh52: 2012.0, quantity: 20, exitPrice: 1756.4, exitDate: "28-Feb-2026", status: "Sold Loss" },
  { ticker: "TATAMOTORS", stockName: "Tata Motors", entryDate: "18-Feb-2026", entryPrice: 745.6, cmp: 812.3, weekHigh52: 890.5, quantity: 45, status: "Active" },
  { ticker: "WIPRO", stockName: "Wipro", entryDate: "1-Mar-2026", entryPrice: 542.0, cmp: 558.75, weekHigh52: 612.0, quantity: 60, status: "Active" },
  { ticker: "SBIN", stockName: "State Bank of India", entryDate: "25-Jan-2026", entryPrice: 782.0, cmp: 805.5, weekHigh52: 912.0, quantity: 30, exitPrice: 805.5, exitDate: "5-Mar-2026", status: "Sold Profit" },
];

export const tradeStrategies: TradeStrategy[] = [
  { ticker: "RELIANCE", entryPrice: 2450.0, livePrice: 2612.35, target1: 2580, target2: 2700, target3: 2850, stopLoss: 2380, trailingStopLoss: 2520 },
  { ticker: "TCS", entryPrice: 3920.5, livePrice: 3845.2, target1: 4050, target2: 4180, target3: 4350, stopLoss: 3800, trailingStopLoss: 3800 },
  { ticker: "HDFCBANK", entryPrice: 1685.0, livePrice: 1742.8, target1: 1750, target2: 1820, target3: 1900, stopLoss: 1640, trailingStopLoss: 1700 },
  { ticker: "TATAMOTORS", entryPrice: 745.6, livePrice: 812.3, target1: 790, target2: 840, target3: 890, stopLoss: 710, trailingStopLoss: 770 },
  { ticker: "WIPRO", entryPrice: 542.0, livePrice: 558.75, target1: 570, target2: 595, target3: 620, stopLoss: 520, trailingStopLoss: 540 },
];

export const watchlistData: WatchlistStock[] = [
  { stockName: "GENUSPOWER", cmp: 257, entryZoneLow: 362, entryZoneHigh: 365, stopLoss: 348, target1: 374, target2: 390, target3: 432, rsi: 42.5, sma50: 359.27, ema10: 361.42, ema21: 363.89 },
  { stockName: "IRCTC", cmp: 845, entryZoneLow: 830, entryZoneHigh: 850, stopLoss: 810, target1: 880, target2: 920, target3: 980, rsi: 55.2, sma50: 842.15, ema10: 838.6, ema21: 840.2 },
  { stockName: "POLYCAB", cmp: 5420, entryZoneLow: 5350, entryZoneHigh: 5450, stopLoss: 5200, target1: 5600, target2: 5800, target3: 6100, rsi: 61.8, sma50: 5380.5, ema10: 5410.0, ema21: 5395.0 },
  { stockName: "DEEPAKNTR", cmp: 2180, entryZoneLow: 2150, entryZoneHigh: 2200, stopLoss: 2080, target1: 2300, target2: 2450, target3: 2600, rsi: 48.3, sma50: 2165.0, ema10: 2175.5, ema21: 2170.0 },
];

// Calculation helpers
export function calcInvestedValue(stock: PortfolioStock): number {
  return stock.entryPrice * stock.quantity;
}

export function calcProfitLoss(stock: PortfolioStock): number {
  if (stock.status !== "Active" && stock.exitPrice) {
    return (stock.exitPrice - stock.entryPrice) * stock.quantity;
  }
  return (stock.cmp - stock.entryPrice) * stock.quantity;
}

export function calcFinalValue(stock: PortfolioStock): number {
  if (stock.status !== "Active" && stock.exitPrice) {
    return stock.exitPrice * stock.quantity;
  }
  return stock.cmp * stock.quantity;
}

export function calcWeeklyGainLoss(stock: PortfolioStock): number {
  const price = stock.status !== "Active" && stock.exitPrice ? stock.exitPrice : stock.cmp;
  return ((price - stock.entryPrice) / stock.entryPrice) * 100;
}

export function calcPercentChange(entry: number, live: number): number {
  return ((live - entry) / entry) * 100;
}

export function getTargetStatus(strategy: TradeStrategy): string {
  if (strategy.livePrice >= strategy.target3) return "Reached T3";
  if (strategy.livePrice >= strategy.target2) return "Reached T2";
  if (strategy.livePrice >= strategy.target1) return "Reached T1";
  return "Below T1";
}

export function getSLRiskIndicator(strategy: TradeStrategy): { label: string; emoji: string; level: "safe" | "risk" | "hit" } {
  const slDistance = ((strategy.livePrice - strategy.stopLoss) / strategy.stopLoss) * 100;
  if (strategy.livePrice < strategy.stopLoss) return { label: "Stop Loss Hit", emoji: "❌", level: "hit" };
  if (slDistance < 2) return { label: "Risk", emoji: "⚠️", level: "risk" };
  return { label: "Safe (Above SL)", emoji: "✅", level: "safe" };
}

export function getProgressPercent(strategy: TradeStrategy): number {
  const range = strategy.target3 - strategy.entryPrice;
  const current = strategy.livePrice - strategy.entryPrice;
  return Math.max(0, Math.min(100, (current / range) * 100));
}

export function getWatchlistStatus(stock: WatchlistStock): { label: string; emoji: string; level: "entry" | "target" | "sl" | "neutral" } {
  if (stock.cmp < stock.stopLoss) return { label: "SL Hit", emoji: "❌", level: "sl" };
  if (stock.cmp >= stock.entryZoneLow && stock.cmp <= stock.entryZoneHigh) return { label: "Entry Opportunity", emoji: "🟢", level: "entry" };
  if (stock.cmp > stock.target1) return { label: "Target Hit", emoji: "🎯", level: "target" };
  return { label: "Watching", emoji: "👀", level: "neutral" };
}
