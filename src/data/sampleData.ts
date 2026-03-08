export interface PortfolioStock {
  ticker: string;
  stockName: string;
  sector?: string;
  entryDate: string;
  entryPrice: number;
  cmp: number;
  weekHigh52: number;
  weekLow52?: number;
  dailyChange?: number;
  quantity: number;
  exitPrice?: number;
  exitDate?: string;
  status: "Active" | "Sold Profit" | "Sold Loss";
  notes?: TradeJournalEntry;
}

export interface TradeJournalEntry {
  tradeReason?: string;
  marketCondition?: string;
  strategyUsed?: string;
  mistakesLearned?: string;
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

export interface PriceAlert {
  id: string;
  ticker: string;
  type: "target_hit" | "sl_hit" | "entry_zone";
  targetPrice: number;
  direction: "above" | "below" | "between";
  triggered: boolean;
  createdAt: string;
}

export const SECTOR_MAP: Record<string, string> = {
  ASTERDM: "Healthcare",
  RELIANCE: "Energy",
  TCS: "IT",
  HDFCBANK: "Banking",
  INFY: "IT",
  TATAMOTORS: "Automobile",
  WIPRO: "IT",
  SBIN: "Banking",
  GENUSPOWER: "Power",
  IRCTC: "Travel",
  POLYCAB: "Cables",
  DEEPAKNTR: "Chemicals",
  SILVERBEES: "ETF",
  SARDAEN: "Metals",
};

export const portfolioData: PortfolioStock[] = [
  { ticker: "ASTERDM", stockName: "Aster DM Health Care", sector: "Healthcare", entryDate: "16-Feb-2026", entryPrice: 608.8, cmp: 673.95, weekHigh52: 732.2, weekLow52: 380.5, quantity: 38, exitPrice: 674.25, exitDate: "6-Mar-2026", status: "Sold Profit", notes: { tradeReason: "Breakout above resistance with volume", strategyUsed: "Swing trade", marketCondition: "Bullish", mistakesLearned: "Could have held longer" } },
  { ticker: "RELIANCE", stockName: "Reliance Industries", sector: "Energy", entryDate: "10-Jan-2026", entryPrice: 2450.0, cmp: 2612.35, weekHigh52: 2856.15, weekLow52: 2220.0, quantity: 15, status: "Active" },
  { ticker: "TCS", stockName: "Tata Consultancy Services", sector: "IT", entryDate: "22-Jan-2026", entryPrice: 3920.5, cmp: 3845.2, weekHigh52: 4256.8, weekLow52: 3310.0, quantity: 8, status: "Active" },
  { ticker: "HDFCBANK", stockName: "HDFC Bank", sector: "Banking", entryDate: "5-Feb-2026", entryPrice: 1685.0, cmp: 1742.8, weekHigh52: 1880.0, weekLow52: 1430.0, quantity: 25, status: "Active" },
  { ticker: "INFY", stockName: "Infosys", sector: "IT", entryDate: "12-Dec-2025", entryPrice: 1890.0, cmp: 1756.4, weekHigh52: 2012.0, weekLow52: 1358.0, quantity: 20, exitPrice: 1756.4, exitDate: "28-Feb-2026", status: "Sold Loss", notes: { tradeReason: "EMA crossover setup", strategyUsed: "Momentum", marketCondition: "Sideways", mistakesLearned: "IT sector was weak, should have waited" } },
  { ticker: "TATAMOTORS", stockName: "Tata Motors", sector: "Automobile", entryDate: "18-Feb-2026", entryPrice: 745.6, cmp: 812.3, weekHigh52: 890.5, weekLow52: 580.0, quantity: 45, status: "Active" },
  { ticker: "WIPRO", stockName: "Wipro", sector: "IT", entryDate: "1-Mar-2026", entryPrice: 542.0, cmp: 558.75, weekHigh52: 612.0, weekLow52: 390.0, quantity: 60, status: "Active" },
  { ticker: "SBIN", stockName: "State Bank of India", sector: "Banking", entryDate: "25-Jan-2026", entryPrice: 782.0, cmp: 805.5, weekHigh52: 912.0, weekLow52: 600.0, quantity: 30, exitPrice: 805.5, exitDate: "5-Mar-2026", status: "Sold Profit", notes: { tradeReason: "Support bounce near 200-DMA", strategyUsed: "Support/Resistance", marketCondition: "Bullish" } },
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

export function calcHoldingDays(entryDate: string, exitDate?: string): number {
  const parseDate = (d: string) => {
    const parts = d.split("-");
    return new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
  };
  const entry = parseDate(entryDate);
  const exit = exitDate ? parseDate(exitDate) : new Date();
  return Math.max(1, Math.round((exit.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getTradeAnalytics(stocks: PortfolioStock[]) {
  const closedTrades = stocks.filter(s => s.status !== "Active");
  const winners = closedTrades.filter(s => calcProfitLoss(s) > 0);
  const losers = closedTrades.filter(s => calcProfitLoss(s) <= 0);
  
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length) * 100 : 0;
  const avgProfit = winners.length > 0 ? winners.reduce((s, w) => s + calcProfitLoss(w), 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((s, l) => s + calcProfitLoss(l), 0) / losers.length) : 0;
  const riskRewardRatio = avgLoss > 0 ? avgProfit / avgLoss : 0;
  const totalTrades = stocks.length;
  const avgHoldingDays = closedTrades.length > 0 ? closedTrades.reduce((s, t) => s + calcHoldingDays(t.entryDate, t.exitDate), 0) / closedTrades.length : 0;
  const largestWin = winners.length > 0 ? Math.max(...winners.map(w => calcProfitLoss(w))) : 0;
  const largestLoss = losers.length > 0 ? Math.min(...losers.map(l => calcProfitLoss(l))) : 0;

  return { winRate, avgProfit, avgLoss, riskRewardRatio, totalTrades, closedTrades: closedTrades.length, avgHoldingDays, largestWin, largestLoss };
}

export function getSectorAllocation(stocks: PortfolioStock[]): { sector: string; value: number; percentage: number }[] {
  const sectorMap = new Map<string, number>();
  const activeStocks = stocks.filter(s => s.status === "Active");
  
  activeStocks.forEach(s => {
    const sector = s.sector || SECTOR_MAP[s.ticker] || "Other";
    sectorMap.set(sector, (sectorMap.get(sector) || 0) + calcInvestedValue(s));
  });
  
  const total = activeStocks.reduce((s, st) => s + calcInvestedValue(st), 0);
  return Array.from(sectorMap.entries()).map(([sector, value]) => ({
    sector,
    value,
    percentage: total > 0 ? (value / total) * 100 : 0,
  })).sort((a, b) => b.value - a.value);
}
