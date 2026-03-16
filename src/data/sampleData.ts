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
  const parseDate = (d: string): Date => {
    if (!d) return new Date();
    // Format 1: YYYY-MM-DD (from HTML date input)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split("-").map(Number);
      return new Date(y, m - 1, day);
    }
    // Format 2: DD-MMM-YYYY (e.g. 16-Feb-2026)
    if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(d)) {
      const parts = d.split("-");
      return new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
    }
    // Format 3: DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) {
      const [day, m, y] = d.split("/").map(Number);
      return new Date(y, m - 1, day);
    }
    // Fallback: let JS try
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  };
  const entry = parseDate(entryDate);
  const exit  = exitDate ? parseDate(exitDate) : new Date();
  if (isNaN(entry.getTime()) || isNaN(exit.getTime())) return 0;
  return Math.max(0, Math.round((exit.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24)));
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

// ════════════════════════════════════════════════════════════════════════════
// F&O DATA TYPES + SAMPLE DATA
// ════════════════════════════════════════════════════════════════════════════

export type FnOInstrumentType = "FUT" | "CE" | "PE";
export type FnOStatus = "Open" | "Closed Profit" | "Closed Loss" | "Expired";

export interface FnOTrade {
  id:              string;
  symbol:          string;       // e.g. "RELIANCE", "TCS"
  instrumentType:  FnOInstrumentType;
  strike?:         number;       // null for futures
  expiry:          string;       // "27-Mar-2025" format
  lotSize:         number;       // NSE standard lot size
  lots:            number;       // number of lots traded
  entryPrice:      number;       // premium per unit (options) or futures price
  exitPrice?:      number;       // filled when closed
  entryDate:       string;
  exitDate?:       string;
  status:          FnOStatus;
  ltp?:            number;       // live last traded price (from API)
  iv?:             number;       // implied volatility % (options only)
  delta?:          number;       // delta (options only)
  notes?:          string;
}

// NSE standard lot sizes (as of 2025)
export const LOT_SIZES: Record<string, number> = {
  // ── Nifty 50 & large-cap F&O stocks (NSE lot sizes as of 2025-26) ──
  RELIANCE:      250,
  TCS:           150,
  INFY:          300,
  HDFCBANK:      550,
  ICICIBANK:     700,
  SBIN:          1500,
  TATAMOTORS:    1500,
  WIPRO:         1500,
  BAJFINANCE:    125,
  MARUTI:        100,
  AXISBANK:      1200,
  HCLTECH:       700,
  LT:            375,
  SUNPHARMA:     700,
  TATASTEEL:     3000,
  ADANIENT:      250,
  KOTAKBANK:     400,
  ASIANPAINT:    200,
  ULTRACEMCO:    200,
  ONGC:          3850,
  // ── IT & Midcap tech ──
  OFSS:          75,       // Oracle Financial Services
  MPHASIS:       275,
  LTTS:          150,
  PERSISTENT:    150,
  COFORGE:       150,
  TECHM:         600,
  // ── Banking & Finance ──
  FEDERALBNK:    5000,
  INDUSINDBK:    500,
  BANDHANBNK:    2500,
  PNB:           8000,
  BANKBARODA:    3850,
  CANBK:         4500,
  CHOLAFIN:      500,
  MUTHOOTFIN:    375,
  BAJAJFINSV:    125,
  HDFCLIFE:      1100,
  SBILIFE:       750,
  ICICIGI:       375,
  // ── Auto & EV ──
  HEROMOTOCO:    300,
  BAJAJ-AUTO:    250,
  EICHERMOT:     175,
  M&M:           700,
  TVSMOTOR:      700,
  // ── Energy & Infra ──
  POWERGRID:     3850,
  NTPC:          3000,
  COALINDIA:     4200,
  BPCL:          3850,
  IOC:           5500,
  GAIL:          5850,
  ADANIPORTS:    1250,
  ADANIGREEN:    500,
  ADANITRANS:    500,
  TORNTPOWER:    500,
  // ── Pharma & Healthcare ──
  DRREDDY:       125,
  CIPLA:         650,
  DIVISLAB:      300,
  BIOCON:        2500,
  APOLLOHOSP:    250,
  // ── FMCG & Consumer ──
  HINDUNILVR:    300,
  NESTLEIND:     40,
  BRITANNIA:     200,
  ITC:           3200,
  DABUR:         2750,
  MARICO:        2000,
  GODREJCP:      1000,
  // ── Metals & Materials ──
  HINDALCO:      1700,
  JSWSTEEL:      1350,
  VEDL:          4000,
  NMDC:          7500,
  SAIL:          7500,
  // ── Telecom & Media ──
  BHARTIARTL:    475,
  // ── Index derivatives (unit = 1 per lot) ──
  NIFTY:         50,
  BANKNIFTY:     15,
  FINNIFTY:      40,
  MIDCPNIFTY:    75,
  SENSEX:        10,
};

// Helper: get lot size with fallback
export function getLotSize(symbol: string): number {
  return LOT_SIZES[symbol.toUpperCase()] ?? 500;
}

// Helper: calc F&O P&L
export function calcFnOPnL(trade: FnOTrade): number {
  const exitP = trade.exitPrice ?? trade.ltp ?? trade.entryPrice;
  const direction = trade.instrumentType === "PE"
    ? (trade.entryPrice - exitP)   // PE: profit when price falls
    : (exitP - trade.entryPrice);  // CE / FUT: profit when price rises
  return direction * trade.lots * trade.lotSize;
}

// Helper: calc F&O invested (margin approximation)
export function calcFnOInvested(trade: FnOTrade): number {
  // Options: premium paid = entry × lots × lotSize
  // Futures: margin ≈ 15% of notional (approximate)
  if (trade.instrumentType === "FUT") {
    return trade.entryPrice * trade.lots * trade.lotSize * 0.15;
  }
  return trade.entryPrice * trade.lots * trade.lotSize;
}

// Helper: format expiry to display
export function fmtExpiry(expiry: string): string {
  try {
    const parts = expiry.split("-");
    if (parts.length === 3) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const d = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      const y = parts[2].slice(-2);
      return `${d} ${months[m]} '${y}`;
    }
    return expiry;
  } catch { return expiry; }
}

// Sample F&O trades data
export const fnOTradesData: FnOTrade[] = [
  {
    id: "fno-1",
    symbol: "RELIANCE",
    instrumentType: "FUT",
    expiry: "27-03-2025",
    lotSize: 250,
    lots: 1,
    entryPrice: 2510.0,
    exitPrice: 2590.0,
    entryDate: "10-Mar-2025",
    exitDate: "20-Mar-2025",
    status: "Closed Profit",
    notes: "Positional long on breakout",
  },
  {
    id: "fno-2",
    symbol: "TCS",
    instrumentType: "CE",
    strike: 4000,
    expiry: "27-03-2025",
    lotSize: 150,
    lots: 2,
    entryPrice: 85.0,
    exitPrice: 42.0,
    entryDate: "15-Mar-2025",
    exitDate: "25-Mar-2025",
    status: "Closed Loss",
    notes: "Earnings play — went against",
  },
  {
    id: "fno-3",
    symbol: "HDFCBANK",
    instrumentType: "PE",
    strike: 1700,
    expiry: "24-04-2025",
    lotSize: 550,
    lots: 1,
    entryPrice: 32.5,
    entryDate: "01-Apr-2025",
    status: "Open",
    ltp: 48.0,
    iv: 18.5,
    delta: -0.38,
    notes: "Hedge against banking sector weakness",
  },
  {
    id: "fno-4",
    symbol: "RELIANCE",
    instrumentType: "FUT",
    expiry: "24-04-2025",
    lotSize: 250,
    lots: 2,
    entryPrice: 2465.0,
    entryDate: "05-Apr-2025",
    status: "Open",
    ltp: 2490.0,
    notes: "Swing trade — Q4 results play",
  },
  {
    id: "fno-5",
    symbol: "INFY",
    instrumentType: "CE",
    strike: 1800,
    expiry: "24-04-2025",
    lotSize: 300,
    lots: 3,
    entryPrice: 28.0,
    entryDate: "08-Apr-2025",
    status: "Open",
    ltp: 35.5,
    iv: 22.1,
    delta: 0.45,
    notes: "IT sector momentum",
  },
];