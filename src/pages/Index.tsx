import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LayoutDashboard, TrendingUp, ScrollText, Eye,
  Brain, History, BarChart3, Bell, RefreshCw,
  LogOut, Settings, PieChart, Zap, ChevronLeft,
  ChevronRight, Search, TrendingDown,
  Activity, Wallet, Award, Newspaper, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import {
  portfolioData as initialData, PortfolioStock,
  tradeStrategies as initialTrades, TradeStrategy,
  watchlistData as initialWatchlist, WatchlistStock,
  PriceAlert, TradeJournalEntry,
  calcInvestedValue, calcFinalValue, calcProfitLoss,
  FnOTrade, fnOTradesData, calcFnOInvested, calcFnOPnL,
} from "@/data/sampleData";
import PortfolioTable        from "@/components/PortfolioTable";
import TradeStrategyTable    from "@/components/TradeStrategyTable";
import FnOTable             from "@/components/FnOTable";
import WatchlistTable        from "@/components/WatchlistTable";
import PortfolioCharts       from "@/components/PortfolioCharts";
import RiskAnalysis          from "@/components/RiskAnalysis";
import TradeAnalytics        from "@/components/TradeAnalytics";
import TradeHistory          from "@/components/TradeHistory";
import TradeJournal          from "@/components/TradeJournal";
import SectorDiversification from "@/components/SectorDiversification";
import PriceAlerts           from "@/components/PriceAlerts";
import AIInsights            from "@/components/AIInsights";
import StockNewsFeed         from "@/components/StockNewsFeed";
import ExportPortfolio       from "@/components/ExportPortfolio";
import AuthModal             from "@/components/AuthModal";
import { useToast }          from "@/hooks/use-toast";
import { useLivePrices }     from "@/hooks/useLivePrices";
import { usePortfolioSync, loadFromLocal, PortfolioSnapshot } from "@/hooks/usePortfolioSync";
import { useAuth }           from "@/contexts/AuthContext";
import { buildTrendSeries, isSameTradingDay } from "@/lib/trading";

// ─── Types ────────────────────────────────────────────────────────────────────
type ActiveTab =
  | "overview" | "holdings" | "trades" | "watchlist" | "ai"
  | "charts" | "analytics" | "history" | "journal"
  | "sector" | "alerts" | "export" | "news";

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { id: "overview",   label: "Dashboard",   icon: LayoutDashboard },
      { id: "holdings",   label: "Portfolio",   icon: Wallet },
      { id: "trades",     label: "Trades",      icon: ScrollText },
      { id: "history",    label: "History",     icon: History },
    ],
  },
  {
    label: "Analytics",
    items: [
      { id: "charts",     label: "Charts",      icon: BarChart3 },
      { id: "sector",     label: "Sectors",     icon: PieChart },
      { id: "analytics",  label: "Performance", icon: Activity },
    ],
  },
  {
    label: "Tools",
    items: [
      { id: "watchlist",  label: "Watchlist",   icon: Eye },
      { id: "news",       label: "News Feed",   icon: Newspaper },
      { id: "ai",         label: "AI Insights", icon: Brain },
      { id: "alerts",     label: "Alerts",      icon: Bell },
      { id: "export",     label: "Export",      icon: Zap },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.abs(n).toFixed(0)}`;
}
function fmtNum(n: number) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function sign(n: number) { return n >= 0 ? "+" : "−"; }
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Design System CSS ────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&family=Geist:wght@300;400;500;600;700;800;900&display=swap');

.zf {
  --bg-app:       hsl(220 18% 95%);
  --bg-sidebar:   hsl(222 28% 11%);
  --bg-card:      hsl(0 0% 99%);
  --bg-surface:   hsl(220 14% 92%);
  --bg-hover:     hsl(220 70% 95%);
  --bg-input:     hsl(220 14% 92%);

  --blue:         hsl(220 85% 48%);
  --blue-dim:     rgba(59,130,246,.12);
  --blue-bd:      rgba(59,130,246,.25);

  --tx-900:       hsl(220 25% 10%);
  --tx-700:       hsl(220 20% 24%);
  --tx-500:       hsl(220 14% 46%);
  --tx-400:       hsl(220 12% 58%);
  --tx-300:       hsl(220 10% 72%);

  --bd-200:       hsl(220 14% 82%);
  --bd-100:       hsl(220 14% 89%);
  --bd-50:        hsl(220 14% 94%);

  --green:        hsl(152 70% 34%);
  --green-bg:     hsl(152 70% 34% / .08);
  --green-bd:     hsl(152 70% 34% / .22);
  --red:          hsl(4 84% 52%);
  --red-bg:       hsl(4 84% 52% / .08);
  --red-bd:       hsl(4 84% 52% / .22);
  --amber:        hsl(40 90% 44%);
  --amber-bg:     hsl(40 90% 44% / .08);
  --amber-bd:     hsl(40 90% 44% / .22);

  --sh-1: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --sh-2: 0 4px 16px rgba(0,0,0,.08);

  --ff-body: 'Geist', -apple-system, sans-serif;
  --ff-mono: 'Geist Mono', 'SF Mono', monospace;

  font-family: var(--ff-body);
  background: var(--bg-app);
  min-height: 100vh;
  color: var(--tx-900);
  display: flex;
  overflow: visible;
  height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* Dark mode */
.dark .zf {
  --bg-app:       hsl(222 28% 8%);
  --bg-sidebar:   hsl(222 32% 7%);
  --bg-card:      hsl(222 28% 11%);
  --bg-surface:   hsl(222 22% 15%);
  --bg-hover:     hsl(220 28% 15%);
  --bg-input:     hsl(222 22% 13%);

  --blue:         hsl(220 80% 62%);
  --blue-dim:     rgba(96,165,250,.12);
  --blue-bd:      rgba(96,165,250,.25);

  --tx-900:       hsl(220 20% 92%);
  --tx-700:       hsl(220 18% 76%);
  --tx-500:       hsl(220 14% 54%);
  --tx-400:       hsl(220 12% 44%);
  --tx-300:       hsl(220 10% 32%);

  --bd-200:       hsl(222 18% 28%);
  --bd-100:       hsl(222 18% 22%);
  --bd-50:        hsl(222 18% 17%);

  --green:        hsl(152 58% 48%);
  --green-bg:     hsl(152 58% 48% / .10);
  --green-bd:     hsl(152 58% 48% / .22);
  --red:          hsl(4 76% 58%);
  --red-bg:       hsl(4 76% 58% / .10);
  --red-bd:       hsl(4 76% 58% / .22);
  --amber:        hsl(40 85% 54%);
  --amber-bg:     hsl(40 85% 54% / .10);
  --amber-bd:     hsl(40 85% 54% / .22);

  --sh-1: 0 1px 4px rgba(0,0,0,.3);
  --sh-2: 0 4px 20px rgba(0,0,0,.4);
}

/* Animations */
@keyframes zf-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
@keyframes zf-spin  { to { transform:rotate(360deg); } }
@keyframes zf-fade  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes zf-scalein { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }

.zf-a1 { animation: zf-fade .38s cubic-bezier(.22,1,.36,1) both; }
.zf-a2 { animation: zf-fade .38s .06s cubic-bezier(.22,1,.36,1) both; }
.zf-a3 { animation: zf-fade .38s .12s cubic-bezier(.22,1,.36,1) both; }
.zf-a4 { animation: zf-fade .38s .18s cubic-bezier(.22,1,.36,1) both; }
.zf-a5 { animation: zf-fade .38s .24s cubic-bezier(.22,1,.36,1) both; }
.zf-a6 { animation: zf-fade .38s .30s cubic-bezier(.22,1,.36,1) both; }
.zf-spin { animation: zf-spin .9s linear infinite; }

/* ── SIDEBAR ── */
.zf-sidebar {
  width: 240px; min-width: 240px; flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid rgba(255,255,255,.06);
  height: 100vh;
  display: flex; flex-direction: column;
  transition: width .28s cubic-bezier(.22,1,.36,1), min-width .28s;
  overflow: hidden; z-index: 30;
}
.zf-sidebar.collapsed { width: 64px; min-width: 64px; }

.zf-brand {
  display: flex; align-items: center; gap: 11px;
  padding: 24px 16px 18px;
  border-bottom: 1px solid rgba(255,255,255,.05);
  flex-shrink: 0;
}
.zf-logo {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--blue);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.zf-logo svg { color: white; }
.zf-brand-text { overflow: hidden; white-space: nowrap; }
.zf-brand-name {
  font-size: 15px; font-weight: 700;
  color: rgba(255,255,255,.92); letter-spacing: -.2px; line-height: 1.2;
}
.zf-brand-sub {
  font-size: 9.5px; font-weight: 600;
  color: rgba(255,255,255,.32); letter-spacing: .14em;
  text-transform: uppercase; margin-top: 1px;
}

.zf-collapse-btn {
  position: absolute; right: -11px; top: 72px;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--bg-card); border: 1px solid var(--bd-100);
  box-shadow: var(--sh-1);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 40; color: var(--tx-400);
  transition: all .18s ease;
}
.zf-collapse-btn:hover { background: var(--blue-dim); color: var(--blue); transform: scale(1.1); }

.zf-nav-scroll {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 10px 12px;
}
.zf-nav-scroll::-webkit-scrollbar { width: 2px; }
.zf-nav-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 2px; }

.zf-nav-grp {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .18em; color: rgba(255,255,255,.25);
  padding: 14px 6px 5px; white-space: nowrap; overflow: hidden;
}
.zf-sidebar.collapsed .zf-nav-grp { opacity: 0; height: 0; padding: 0; margin: 0; }

.zf-nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 8.5px 10px; border-radius: 8px;
  font-size: 13px; font-weight: 500; color: rgba(255,255,255,.42);
  cursor: pointer; white-space: nowrap; overflow: hidden;
  margin-bottom: 1px;
  transition: all .16s ease;
}
.zf-nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
.zf-nav-item:hover { color: rgba(255,255,255,.75); background: rgba(255,255,255,.06); }
.zf-nav-item.active {
  color: white;
  background: var(--blue-dim);
  border: 1px solid var(--blue-bd);
  font-weight: 600;
}
.zf-nav-item.active svg { color: var(--blue); }
.zf-sidebar.collapsed .zf-nav-item { justify-content: center; padding: 9px; gap: 0; border: none; }
.zf-sidebar.collapsed .zf-nav-item span { display: none; }
.zf-sidebar.collapsed .zf-nav-item.active { background: var(--blue-dim); border: 1px solid var(--blue-bd); }
.zf-nav-label { overflow: hidden; }

.zf-sidebar-foot { padding: 12px; border-top: 1px solid rgba(255,255,255,.05); flex-shrink: 0; }
.zf-user-row {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 10px; border-radius: 8px;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.07);
  overflow: hidden; transition: all .16s ease; cursor: pointer;
}
.zf-user-row:hover { background: rgba(255,255,255,.08); }
.zf-user-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--blue);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: white; flex-shrink: 0;
}
.zf-user-info { overflow: hidden; flex: 1; }
.zf-user-name { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zf-user-role { font-size: 10px; color: rgba(255,255,255,.3); font-weight: 500; }
.zf-sidebar.collapsed .zf-user-info, .zf-sidebar.collapsed .zf-brand-text { display: none; }

/* ── MAIN ── */
.zf-main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; min-width: 0; background: var(--bg-app); }

.zf-header {
  background: var(--bg-app);
  border-bottom: 1px solid var(--bd-100);
  height: 58px; min-height: 58px;
  display: flex; align-items: center; padding: 0 22px; gap: 12px; flex-shrink: 0;
}
.zf-page-title {
  font-size: 16px; font-weight: 700; color: var(--tx-900);
  letter-spacing: -.25px; flex: 1; white-space: nowrap;
}
.zf-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  border-radius: 99px; padding: 6px 14px; width: 220px;
  transition: all .18s ease;
}
.zf-search:focus-within {
  border-color: var(--blue-bd); background: var(--bg-app);
  box-shadow: 0 0 0 3px var(--blue-dim);
}
.zf-search input {
  background: none; border: none; outline: none;
  font-size: 12.5px; color: var(--tx-700); font-family: var(--ff-body); width: 100%;
}
.zf-search input::placeholder { color: var(--tx-300); }

.zf-live {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 700;
  padding: 5px 11px; border-radius: 99px; white-space: nowrap;
  letter-spacing: .04em; text-transform: uppercase;
  background: var(--green-bg); border: 1px solid var(--green-bd); color: var(--green);
}
.zf-live.cached { background: var(--amber-bg); border-color: var(--amber-bd); color: var(--amber); }
.zf-ldot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: zf-pulse 2s infinite; }

.zf-hbtn {
  width: 34px; height: 34px; border-radius: 8px;
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  color: var(--tx-400);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .16s ease; flex-shrink: 0; position: relative;
}
.zf-hbtn:hover { background: var(--bg-hover); border-color: var(--blue-bd); color: var(--blue); }

.zf-umenu {
  position: absolute; right: 0; top: calc(100% + 8px);
  background: var(--bg-card); border: 1px solid var(--bd-100);
  border-radius: 10px; box-shadow: var(--sh-2); min-width: 180px; z-index: 100;
  overflow: hidden; animation: zf-scalein .14s ease both;
}
.zf-umenu-head { padding: 12px 14px; border-bottom: 1px solid var(--bd-50); background: var(--bg-surface); }
.zf-umenu-lbl { font-size: 9px; color: var(--tx-400); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 2px; }
.zf-umenu-email { font-size: 12px; font-weight: 600; color: var(--tx-900); }
.zf-umenu-btn {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 10px 14px; font-size: 12px; font-weight: 500;
  cursor: pointer; border: none; background: transparent;
  transition: background .12s; font-family: var(--ff-body); color: var(--tx-700);
}
.zf-umenu-btn:hover { background: var(--bg-surface); }
.zf-umenu-btn.danger { color: var(--red); }
.zf-umenu-btn.primary { color: var(--blue); }

/* Content */
.zf-content {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  background: var(--bg-app); padding: 22px 24px;
  display: flex; flex-direction: column; gap: 18px; min-height: 0;
}
.zf-content::-webkit-scrollbar { width: 4px; }
.zf-content::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 4px; }

/* Greeting */
.zf-greeting {
  display: flex; align-items: center; justify-content: space-between; padding: 0 0 2px;
}
.zf-greeting-name {
  font-size: 22px; font-weight: 700; color: var(--tx-900);
  letter-spacing: -.4px; line-height: 1.15;
}
.zf-greeting-right { display: flex; align-items: center; gap: 7px; }
.zf-greeting-pill {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600; color: var(--tx-500);
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  border-radius: 99px; padding: 5px 12px; cursor: pointer;
  transition: all .16s ease;
}
.zf-greeting-pill:hover { background: var(--bg-hover); border-color: var(--blue-bd); color: var(--blue); }

/* KPI Grid */
.zf-kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
.zf-kpi {
  background: var(--bg-card); border: 1px solid var(--bd-100);
  border-radius: 12px; padding: 20px;
  display: flex; flex-direction: column; gap: 0;
  transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease, border-color .22s ease;
  position: relative; overflow: hidden; cursor: default;
}
.zf-kpi::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--blue);
  opacity: 0; transition: opacity .22s ease;
}
.zf-kpi:hover { transform: translateY(-3px); box-shadow: var(--sh-2); border-color: var(--blue-bd); }
.zf-kpi:hover::before { opacity: 1; }

.zf-kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.zf-kpi-icon {
  width: 36px; height: 36px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
}
.zf-kpi-lbl {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .12em; color: var(--tx-400); margin-bottom: 5px;
  font-family: var(--ff-mono);
}
.zf-kpi-val {
  font-family: var(--ff-mono); font-size: 24px; font-weight: 600;
  color: var(--tx-900); line-height: 1; letter-spacing: -.5px;
}
.zf-kpi.kpi-green .zf-kpi-val { color: var(--green); }
.zf-kpi.kpi-red   .zf-kpi-val { color: var(--red); }
.zf-kpi-sub { font-size: 11px; color: var(--tx-400); margin-top: 7px; font-weight: 500; }
.zf-kpi-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 9.5px; font-weight: 700; padding: 3px 8px;
  border-radius: 99px; margin-top: 9px; align-self: flex-start; letter-spacing: .02em;
  font-family: var(--ff-mono);
}
.zf-chip-green { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bd); }
.zf-chip-red   { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red-bd); }
.zf-chip-blue  { background: var(--blue-dim); color: var(--blue);  border: 1px solid var(--blue-bd); }

/* Cards */
.zf-mid-row { display: grid; grid-template-columns: 1fr 280px; gap: 14px; min-height: 0; }
.zf-bot-row { display: grid; grid-template-columns: 1.6fr 1fr; gap: 14px; min-height: 0; }

.zf-card {
  background: var(--bg-card); border: 1px solid var(--bd-100);
  border-radius: 12px; display: flex; flex-direction: column;
  overflow: hidden; min-height: 0;
  transition: box-shadow .2s ease;
}
.zf-card:hover { box-shadow: var(--sh-2); }
.zf-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--bd-50);
  flex-shrink: 0; gap: 10px; background: var(--bg-surface);
}
.zf-card-title { font-size: 13.5px; font-weight: 600; color: var(--tx-900); letter-spacing: -.1px; }
.zf-card-meta { display: flex; align-items: center; gap: 7px; }
.zf-card-badge {
  font-size: 10px; font-weight: 700; color: var(--blue);
  background: var(--blue-dim); border: 1px solid var(--blue-bd);
  border-radius: 99px; padding: 2px 9px; font-family: var(--ff-mono);
}
.zf-card-link {
  font-size: 11px; font-weight: 600; color: var(--blue);
  cursor: pointer; padding: 5px 12px; border-radius: 7px;
  background: var(--blue-dim); border: 1px solid var(--blue-bd);
  transition: all .16s ease; white-space: nowrap;
}
.zf-card-link:hover { background: var(--blue); color: #fff; border-color: var(--blue); }
.zf-card-body { padding: 0; overflow-y: auto; flex: 1; }
.zf-card-body::-webkit-scrollbar { width: 3px; }
.zf-card-body::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 3px; }

/* Chart area */
.zf-perf-wrap { padding: 16px 20px; }
.zf-perf-numbers { display: flex; gap: 24px; margin-bottom: 16px; flex-wrap: wrap; }
.zf-perf-num { display: flex; flex-direction: column; gap: 2px; }
.zf-perf-num-val { font-family: var(--ff-mono); font-size: 18px; font-weight: 600; color: var(--tx-900); }
.zf-perf-num-lbl { font-size: 9px; color: var(--tx-400); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; font-family: var(--ff-mono); }

/* Sector list */
.zf-sector-list { padding: 12px 20px; display: flex; flex-direction: column; gap: 10px; }
.zf-sector-item { display: flex; flex-direction: column; gap: 4px; }
.zf-sector-row { display: flex; align-items: center; justify-content: space-between; }
.zf-sector-name { font-size: 12px; font-weight: 600; color: var(--tx-700); }
.zf-sector-pct  { font-family: var(--ff-mono); font-size: 11px; font-weight: 700; color: var(--blue); }
.zf-sector-bar  { height: 3px; border-radius: 3px; background: var(--bd-50); overflow: hidden; }
.zf-sector-fill { height: 100%; border-radius: 3px; background: var(--blue); transition: width .5s cubic-bezier(.22,1,.36,1); }

/* Holdings table */
.zf-tbl-head {
  display: grid; grid-template-columns: 2fr .6fr 1fr 1fr .9fr; gap: 0;
  padding: 9px 20px; background: var(--bg-surface);
  border-bottom: 1px solid var(--bd-100); position: sticky; top: 0; z-index: 2;
}
.zf-th { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .14em; color: var(--tx-400); font-family: var(--ff-mono); }
.zf-th.r { text-align: right; }
.zf-trow {
  display: grid; grid-template-columns: 2fr .6fr 1fr 1fr .9fr; gap: 0;
  padding: 11px 20px; align-items: center; border-bottom: 1px solid var(--bd-50);
  transition: background .12s ease;
}
.zf-trow:hover { background: var(--bg-hover); }
.zf-trow:last-child { border-bottom: none; }
.zf-stock-cell { display: flex; align-items: center; gap: 10px; }
.zf-logo-wrap {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--blue-dim); border: 1px solid var(--blue-bd);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800; color: var(--blue);
  overflow: hidden; flex-shrink: 0;
}
.zf-ticker-name { font-size: 12.5px; font-weight: 600; color: var(--tx-900); letter-spacing: -.1px; }
.zf-sector-tag {
  display: inline-block; font-size: 9.5px; font-weight: 600;
  padding: 1px 6px; border-radius: 4px;
  background: var(--bg-surface); border: 1px solid var(--bd-100); color: var(--tx-400); margin-top: 2px;
}
.zf-td { font-family: var(--ff-mono); font-size: 12px; color: var(--tx-500); font-weight: 500; }
.zf-td.r { text-align: right; }
.zf-pl  { font-family: var(--ff-mono); font-size: 12px; font-weight: 700; text-align: right; }
.zf-pl-sub { font-family: var(--ff-mono); font-size: 10px; text-align: right; margin-top: 1px; }

/* Watchlist */
.zf-wl-head {
  display: grid; grid-template-columns: 1fr auto auto; gap: 10px;
  padding: 9px 20px; background: var(--bg-surface); border-bottom: 1px solid var(--bd-100);
}
.zf-wl-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px; border-bottom: 1px solid var(--bd-50);
  transition: background .12s ease; gap: 10px; cursor: pointer;
}
.zf-wl-row:hover { background: var(--bg-hover); }
.zf-wl-row:last-child { border-bottom: none; }
.zf-wl-name  { font-size: 12.5px; font-weight: 600; color: var(--tx-900); }
.zf-wl-sub   { font-size: 10px; color: var(--tx-400); margin-top: 1px; font-weight: 500; }
.zf-wl-spark { width: 52px; height: 26px; flex-shrink: 0; }
.zf-wl-price { font-family: var(--ff-mono); font-size: 12.5px; font-weight: 700; color: var(--tx-900); text-align: right; }
.zf-wl-chg   { font-size: 10px; font-weight: 700; text-align: right; margin-top: 1px; font-family: var(--ff-mono); }

/* AI Teaser */
.zf-ai-teaser {
  margin: 14px; padding: 14px;
  background: linear-gradient(135deg, var(--blue-dim) 0%, var(--green-bg) 100%);
  border: 1px solid var(--blue-bd);
  border-radius: 10px; position: relative; overflow: hidden;
  transition: all .22s ease; cursor: pointer;
}
.zf-ai-teaser:hover { background: linear-gradient(135deg, rgba(59,130,246,.16) 0%, rgba(16,185,129,.10) 100%); transform: translateY(-1px); }
.zf-ai-teaser-bg {
  position: absolute; right: -6px; bottom: -6px;
  font-size: 64px; opacity: .07; pointer-events: none;
  transition: transform .3s ease; line-height: 1;
}
.zf-ai-teaser:hover .zf-ai-teaser-bg { transform: scale(1.15) rotate(6deg); opacity: .12; }

/* Tab panel */
.zf-tab-panel {
  flex: 1; background: var(--bg-card); border: 1px solid var(--bd-100);
  border-radius: 12px; overflow: hidden;
  display: flex; flex-direction: column; min-height: 0;
  animation: zf-scalein .18s ease both;
}
.zf-tab-panel > * { flex: 1; overflow: auto; min-height: 0; }
.zf-tab-panel > *::-webkit-scrollbar { width: 4px; height: 4px; }
.zf-tab-panel > *::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 4px; }
.zf-tab-panel th {
  background: var(--bg-surface) !important; color: var(--tx-400) !important;
  font-size: 9px !important; font-weight: 700 !important;
  text-transform: uppercase !important; letter-spacing: .14em !important;
  border-bottom: 1px solid var(--bd-100) !important; padding: 10px 16px !important;
  font-family: var(--ff-mono) !important;
}
.zf-tab-panel td {
  padding: 12px 16px !important; font-size: 12.5px !important;
  color: var(--tx-500) !important; border-bottom: 1px solid var(--bd-50) !important;
  vertical-align: middle !important;
}
.zf-tab-panel tr:hover td { background: var(--bg-hover) !important; }
.zf-tab-panel tbody tr:last-child td { border-bottom: none !important; }
.zf-tab-panel .font-semibold, .zf-tab-panel .font-bold { color: var(--tx-900) !important; }
.zf-tab-panel h2, .zf-tab-panel h3 { color: var(--tx-900) !important; }
.zf-tab-panel p.text-muted-foreground, .zf-tab-panel [class*="text-muted"] { color: var(--tx-400) !important; }
.zf-tab-panel button.bg-primary, .zf-tab-panel [class*="bg-primary"] { background: var(--blue) !important; color: white !important; }
.zf-tab-panel button[class*="outline"] { background: var(--bg-card) !important; border-color: var(--bd-100) !important; color: var(--blue) !important; }
.zf-tab-panel button[class*="ghost"]:hover { background: var(--bg-hover) !important; color: var(--blue) !important; }
.zf-tab-panel input:not([type="checkbox"]), .zf-tab-panel select, .zf-tab-panel textarea {
  background: var(--bg-input) !important; border-color: var(--bd-100) !important;
  color: var(--tx-900) !important; font-size: 13px !important;
}
.zf-tab-panel input:focus, .zf-tab-panel select:focus {
  border-color: var(--blue) !important; box-shadow: 0 0 0 3px var(--blue-dim) !important;
}
.zf-tab-panel label { color: var(--tx-500) !important; font-size: 12px !important; font-weight: 600 !important; }
.zf-tab-panel [role="tablist"] { background: var(--bg-surface) !important; border-radius: 8px !important; }
.zf-tab-panel [role="tab"] { color: var(--tx-400) !important; }
.zf-tab-panel [role="tab"][data-state="active"] { background: var(--bg-card) !important; color: var(--blue) !important; font-weight: 700 !important; }
.zf-tab-panel .recharts-text { fill: var(--tx-400) !important; }
.zf-tab-panel .rounded-xl, .zf-tab-panel .rounded-lg, .zf-tab-panel [class*="card"] { background: var(--bg-card) !important; border-color: var(--bd-100) !important; }

/* Responsive */
@media (max-width:1200px) { .zf-sidebar { width:64px; min-width:64px; } .zf-sidebar .zf-brand-text,.zf-sidebar .zf-user-info,.zf-sidebar .zf-nav-label,.zf-sidebar .zf-nav-grp { display:none; } .zf-sidebar .zf-nav-item { justify-content:center; padding:9px; gap:0; } }
@media (max-width:1100px) { .zf-mid-row { grid-template-columns:1fr; } .zf-mid-row .zf-sector-side { display:none; } }
@media (max-width:900px)  { .zf-kpi-row { grid-template-columns:repeat(2,1fr); } .zf-bot-row { grid-template-columns:1fr; } .zf-search { display:none; } }
@media (max-width:640px)  { .zf-kpi-row { grid-template-columns:1fr 1fr; } .zf-content { padding:14px; gap:14px; } }
`;

// ─── Line Chart Widget ────────────────────────────────────────────────────────
function LineChartWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const curMonth = new Date().getMonth();
  const W = 500, H = 130, pad = { l:40, r:12, t:10, b:28 };

  const pts = months.slice(0, curMonth + 1).map((m, i) => {
    const progress = (i + 0.7) / (curMonth + 1);
    const val = active.reduce((sum, s) => {
      const base = calcFinalValue(s) * (0.8 + progress * 0.22);
      return sum + base + Math.sin(i * 0.7 + s.ticker.charCodeAt(0) * 0.1) * base * 0.04;
    }, 0);
    const prevVal = val * (0.82 + Math.sin(i * 0.5) * 0.06);
    return { m, val, prevVal };
  });

  if (pts.length === 0) return (
    <div style={{ height:130, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--tx-300)", fontSize:12 }}>No data</div>
  );

  const allVals = pts.flatMap(p => [p.val, p.prevVal]);
  const minV = Math.min(...allVals) * 0.92;
  const maxV = Math.max(...allVals) * 1.05;
  const range = maxV - minV || 1;
  const xStep = (W - pad.l - pad.r) / Math.max(pts.length - 1, 1);
  const yOf = (v: number) => pad.t + (1 - (v - minV) / range) * (H - pad.t - pad.b);
  const xOf = (i: number) => pad.l + i * xStep;

  const thisLine = pts.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(" ");
  const prevLine = pts.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.prevVal).toFixed(1)}`).join(" ");
  const thisArea = `M${xOf(0).toFixed(1)},${yOf(pts[0].val).toFixed(1)} ` +
    pts.slice(1).map((p,i) => `L${xOf(i+1).toFixed(1)},${yOf(p.val).toFixed(1)}`).join(" ") +
    ` L${xOf(pts.length-1).toFixed(1)},${(H-pad.b).toFixed(1)} L${xOf(0).toFixed(1)},${(H-pad.b).toFixed(1)} Z`;

  const yTicks = [minV, (minV+maxV)/2, maxV].map(v => ({
    v, y: yOf(v),
    label: v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toFixed(0),
  }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width:"100%", height:130 }}>
      <defs>
        <linearGradient id="lgArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(220 85% 48%)" stopOpacity=".12" />
          <stop offset="100%" stopColor="hsl(220 85% 48%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map(t => (
        <g key={t.v}>
          <line x1={pad.l} x2={W-pad.r} y1={t.y.toFixed(1)} y2={t.y.toFixed(1)} stroke="var(--bd-100)" strokeWidth="1" />
          <text x={pad.l-5} y={(t.y+3.5).toFixed(1)} textAnchor="end" fontSize="9" fill="var(--tx-400)" fontFamily="var(--ff-mono)">{t.label}</text>
        </g>
      ))}
      <path d={thisArea} fill="url(#lgArea)" />
      <polyline points={prevLine} fill="none" stroke="var(--bd-200)" strokeWidth="1.4" strokeDasharray="4 3" strokeLinecap="round" />
      <polyline points={thisLine} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (i === 0 || i === pts.length - 1 || i % 2 === 0) && (
        <text key={p.m} x={xOf(i).toFixed(1)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--tx-400)" fontFamily="var(--ff-mono)">{p.m}</text>
      ))}
      <circle cx={xOf(pts.length-1).toFixed(1)} cy={yOf(pts[pts.length-1].val).toFixed(1)} r="4" fill="var(--bg-card)" stroke="var(--blue)" strokeWidth="2" />
    </svg>
  );
}

// ─── Donut Chart Widget ───────────────────────────────────────────────────────
function DonutWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const map = new Map<string, number>();
  active.forEach(s => map.set(s.sector ?? "Other", (map.get(s.sector ?? "Other") ?? 0) + calcInvestedValue(s)));
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  const entries = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
  const COLORS = ["hsl(220 85% 48%)","hsl(152 70% 38%)","hsl(40 90% 44%)","hsl(280 65% 52%)","hsl(4 84% 52%)"];

  const R = 36, r = 22, cx = 50, cy = 50;
  let startAngle = -Math.PI / 2;
  const slices = entries.map(([name, val], i) => {
    const pct   = val / total;
    const angle = pct * 2 * Math.PI;
    const x1 = cx + R * Math.cos(startAngle), y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(startAngle + angle), y2 = cy + R * Math.sin(startAngle + angle);
    const ix1 = cx + r * Math.cos(startAngle), iy1 = cy + r * Math.sin(startAngle);
    const ix2 = cx + r * Math.cos(startAngle + angle), iy2 = cy + r * Math.sin(startAngle + angle);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix2.toFixed(2)},${iy2.toFixed(2)} A${r},${r} 0 ${large},0 ${ix1.toFixed(2)},${iy1.toFixed(2)} Z`;
    startAngle += angle;
    return { name, val, pct, d, color: COLORS[i % COLORS.length] };
  });

  return (
    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
      <svg viewBox="0 0 100 100" style={{ width:84, height:84, flexShrink:0 }}>
        {slices.map(s => <path key={s.name} d={s.d} fill={s.color} />)}
        <text x="50" y="47" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--tx-900)" fontFamily="var(--ff-mono)">{fmt(total)}</text>
        <text x="50" y="57" textAnchor="middle" fontSize="7" fill="var(--tx-400)" fontFamily="var(--ff-mono)">invested</text>
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:5, flex:1 }}>
        {slices.map(s => (
          <div key={s.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:7, height:7, borderRadius:2, background:s.color, flexShrink:0 }} />
              <span style={{ fontSize:11, color:"var(--tx-500)", fontWeight:500 }}>{s.name}</span>
            </div>
            <span style={{ fontSize:10.5, fontWeight:700, color:"var(--tx-700)", fontFamily:"var(--ff-mono)" }}>
              {(s.pct*100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar Chart Widget ─────────────────────────────────────────────────────────
function BarWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active  = stocks.filter(s => s.status === "Active");
  const items   = active
    .map(s => ({ ticker:s.ticker, val:calcFinalValue(s), pnlPct:s.entryPrice>0?(s.cmp-s.entryPrice)/s.entryPrice*100:0 }))
    .sort((a,b) => b.val-a.val).slice(0,6);

  if (items.length === 0) return (
    <div style={{ height:80, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--tx-300)", fontSize:12 }}>No data</div>
  );

  const maxV = Math.max(...items.map(i => i.val)) || 1;

  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:7, height:100 }}>
      {items.map((item) => {
        const h = Math.max(6, (item.val / maxV) * 76);
        const pos = item.pnlPct >= 0;
        return (
          <div key={item.ticker} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flex:1 }}>
            <div style={{ fontSize:9, fontWeight:700, color:pos?"var(--green)":"var(--red)", fontFamily:"var(--ff-mono)" }}>
              {pos?"+":""}{item.pnlPct.toFixed(1)}%
            </div>
            <div style={{ width:"100%", height:h, borderRadius:"4px 4px 0 0", background:pos?"var(--blue)":"var(--red)", opacity:pos?0.75:0.55 }} />
            <div style={{ fontSize:9, color:"var(--tx-400)", fontWeight:600, textAlign:"center", whiteSpace:"nowrap", overflow:"hidden", maxWidth:"100%", fontFamily:"var(--ff-mono)" }}>
              {item.ticker}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function Index() {
  const [tab,       setTab]       = useState<ActiveTab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode,  setDarkMode]  = useState(() => {
    try { return localStorage.getItem("zf-dark") === "1"; } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try { localStorage.setItem("zf-dark", darkMode ? "1" : "0"); } catch {}
  }, [darkMode]);

  const [uMenu,     setUMenu]     = useState(false);
  const [showAuth,  setShowAuth]  = useState(false);
  const [searchQ,   setSearchQ]   = useState("");
  const uMenuRef = useRef<HTMLDivElement>(null);

  const [stocks,    setStocks]    = useState<PortfolioStock[]>(()  => loadFromLocal()?.stocks    ?? initialData);
  const [trades,    setTrades]    = useState<TradeStrategy[]>(()   => loadFromLocal()?.trades    ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(()  => loadFromLocal()?.watchlist ?? initialWatchlist);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>(()      => loadFromLocal()?.alerts    ?? []);
  const [journal,   setJournal]   = useState<TradeJournalEntry[]>([]);
  const [fnoTrades, setFnoTrades] = useState<FnOTrade[]>(() => {
    try {
      const d = localStorage.getItem("zf-fno-trades");
      if (!d) return fnOTradesData;
      const parsed: FnOTrade[] = JSON.parse(d);
      return parsed.map(t => {
        if (t.instrumentType !== "FUT" && t.ltp !== undefined) {
          const maxReasonableLtp = Math.max(t.entryPrice * 20, 500);
          if (t.ltp > maxReasonableLtp) {
            return { ...t, ltp: undefined };
          }
        }
        return t;
      });
    } catch { return fnOTradesData; }
  });
  const [selectedChartTicker, setSelectedChartTicker] = useState<string | null>(() => {
    const localData = loadFromLocal();
    return localData?.stocks?.find((stock) => stock.status === "Active")?.ticker ?? null;
  });
  const [tradesSubTab, setTradesSubTab] = useState<"equity"|"fno">("equity");

  const { toast }         = useToast();
  const { user, signOut, loading: _authLoading } = useAuth();
  const { load, save }    = usePortfolioSync(user?.id);
  const tickers = stocks.map(s => s.ticker);
  const { prices, source, marketOpen, refresh } = useLivePrices(tickers);
  const isLive = source !== null && source !== "memory-cache";
  const snapshotRef = useRef<PortfolioSnapshot>({ stocks, trades, watchlist, alerts, fnoTrades });

  useEffect(() => {
    snapshotRef.current = { stocks, trades, watchlist, alerts, fnoTrades };
  }, [alerts, fnoTrades, stocks, trades, watchlist]);

  useEffect(() => {
    let cancelled = false;
    load().then((snapshot) => {
      if (!snapshot || cancelled) return;
      setStocks(snapshot.stocks);
      setTrades(snapshot.trades);
      setWatchlist(snapshot.watchlist);
      setAlerts(snapshot.alerts);
      setFnoTrades(snapshot.fnoTrades.length > 0 ? snapshot.fnoTrades : snapshotRef.current.fnoTrades);
    });
    return () => { cancelled = true; };
  }, [load]);

  const persistSnapshot = useCallback(async (nextSnapshot: PortfolioSnapshot, actionLabel?: string) => {
    const error = await save(nextSnapshot);
    if (error) {
      toast({ title: `${actionLabel ?? "Changes"} saved locally`, description: "Cloud sync could not be completed.", variant: "destructive" });
    }
  }, [save, toast]);

  const applySnapshot = useCallback(async (partial: Partial<PortfolioSnapshot>, actionLabel?: string) => {
    const nextSnapshot: PortfolioSnapshot = { ...snapshotRef.current, ...partial };
    snapshotRef.current = nextSnapshot;
    if (partial.stocks)    setStocks(partial.stocks);
    if (partial.trades)    setTrades(partial.trades);
    if (partial.watchlist) setWatchlist(partial.watchlist);
    if (partial.alerts)    setAlerts(partial.alerts);
    if (partial.fnoTrades) setFnoTrades(partial.fnoTrades);
    await persistSnapshot(nextSnapshot, actionLabel);
  }, [persistSnapshot]);

  const live = useMemo(() => stocks.map((stock) => {
    const livePrice = prices[stock.ticker];
    return livePrice?.price ? { ...stock, cmp: livePrice.price, weekHigh52: livePrice.weekHigh52 || stock.weekHigh52, weekLow52: livePrice.weekLow52 || stock.weekLow52, dailyChange: livePrice.change } : stock;
  }), [prices, stocks]);

  const handlePortfolioAdd    = useCallback((stock: PortfolioStock) => { void applySnapshot({ stocks: [...snapshotRef.current.stocks, stock] }, "Portfolio update"); }, [applySnapshot]);
  const handlePortfolioImport = useCallback((importedStocks: PortfolioStock[]) => { void applySnapshot({ stocks: [...snapshotRef.current.stocks, ...importedStocks] }, "Portfolio import"); }, [applySnapshot]);
  const handlePortfolioEdit   = useCallback((originalTicker: string, updatedStock: PortfolioStock) => {
    const nextStocks = snapshotRef.current.stocks.map((s) => s.ticker === originalTicker ? updatedStock : s);
    const nextTrades = snapshotRef.current.trades.map((t) => t.ticker === originalTicker ? { ...t, ticker: updatedStock.ticker, livePrice: updatedStock.cmp } : t);
    const nextAlerts = snapshotRef.current.alerts.map((a) => a.ticker === originalTicker ? { ...a, ticker: updatedStock.ticker } : a);
    void applySnapshot({ stocks: nextStocks, trades: nextTrades, alerts: nextAlerts }, "Transaction update");
  }, [applySnapshot]);
  const handlePortfolioDelete = useCallback((ticker: string) => {
    const nextStocks = snapshotRef.current.stocks.filter((s) => s.ticker !== ticker);
    const nextTrades = snapshotRef.current.trades.filter((t) => t.ticker !== ticker);
    const nextAlerts = snapshotRef.current.alerts.filter((a) => a.ticker !== ticker);
    if (selectedChartTicker === ticker) setSelectedChartTicker(nextStocks.find((s) => s.status === "Active")?.ticker ?? null);
    void applySnapshot({ stocks: nextStocks, trades: nextTrades, alerts: nextAlerts }, "Transaction deletion");
  }, [applySnapshot, selectedChartTicker]);
  const handleTradeEdit       = useCallback((originalTicker: string, updatedTrade: TradeStrategy) => { void applySnapshot({ trades: snapshotRef.current.trades.map((t) => t.ticker === originalTicker ? updatedTrade : t) }, "Trade update"); }, [applySnapshot]);
  const handleTradeDelete     = useCallback((ticker: string) => { void applySnapshot({ trades: snapshotRef.current.trades.filter((t) => t.ticker !== ticker) }, "Trade deletion"); }, [applySnapshot]);
  const handleWatchlistEdit   = useCallback((originalName: string, updatedStock: WatchlistStock) => { void applySnapshot({ watchlist: snapshotRef.current.watchlist.map((s) => s.stockName === originalName ? updatedStock : s) }, "Watchlist update"); }, [applySnapshot]);
  const handleWatchlistDelete = useCallback((stockName: string) => { void applySnapshot({ watchlist: snapshotRef.current.watchlist.filter((s) => s.stockName !== stockName) }, "Watchlist deletion"); }, [applySnapshot]);
  const handleAlertAdd        = useCallback((alert: PriceAlert) => { void applySnapshot({ alerts: [...snapshotRef.current.alerts, alert] }, "Alert update"); }, [applySnapshot]);
  const handleAlertDelete     = useCallback((id: string) => { void applySnapshot({ alerts: snapshotRef.current.alerts.filter((a) => a.id !== id) }, "Alert update"); }, [applySnapshot]);
  const handleAlertDismiss    = useCallback((id: string) => { void applySnapshot({ alerts: snapshotRef.current.alerts.map((a) => a.id === id ? { ...a, triggered: false } : a) }, "Alert update"); }, [applySnapshot]);
  const handleFnoTradesUpdate = useCallback((nextTrades: FnOTrade[]) => {
    const sanitize = (t: FnOTrade) => { const { ltp, dayChange, iv, delta, ...rest } = t; return rest; };
    const prev = JSON.stringify(snapshotRef.current.fnoTrades.map(sanitize));
    const next = JSON.stringify(nextTrades.map(sanitize));
    if (prev === next) { snapshotRef.current = { ...snapshotRef.current, fnoTrades: nextTrades }; setFnoTrades(nextTrades); return; }
    void applySnapshot({ fnoTrades: nextTrades }, "F&O update");
  }, [applySnapshot]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (uMenuRef.current && !uMenuRef.current.contains(e.target as Node)) setUMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activePos   = live.filter(s => s.status === "Active");
  const closedPos   = live.filter(s => s.status !== "Active");
  const activeStocks = live.filter(s => s.status === "Active");
  const closedStocks = live.filter(s => s.status !== "Active");

  const equityInvested   = activeStocks.reduce((sum, s) => sum + (s.entryPrice * s.quantity), 0);
  const activeCurr       = activeStocks.reduce((sum, s) => sum + (s.cmp * s.quantity), 0);
  const unrealisedPnl    = activeCurr - equityInvested;
  const realisedPnl      = closedStocks.reduce((sum, s) => sum + ((s.exitPrice ?? s.cmp) - s.entryPrice) * s.quantity, 0);

  const fnoOpen        = fnoTrades.filter(t => t.status === "Open");
  const fnoClosed      = fnoTrades.filter(t => t.status !== "Open");
  const fnoInvested    = fnoOpen.reduce((s, t) => s + calcFnOInvested(t), 0);
  const fnoUnrealised  = fnoOpen.reduce((s, t) => s + calcFnOPnL(t), 0);
  const fnoRealised    = fnoClosed.reduce((s, t) => s + calcFnOPnL(t), 0);
  const fnoActiveCurr  = fnoInvested + fnoUnrealised;

  const invested       = equityInvested + fnoInvested;
  const current        = activeCurr + fnoActiveCurr;
  const pnl            = unrealisedPnl + fnoUnrealised;
  const pnlPct         = invested > 0 ? pnl / invested * 100 : 0;
  const totalRealised  = realisedPnl + fnoRealised;

  const winners  = closedPos.filter(s => calcProfitLoss(s) > 0);
  const winRate  = closedPos.length > 0 ? winners.length / closedPos.length * 100 : 0;
  const today    = new Date();
  const todayEquityUnrealised = activePos.reduce((acc, s) => { const pd = prices[s.ticker]; if (pd?.change !== undefined) return acc + pd.change * s.quantity; return acc; }, 0);
  const todayFnOUnrealised    = fnoOpen.reduce((acc, t) => acc + (t.dayChange ?? 0) * t.lots * t.lotSize, 0);
  const todayRealisedEquity   = closedPos.filter((s) => isSameTradingDay(s.exitDate, today)).reduce((acc, s) => acc + calcProfitLoss(s), 0);
  const todayRealisedFnO      = fnoClosed.filter((t) => isSameTradingDay(t.exitDate, today)).reduce((acc, t) => acc + calcFnOPnL(t), 0);
  const todayPnl = todayEquityUnrealised + todayFnOUnrealised + todayRealisedEquity + todayRealisedFnO;

  const performers = activePos.filter(s => s.entryPrice > 0).map(s => ({ ticker: s.ticker, pct: (s.cmp - s.entryPrice) / s.entryPrice * 100 })).sort((a, b) => b.pct - a.pct);
  const best  = performers[0];
  const worst = performers[performers.length - 1];

  useEffect(() => {
    const nextTicker = selectedChartTicker && activePos.some((s) => s.ticker === selectedChartTicker) ? selectedChartTicker : activePos[0]?.ticker ?? null;
    if (nextTicker !== selectedChartTicker) setSelectedChartTicker(nextTicker);
  }, [activePos, selectedChartTicker]);

  const selectedChartStock     = activePos.find((s) => s.ticker === selectedChartTicker) ?? activePos[0] ?? null;
  const selectedChartPrice     = selectedChartStock ? prices[selectedChartStock.ticker] : undefined;
  const selectedChartDayPct    = selectedChartPrice?.changePercent ?? (selectedChartStock && selectedChartStock.entryPrice > 0 ? ((selectedChartStock.cmp - selectedChartStock.entryPrice) / selectedChartStock.entryPrice) * 100 : 0);

  const sectorMap = new Map<string, number>();
  activePos.forEach(s => { const sec = s.sector ?? "Other"; sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + calcInvestedValue(s)); });
  const sectorTotal = invested > 0 ? activePos.reduce((s, x) => s + calcInvestedValue(x), 0) : 1;
  const sectors = [...sectorMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, val]) => ({ name, val, pct: val / sectorTotal * 100 }));
  const SECTOR_COLORS = ["hsl(220 85% 48%)","hsl(152 70% 38%)","hsl(40 90% 44%)","hsl(280 65% 52%)","hsl(4 84% 52%)","hsl(200 70% 50%)"];

  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const PAGE_TITLES: Record<ActiveTab, string> = {
    overview: "Dashboard", holdings: "Portfolio Holdings", trades: "Trades & F&O",
    watchlist: "Watchlist", ai: "AI Insights", charts: "Charts & Analytics",
    analytics: "Trade Analytics", history: "Trade History", journal: "Trade Journal",
    sector: "Sector Allocation", alerts: "Price Alerts", export: "Export Data",
    news: "Holdings News Feed",
  };

  if (_authLoading) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"hsl(220 16% 97%)", fontFamily:"Geist, sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:36, height:36, border:"2.5px solid hsl(220 14% 89%)", borderTop:"2.5px solid hsl(220 85% 48%)", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
        <div style={{ fontSize:12, color:"hsl(220 12% 52%)", fontFamily:"Geist Mono, monospace" }}>Loading…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!user) return (
    <>
      <style>{CSS}</style>
      <style>{`
        .lp { min-height:100vh; background:hsl(220 16% 97%); font-family:'Geist',-apple-system,sans-serif; display:flex; flex-direction:column; }
        .lp-nav { background:#fff; border-bottom:1px solid hsl(220 14% 89%); padding:0 40px; height:60px; display:flex; align-items:center; justify-content:space-between; }
        .lp-brand { display:flex; align-items:center; gap:10px; }
        .lp-logo { width:30px; height:30px; background:hsl(220 85% 48%); border-radius:8px; display:flex; align-items:center; justify-content:center; }
        .lp-name { font-size:16px; font-weight:700; color:hsl(220 25% 10%); letter-spacing:-.3px; }
        .lp-signin-btn { background:hsl(220 85% 48%); color:white; border:none; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; transition:background .15s; }
        .lp-signin-btn:hover { background:hsl(220 85% 42%); }
        .lp-hero { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; text-align:center; }
        .lp-hero-badge { display:inline-flex; align-items:center; gap:6px; background:hsl(220 85% 48% / .08); color:hsl(220 85% 48%); border:1px solid hsl(220 85% 48% / .2); border-radius:20px; padding:5px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin-bottom:24px; }
        .lp-hero-dot { width:5px; height:5px; border-radius:50%; background:hsl(152 70% 38%); }
        .lp-h1 { font-size:clamp(32px,5vw,52px); font-weight:800; color:hsl(220 25% 10%); line-height:1.1; letter-spacing:-1.5px; max-width:680px; margin-bottom:18px; }
        .lp-h1 span { color:hsl(220 85% 48%); }
        .lp-sub { font-size:16px; color:hsl(220 12% 52%); max-width:500px; line-height:1.6; margin-bottom:36px; }
        .lp-cta-row { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
        .lp-cta-primary { background:hsl(220 85% 48%); color:white; border:none; padding:12px 30px; border-radius:9px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; }
        .lp-cta-primary:hover { background:hsl(220 85% 42%); transform:translateY(-1px); }
        .lp-cta-ghost { background:transparent; color:hsl(220 85% 48%); border:1.5px solid hsl(220 14% 89%); padding:12px 30px; border-radius:9px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
        .lp-cta-ghost:hover { background:hsl(220 85% 48% / .05); border-color:hsl(220 85% 48% / .3); }
        .lp-features { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; max-width:840px; width:100%; margin-top:60px; }
        .lp-feat { background:#fff; border:1px solid hsl(220 14% 89%); border-radius:12px; padding:24px 20px; text-align:left; }
        .lp-feat-icon { width:38px; height:38px; border-radius:9px; background:hsl(220 85% 48% / .08); border:1px solid hsl(220 85% 48% / .18); display:flex; align-items:center; justify-content:center; margin-bottom:12px; font-size:18px; }
        .lp-feat-title { font-size:13.5px; font-weight:700; color:hsl(220 25% 10%); margin-bottom:6px; }
        .lp-feat-desc { font-size:12px; color:hsl(220 12% 52%); line-height:1.6; }
        @media(max-width:640px){ .lp-features{grid-template-columns:1fr;} .lp-h1{font-size:30px;} }
      `}</style>
      <div className="lp">
        <nav className="lp-nav">
          <div className="lp-brand">
            <div className="lp-logo">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 13L5.5 4.5L10 9L12 6.5L14 13H2Z" fill="white" /></svg>
            </div>
            <span className="lp-name">ZenFolio</span>
          </div>
          <button className="lp-signin-btn" onClick={() => setShowAuth(true)}>Sign in</button>
        </nav>
        <div className="lp-hero">
          <div className="lp-hero-badge"><div className="lp-hero-dot" />NSE Live Prices · AI-Powered</div>
          <h1 className="lp-h1">Track your <span>Indian stocks</span> like a pro trader</h1>
          <p className="lp-sub">Real-time portfolio tracking, AI-powered insights, trade journal, and sector analysis — built for NSE/BSE investors.</p>
          <div className="lp-cta-row">
            <button className="lp-cta-primary" onClick={() => setShowAuth(true)}>Get started free →</button>
            <button className="lp-cta-ghost" onClick={() => setShowAuth(true)}>Sign in to your account</button>
          </div>
          <div className="lp-features">
            {[
              { icon:"📊", title:"Live Portfolio Tracker", desc:"Real-time NSE prices via Upstox with 5-tier fallback. Watch your P&L update every 60 seconds during market hours." },
              { icon:"🤖", title:"AI Portfolio Analyst", desc:"Powered by Groq's Llama 3.3 70B. Get instant analysis, risk assessment, and actionable trade recommendations." },
              { icon:"📈", title:"Trade Journal & Analytics", desc:"Track every trade with entry/exit, win rate, sector allocation, and performance charts. Know what's working." },
            ].map(f => (
              <div key={f.title} className="lp-feat">
                <div className="lp-feat-icon">{f.icon}</div>
                <div className="lp-feat-title">{f.title}</div>
                <div className="lp-feat-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );

  return (
    <>
      <style>{CSS}</style>

      <div className="zf">
        {/* ══════════ SIDEBAR ══════════ */}
        <aside className={`zf-sidebar${collapsed ? " collapsed" : ""}`} style={{ position: "relative" }}>
          <button className="zf-collapse-btn" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
          </button>

          <div className="zf-brand">
            <div className="zf-logo">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 13L5.5 4.5L10 9L12 6.5L14 13H2Z" fill="white" /></svg>
            </div>
            <div className="zf-brand-text">
              <div className="zf-brand-name">ZenFolio</div>
              <div className="zf-brand-sub">Portfolio Tracker</div>
            </div>
          </div>

          <div className="zf-nav-scroll">
            {NAV_GROUPS.map(grp => (
              <div key={grp.label}>
                <div className="zf-nav-grp">{grp.label}</div>
                {grp.items.map(({ id, label, icon: Icon }) => (
                  <div key={id} className={`zf-nav-item${tab === id ? " active" : ""}`}
                    onClick={() => setTab(id as ActiveTab)} title={collapsed ? label : undefined}>
                    <Icon strokeWidth={tab === id ? 2.2 : 1.8} size={15} />
                    <span className="zf-nav-label">{label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="zf-sidebar-foot">
            <div className="zf-user-row" title={collapsed ? (user?.email ?? "Guest") : undefined}>
              <div className="zf-user-avatar">{(user?.email?.[0] ?? "G").toUpperCase()}</div>
              <div className="zf-user-info">
                <div className="zf-user-name">{user?.email?.split("@")[0] ?? "Guest"}</div>
                <div className="zf-user-role">Trader</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <div className="zf-main">
          <header className="zf-header">
            <div className="zf-page-title">{PAGE_TITLES[tab]}</div>

            <div className="zf-search">
              <Search size={12} color="var(--tx-300)" />
              <input placeholder="Search stocks…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            </div>

            <div className={`zf-live${!isLive ? " cached" : ""}`}>
              <div className="zf-ldot" />
              NSE {isLive ? "Live" : "Cached"} · {now}
            </div>

            <button className="zf-hbtn" onClick={refresh} title="Refresh prices">
              <RefreshCw size={13} className={!isLive ? "zf-spin" : ""} />
            </button>

            <button className="zf-hbtn" onClick={() => setDarkMode(d => !d)} title={darkMode ? "Light mode" : "Dark mode"}>
              <span style={{ fontSize:14 }}>{darkMode ? "☀️" : "🌙"}</span>
            </button>

            <div style={{ position: "relative" }} ref={uMenuRef}>
              <button className="zf-hbtn" onClick={() => setUMenu(p => !p)}>
                <Settings size={13} />
              </button>
              {uMenu && (
                <div className="zf-umenu">
                  <div className="zf-umenu-head">
                    <div className="zf-umenu-lbl">Signed in as</div>
                    <div className="zf-umenu-email">{user?.email ?? "Not signed in"}</div>
                  </div>
                  {user ? (
                    <button className="zf-umenu-btn danger" onClick={() => { signOut(); setUMenu(false); }}>
                      <LogOut size={12} /> Sign out
                    </button>
                  ) : (
                    <button className="zf-umenu-btn primary" onClick={() => { setShowAuth(true); setUMenu(false); }}>
                      <LogOut size={12} /> Sign in
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Greeting */}
          {tab === "overview" && (
            <div style={{ padding:"14px 24px 0", background:"var(--bg-app)", animation:"zf-fade .38s cubic-bezier(.22,1,.36,1) both" }}>
              <div className="zf-greeting">
                <div>
                  <div className="zf-greeting-name">{getGreeting()}, {user?.email?.split("@")[0] ?? "Trader"}</div>
                  <p style={{ fontSize:12.5, color:"var(--tx-500)", marginTop:3, fontWeight:500 }}>
                    Your portfolio is{" "}
                    <span style={{ color: pnl>=0 ? "var(--green)" : "var(--red)", fontWeight:700, fontFamily:"var(--ff-mono)" }}>
                      {pnl >= 0 ? "up" : "down"} {sign(pnl)}{Math.abs(pnlPct).toFixed(1)}%
                    </span>{" "}
                    since your last entry.
                  </p>
                </div>
                <div className="zf-greeting-right">
                  <div className="zf-greeting-pill">
                    <span style={{ width:6, height:6, borderRadius:"50%", background:isLive?"var(--green)":"var(--amber)", display:"inline-block" }} />
                    {isLive ? "Live" : "Cached"} · {now}
                  </div>
                  {activePos.length > 0 && (
                    <div className="zf-greeting-pill" style={{ color: pnl>=0?"var(--green)":"var(--red)", borderColor: pnl>=0?"var(--green-bd)":"var(--red-bd)" }}>
                      {pnl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {sign(pnl)}{fmt(Math.abs(pnl))}
                    </div>
                  )}
                  <div className="zf-greeting-pill" onClick={refresh} style={{ cursor:"pointer" }}>
                    <RefreshCw size={11} /> Refresh
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="zf-content">

            {/* ══════════ OVERVIEW ══════════ */}
            {tab === "overview" && (<>

              {/* KPI Cards */}
              <div className="zf-kpi-row">
                <div className="zf-kpi zf-a1">
                  <div className="zf-kpi-top">
                    <div className="zf-kpi-icon" style={{ background:"var(--blue-dim)" }}>
                      <Wallet size={17} color="var(--blue)" />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:700, color:"var(--tx-400)", textTransform:"uppercase", letterSpacing:".12em", fontFamily:"var(--ff-mono)" }}>Invested</span>
                  </div>
                  <div className="zf-kpi-lbl">Total Invested</div>
                  <div className="zf-kpi-val">{fmt(invested)}</div>
                  <div className="zf-kpi-sub">{closedPos.length} closed · {live.length} total</div>
                </div>

                <div className="zf-kpi zf-a2">
                  <div className="zf-kpi-top">
                    <div className="zf-kpi-icon" style={{ background:"var(--blue-dim)" }}>
                      <TrendingUp size={17} color="var(--blue)" />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:700, color:"var(--blue)", textTransform:"uppercase", letterSpacing:".12em", fontFamily:"var(--ff-mono)" }}>Net Worth</span>
                  </div>
                  <div className="zf-kpi-lbl">Portfolio Value</div>
                  <div className="zf-kpi-val">{fmt(current)}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:6 }}>
                    {pnl >= 0 ? <TrendingUp size={11} color="var(--green)" /> : <TrendingDown size={11} color="var(--red)" />}
                    <span style={{ fontSize:11, fontWeight:700, color:pnl>=0?"var(--green)":"var(--red)", fontFamily:"var(--ff-mono)" }}>
                      {sign(pnl)}{fmt(Math.abs(pnl))} ({sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="zf-kpi zf-a3">
                  <div className="zf-kpi-top">
                    <div className="zf-kpi-icon" style={{ background:todayPnl>=0?"var(--green-bg)":"var(--red-bg)" }}>
                      <Zap size={17} color={todayPnl>=0?"var(--green)":"var(--red)"} />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:700, color:"var(--tx-400)", textTransform:"uppercase", letterSpacing:".12em", fontFamily:"var(--ff-mono)" }}>Live P&L</span>
                  </div>
                  <div className="zf-kpi-lbl">Today's P&L</div>
                  <div className="zf-kpi-val">{sign(todayPnl)}{fmt(Math.abs(todayPnl))}</div>
                  <div className="zf-kpi-sub" style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em", marginTop:7, fontFamily:"var(--ff-mono)" }}>
                    {isLive ? "● " : "○ "}Last update: {now} IST
                  </div>
                </div>

                <div className="zf-kpi zf-a4">
                  <div className="zf-kpi-top">
                    <div className="zf-kpi-icon" style={{ background:"var(--amber-bg)" }}>
                      <Award size={17} color="var(--amber)" />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:700, color:"var(--tx-400)", textTransform:"uppercase", letterSpacing:".12em", fontFamily:"var(--ff-mono)" }}>Win Rate</span>
                  </div>
                  <div className="zf-kpi-lbl">Win Rate</div>
                  <div className="zf-kpi-val" style={{ color:winRate>=50?"var(--green)":winRate>0?"var(--amber)":"var(--tx-400)" }}>
                    {winRate.toFixed(0)}%
                  </div>
                  <div className="zf-kpi-sub">
                    Realized: <span style={{ color:"var(--green)", fontWeight:700, fontFamily:"var(--ff-mono)" }}>{sign(totalRealised)}{fmt(Math.abs(totalRealised))}</span>
                  </div>
                </div>
              </div>

              {/* Mid Row: Chart + Sector */}
              <div className="zf-mid-row zf-a5">
                <div className="zf-card">
                  <div className="zf-card-head">
                    <div>
                      <span className="zf-card-title">Performance Matrix</span>
                      <div style={{ display:"flex", gap:16, marginTop:5 }}>
                        {(["Portfolio Value","Invested Amount","P&L Trends"] as const).map((label, i) => (
                          <button key={label} style={{
                            fontSize:11, fontWeight: i===0 ? 700 : 500,
                            color: i===0 ? "var(--blue)" : "var(--tx-400)",
                            background:"none", border:"none", cursor:"pointer", padding:"0 0 3px",
                            fontFamily:"var(--ff-body)",
                            borderBottom: i===0 ? "2px solid var(--blue)" : "2px solid transparent",
                          }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", background:"var(--bg-surface)", padding:"3px", borderRadius:8, gap:2 }}>
                      {(["1Y","2Y","ALL"] as const).map((r,i) => (
                        <button key={r} style={{
                          padding:"3px 9px", fontSize:9.5, fontWeight:700,
                          background: i===0 ? "var(--bg-card)" : "transparent",
                          color: i===0 ? "var(--tx-900)" : "var(--tx-400)",
                          border:"none", borderRadius:6, cursor:"pointer", fontFamily:"var(--ff-mono)",
                          boxShadow: i===0 ? "var(--sh-1)" : "none",
                        }}>{r}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:"14px 20px 16px", position:"relative" }}>
                    <div style={{
                      position:"absolute", top:10, right:28, zIndex:3,
                      background:"var(--bg-card)", border:"1px solid var(--bd-100)",
                      padding:"5px 10px", borderRadius:7,
                      fontSize:10, fontWeight:700, color:"var(--tx-700)", fontFamily:"var(--ff-mono)",
                      display:"flex", alignItems:"center", gap:6,
                    }}>
                      {fmt(current)}
                      <span style={{ color:pnlPct>=0?"var(--green)":"var(--red)", fontWeight:800 }}>
                        {sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%
                      </span>
                    </div>
                    <LineChartWidget stocks={live} />
                  </div>
                </div>

                <div className="zf-card zf-sector-side">
                  <div className="zf-card-head"><span className="zf-card-title">Sector Weights</span></div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"16px 20px 12px" }}>
                    <DonutWidget stocks={live} />
                  </div>
                  <div className="zf-sector-list">
                    {sectors.slice(0,5).map((s, i) => (
                      <div key={s.name} className="zf-sector-item">
                        <div className="zf-sector-row">
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div style={{ width:6, height:6, borderRadius:"50%", background:SECTOR_COLORS[i], flexShrink:0 }} />
                            <span className="zf-sector-name">{s.name}</span>
                          </div>
                          <span className="zf-sector-pct">{s.pct.toFixed(0)}%</span>
                        </div>
                        <div className="zf-sector-bar">
                          <div className="zf-sector-fill" style={{ width:`${s.pct}%`, background:SECTOR_COLORS[i] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bot Row: Holdings + Watchlist */}
              <div className="zf-bot-row zf-a6">
                <div className="zf-card">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Current Holdings</span>
                    <button className="zf-card-link" onClick={() => setTab("holdings")}>View all</button>
                  </div>
                  <div className="zf-card-body">
                    <div className="zf-tbl-head">
                      <span className="zf-th">Asset</span>
                      <span className="zf-th r">Qty</span>
                      <span className="zf-th r">Avg</span>
                      <span className="zf-th r">LTP</span>
                      <span className="zf-th r">P&L</span>
                    </div>
                    {activePos.length === 0 ? (
                      <div style={{ padding:"36px 20px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>
                        No active holdings.{" "}
                        <button onClick={() => setTab("holdings")} style={{ color:"var(--blue)", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Add one →</button>
                      </div>
                    ) : activePos.slice(0, 5).map((s, si) => {
                      const pl    = s.entryPrice > 0 ? (s.cmp - s.entryPrice) / s.entryPrice * 100 : 0;
                      const plAmt = (s.cmp - s.entryPrice) * s.quantity;
                      const pos   = pl >= 0;
                      const initials = s.ticker.slice(0, 4);
                      return (
                        <div key={s.ticker} className="zf-trow"
                          style={{ cursor:"pointer" }} onClick={() => setSelectedChartTicker(s.ticker)}>
                          <div className="zf-stock-cell">
                            <div className="zf-logo-wrap">
                              <img src={`https://logo.clearbit.com/${(s.stockName??s.ticker).toLowerCase().replace(/\s+/g,"")}.com`} alt=""
                                onError={e => { (e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).parentElement!.textContent=initials; }} />
                            </div>
                            <div>
                              <div className="zf-ticker-name">{s.stockName ?? s.ticker}</div>
                              <span className="zf-sector-tag">{s.sector}</span>
                            </div>
                          </div>
                          <span className="zf-td r">{s.quantity}</span>
                          <span className="zf-td r">₹{fmtNum(s.entryPrice)}</span>
                          <span className="zf-td r">₹{fmtNum(s.cmp)}</span>
                          <div style={{ textAlign:"right" }}>
                            <div className="zf-pl" style={{ color:pos?"var(--green)":"var(--red)" }}>
                              {pos ? "+" : "−"}₹{Math.abs(plAmt).toLocaleString("en-IN",{maximumFractionDigits:0})}
                            </div>
                            <div className="zf-pl-sub" style={{ color:pos?"var(--green)":"var(--red)", opacity:.75 }}>
                              {sign(pl)}{Math.abs(pl).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="zf-card" style={{ display:"flex", flexDirection:"column" }}>
                  <div className="zf-card-head">
                    <span className="zf-card-title">Watchlist</span>
                    <button className="zf-card-link" onClick={() => setTab("watchlist")}>+ Add</button>
                  </div>
                  <div className="zf-card-body" style={{ flex:1 }}>
                    {watchlist.length === 0 ? (
                      <div style={{ padding:"28px 20px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>No watchlist stocks yet</div>
                    ) : watchlist.slice(0, 4).map((w, wi) => {
                      const cmp  = w.cmp ?? 0;
                      const pos  = cmp >= (w.entryZoneLow ?? cmp);
                      const seed = w.stockName.charCodeAt(0) + wi * 7;
                      return (
                        <div key={w.stockName} className="zf-wl-row"
                          onClick={() => {
                            const match = activePos.find((s) => s.stockName === w.stockName || s.ticker === w.stockName);
                            if (match) setSelectedChartTicker(match.ticker);
                          }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <div style={{ width:34, height:34, borderRadius:9, background:"var(--blue-dim)", border:"1px solid var(--blue-bd)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9.5, fontWeight:800, color:"var(--blue)", flexShrink:0 }}>
                              {w.stockName.slice(0,3).toUpperCase()}
                            </div>
                            <div>
                              <div className="zf-wl-name">{w.stockName}</div>
                              <div className="zf-wl-sub">{w.sector ?? "NSE"}</div>
                            </div>
                          </div>
                          <svg className="zf-wl-spark" viewBox="0 0 52 26" fill="none">
                            <polyline points={Array.from({length:8},(_,i)=>{
                              const x=3+i*7; const y=13+Math.sin((i+seed)*1.1)*8*(pos?1:-1);
                              return `${x},${Math.max(2,Math.min(24,y))}`;
                            }).join(" ")} stroke={pos?"var(--green)":"var(--red)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <div style={{ textAlign:"right" }}>
                            <div className="zf-wl-price">₹{cmp.toLocaleString("en-IN")}</div>
                            <div className="zf-wl-chg" style={{ color:pos?"var(--green)":"var(--red)" }}>
                              RSI {w.rsi?.toFixed(0) ?? "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="zf-ai-teaser" onClick={() => setTab("ai")} style={{ marginTop: watchlist.length > 0 ? 0 : 6 }}>
                      <div style={{ position:"relative", zIndex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:7 }}>
                          <span style={{ fontSize:12 }}>✦</span>
                          <span style={{ fontSize:9, fontWeight:800, color:"var(--blue)", textTransform:"uppercase", letterSpacing:".18em", fontFamily:"var(--ff-mono)" }}>AI Opportunity</span>
                        </div>
                        <p style={{ fontSize:11, lineHeight:1.6, color:"var(--tx-500)", marginBottom:10 }}>
                          {activePos.length > 0
                            ? <>Portfolio momentum score for <strong style={{ color:"var(--tx-900)" }}>{best?.ticker ?? activePos[0]?.ticker}</strong> has strengthened. Breakout zone detected.</>
                            : <>Add holdings to unlock AI-powered portfolio analysis and trade recommendations.</>
                          }
                        </p>
                        <button style={{ fontSize:10.5, fontWeight:700, color:"var(--blue)", background:"none", border:"none", cursor:"pointer", fontFamily:"var(--ff-body)", padding:0 }}>
                          View AI Analysis →
                        </button>
                      </div>
                      <div className="zf-ai-teaser-bg">✦</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* F&O Positions */}
              <div className="zf-card zf-a6" style={{ animationDelay:".36s" }}>
                <div className="zf-card-head">
                  <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                    <span className="zf-card-title">F&O Positions</span>
                    <span className="zf-card-badge">{fnoOpen.length} open</span>
                    {fnoClosed.length > 0 && <span style={{ fontSize:11, color:"var(--tx-400)", fontFamily:"var(--ff-mono)" }}>· {fnoClosed.length} closed</span>}
                  </div>
                  <div className="zf-card-meta">
                    <button className="zf-card-link" onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}>
                      {fnoOpen.length > 0 ? "Manage F&O →" : "+ Add F&O Trade"}
                    </button>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderBottom:"1px solid var(--bd-50)" }}>
                  {([
                    { lbl:"Open Positions", val:String(fnoOpen.length), sub:`Premium: ${fmt(fnoInvested)}`, clr:"var(--blue)" },
                    { lbl:"Unrealised P&L", val:`${sign(fnoUnrealised)}${fmt(Math.abs(fnoUnrealised))}`, sub:`${fnoOpen.length} position${fnoOpen.length!==1?"s":""}`, clr:fnoUnrealised>=0?"var(--green)":"var(--red)" },
                    { lbl:"Realised P&L",   val:`${sign(fnoRealised)}${fmt(Math.abs(fnoRealised))}`, sub:`${fnoClosed.length} closed`, clr:fnoRealised>=0?"var(--green)":"var(--red)" },
                    { lbl:"Win Rate",       val:fnoClosed.length>0?`${Math.round(fnoClosed.filter(t=>calcFnOPnL(t)>0).length/fnoClosed.length*100)}%`:"—", sub:`${fnoClosed.filter(t=>calcFnOPnL(t)>0).length}/${fnoClosed.length} profitable`, clr:"var(--amber)" },
                  ] as const).map((m,i) => (
                    <div key={m.lbl} style={{ padding:"12px 18px", borderRight:i<3?"1px solid var(--bd-100)":"none" }}>
                      <div style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".09em", color:"var(--tx-400)", marginBottom:4, fontFamily:"var(--ff-mono)" }}>{m.lbl}</div>
                      <div style={{ fontFamily:"var(--ff-mono)", fontSize:18, fontWeight:700, color:m.clr, letterSpacing:"-.4px" }}>{m.val}</div>
                      <div style={{ fontSize:10, color:"var(--tx-400)", marginTop:3 }}>{m.sub}</div>
                    </div>
                  ))}
                </div>
                {fnoOpen.length === 0 ? (
                  <div style={{ padding:"20px 22px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:14 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--tx-700)", marginBottom:2 }}>No open F&O positions</div>
                      <div style={{ fontSize:12, color:"var(--tx-300)" }}>
                        Go to{" "}
                        <button onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                          style={{ background:"none", border:"none", color:"var(--blue)", fontSize:12, fontWeight:700, cursor:"pointer", padding:0 }}>
                          Trades → F&O
                        </button>
                        {" "}to add futures or options.
                      </div>
                    </div>
                    <button onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                      style={{ background:"var(--blue)", color:"#fff", border:"none", padding:"7px 16px", borderRadius:8, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"var(--ff-body)", flexShrink:0 }}>
                      + Add F&O Trade
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
                      <thead>
                        <tr>
                          {(["Instrument","Type","Strike","Expiry","Lots×Size","Entry","LTP","P&L","Status"] as const).map(h => (
                            <th key={h} style={{
                              padding:"9px 13px", fontSize:"9px", fontWeight:700,
                              textTransform:"uppercase", letterSpacing:".12em", color:"var(--tx-400)",
                              background:"var(--bg-surface)", borderBottom:"1px solid var(--bd-100)",
                              textAlign: (["Entry","LTP","P&L"] as string[]).includes(h) ? "right" : (["Type","Status"] as string[]).includes(h) ? "center" : "left",
                              whiteSpace:"nowrap", fontFamily:"var(--ff-mono)",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fnoOpen.map(t => {
                          const ltp = t.ltp ?? t.entryPrice;
                          const fPnl = t.instrumentType === "PE" ? (t.entryPrice-ltp)*t.lots*t.lotSize : (ltp-t.entryPrice)*t.lots*t.lotSize;
                          const pct  = t.entryPrice > 0 ? fPnl/(t.entryPrice*t.lots*t.lotSize)*100 : 0;
                          const pos  = fPnl >= 0;
                          const tcMap: Record<string,{bg:string;color:string;bd:string}> = {
                            CE:  { bg:"var(--green-bg)", color:"var(--green)", bd:"var(--green-bd)" },
                            PE:  { bg:"var(--red-bg)",   color:"var(--red)",   bd:"var(--red-bd)"   },
                            FUT: { bg:"var(--blue-dim)", color:"var(--blue)",  bd:"var(--blue-bd)"  },
                          };
                          const tc = tcMap[t.instrumentType] ?? tcMap["FUT"];
                          const ep = t.expiry.split("-");
                          const mo = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                          const ed = ep.length===3 ? `${parseInt(ep[0])} ${mo[parseInt(ep[1])]} '${ep[2].slice(-2)}` : t.expiry;
                          return (
                            <tr key={t.id} style={{ cursor:"pointer", transition:"background .1s" }}
                              onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="var(--bg-hover)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background=""}>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)" }}>
                                <div style={{ fontSize:12.5, fontWeight:700, color:"var(--tx-900)" }}>{t.symbol}</div>
                                {t.notes && <div style={{ fontSize:9.5, color:"var(--tx-400)", marginTop:1, maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes}</div>}
                              </td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", textAlign:"center" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9.5, fontWeight:800, padding:"2px 7px", borderRadius:5, background:tc.bg, color:tc.color, border:`1px solid ${tc.bd}`, fontFamily:"var(--ff-mono)" }}>{t.instrumentType}</span>
                              </td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>{t.strike ? `₹${t.strike.toLocaleString("en-IN")}` : "—"}</td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", fontSize:12, fontWeight:600, color:"var(--tx-700)", whiteSpace:"nowrap" }}>{ed}</td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>{t.lots} × {t.lotSize.toLocaleString("en-IN")}</td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)", textAlign:"right" }}>₹{t.entryPrice.toFixed(2)}</td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", textAlign:"right" }}>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:12, fontWeight:600, color:"var(--blue)", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4 }}>
                                  {t.ltp && <span style={{ width:4, height:4, borderRadius:"50%", background:"var(--green)", display:"inline-block" }} />}
                                  ₹{ltp.toFixed(2)}
                                </div>
                              </td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", textAlign:"right" }}>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:12.5, fontWeight:700, color:pos?"var(--green)":"var(--red)" }}>{sign(fPnl)}{fmt(Math.abs(fPnl))}</div>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:9.5, color:pos?"var(--green)":"var(--red)" }}>{sign(pct)}{Math.abs(pct).toFixed(1)}%</div>
                              </td>
                              <td style={{ padding:"11px 13px", borderBottom:"1px solid var(--bd-50)", textAlign:"center" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:10, fontWeight:700, padding:"2px 9px", borderRadius:20, background:"var(--blue-dim)", color:"var(--blue)", border:"1px solid var(--blue-bd)", fontFamily:"var(--ff-mono)" }}>Open</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Charts row */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:14 }} className="zf-a6">
                <div className="zf-card">
                  <div className="zf-card-head">
                    <div>
                      <span className="zf-card-title">
                        {selectedChartStock ? `${selectedChartStock.ticker} Live Chart` : "Stock Chart"}
                      </span>
                      <div style={{ display:"flex", gap:6, marginTop:5, flexWrap:"wrap" }}>
                        {activePos.slice(0, 6).map((stock) => (
                          <button key={stock.ticker} onClick={() => setSelectedChartTicker(stock.ticker)} style={{
                            fontSize:10.5, fontWeight: selectedChartStock?.ticker === stock.ticker ? 700 : 500,
                            color: selectedChartStock?.ticker === stock.ticker ? "var(--blue)" : "var(--tx-400)",
                            background: selectedChartStock?.ticker === stock.ticker ? "var(--blue-dim)" : "transparent",
                            border: `1px solid ${selectedChartStock?.ticker === stock.ticker ? "var(--blue-bd)" : "var(--bd-100)"}`,
                            borderRadius: 999, cursor: "pointer", padding: "3px 9px",
                            fontFamily: "var(--ff-mono)", transition:"all .14s",
                          }}>{stock.ticker}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      {selectedChartStock && (
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontFamily:"var(--ff-mono)", fontSize:17, fontWeight:700, color:"var(--tx-900)" }}>₹{fmtNum(selectedChartStock.cmp)}</div>
                          <div style={{ fontSize:10.5, fontWeight:700, fontFamily:"var(--ff-mono)", color:selectedChartDayPct >= 0 ? "var(--green)" : "var(--red)" }}>
                            {selectedChartDayPct >= 0 ? "+" : ""}{selectedChartDayPct.toFixed(2)}% today
                          </div>
                        </div>
                      )}
                      <button className="zf-card-link" onClick={refresh}>Refresh</button>
                    </div>
                  </div>
                  <div style={{ padding:"8px 18px 14px" }}>
                    <StockLineChartWidget stock={selectedChartStock} dayChangePercent={selectedChartDayPct} />
                  </div>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div className="zf-card" style={{ flex:1 }}>
                    <div className="zf-card-head"><span className="zf-card-title">Sector Allocation</span></div>
                    <div style={{ padding:"12px 18px" }}><DonutWidget stocks={live} /></div>
                  </div>
                  <div className="zf-card" style={{ flex:1 }}>
                    <div className="zf-card-head">
                      <span className="zf-card-title">Holdings Value</span>
                      <span className="zf-card-badge">{activePos.length} stocks</span>
                    </div>
                    <div style={{ padding:"12px 18px" }}><BarWidget stocks={live} /></div>
                  </div>
                </div>
              </div>

            </>)}

            {/* ══════════ OTHER TABS ══════════ */}
            {tab !== "overview" && (
              <div className="zf-tab-panel" style={{ flex: 1, minHeight: "calc(100vh - 130px)" }}>
                {tab === "holdings"  && <PortfolioTable stocks={live} onAdd={handlePortfolioAdd} onImport={handlePortfolioImport} onEdit={handlePortfolioEdit} onDelete={handlePortfolioDelete} />}
                {tab === "trades" && (
                  <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--bg-card)" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:2, padding:"12px 18px 0", borderBottom:"1px solid var(--bd-100)", background:"var(--bg-surface)", flexShrink:0 }}>
                      {([
                        { id:"equity", label:"Equity Trades", count: live.length },
                        { id:"fno",    label:"F&O Positions", count: fnoTrades.length },
                      ] as const).map(st => (
                        <button key={st.id} onClick={() => setTradesSubTab(st.id)} style={{
                          fontSize:12.5, fontWeight: tradesSubTab === st.id ? 700 : 500,
                          color: tradesSubTab === st.id ? "var(--blue)" : "var(--tx-400)",
                          padding:"8px 16px 9px", borderRadius:"7px 7px 0 0",
                          border: tradesSubTab === st.id ? "1px solid var(--bd-100)" : "1px solid transparent",
                          borderBottom: tradesSubTab === st.id ? "1px solid var(--bg-card)" : "1px solid transparent",
                          background: tradesSubTab === st.id ? "var(--bg-card)" : "transparent",
                          cursor:"pointer", fontFamily:"inherit", position:"relative", bottom:"-1px",
                          display:"flex", alignItems:"center", gap:6, transition:"all .12s",
                        }}>
                          {st.label}
                          <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:17, height:17, borderRadius:"50%", fontSize:8.5, fontWeight:700, background: tradesSubTab === st.id ? "var(--blue-dim)" : "var(--bd-50)", color: tradesSubTab === st.id ? "var(--blue)" : "var(--tx-400)", fontFamily:"var(--ff-mono)" }}>{st.count}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ flex:1, overflow:"auto", minHeight:0 }}>
                      {tradesSubTab === "equity" && <TradeStrategyTable trades={trades} onEdit={handleTradeEdit} onDelete={handleTradeDelete} />}
                      {tradesSubTab === "fno"    && <FnOTable trades={fnoTrades} onUpdate={handleFnoTradesUpdate} />}
                    </div>
                  </div>
                )}
                {tab === "watchlist" && <WatchlistTable watchlist={watchlist} onEdit={handleWatchlistEdit} onDelete={handleWatchlistDelete} />}
                {tab === "news"      && <StockNewsFeed stocks={live} />}
                {tab === "charts"    && <PortfolioCharts stocks={live} />}
                {tab === "analytics" && <TradeAnalytics stocks={live} />}
                {tab === "history"   && <TradeHistory stocks={live} />}
                {tab === "journal"   && <TradeJournal entries={journal} onUpdate={setJournal} />}
                {tab === "sector"    && <SectorDiversification stocks={live} />}
                {tab === "alerts"    && <PriceAlerts alerts={alerts} onAddAlert={handleAlertAdd} onDeleteAlert={handleAlertDelete} onDismissAlert={handleAlertDismiss} />}
                {tab === "ai"        && <AIInsights stocks={live} />}
                {tab === "export"    && <ExportPortfolio stocks={live} trades={trades} />}
              </div>
            )}
          </div>
        </div>
      </div>

      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );
}

function StockLineChartWidget({ stock, dayChangePercent }: { stock: PortfolioStock | null; dayChangePercent: number; }) {
  const W = 500, H = 150;
  const pad = { l: 16, r: 16, t: 10, b: 24 };

  const series = useMemo(() => {
    if (!stock) return [];
    return buildTrendSeries(stock.cmp || stock.entryPrice, dayChangePercent, stock.ticker, 28);
  }, [dayChangePercent, stock]);

  if (!stock || series.length === 0) {
    return (<div style={{ height:150, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--tx-300)", fontSize:12 }}>Select a stock to view its chart</div>);
  }

  const values = series.map((p) => p.price);
  const minV = Math.min(...values) * 0.995;
  const maxV = Math.max(...values) * 1.005;
  const range = maxV - minV || 1;
  const xStep = (W - pad.l - pad.r) / Math.max(series.length - 1, 1);
  const yOf = (v: number) => pad.t + (1 - (v - minV) / range) * (H - pad.t - pad.b);
  const xOf = (i: number) => pad.l + i * xStep;
  const line = series.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ");
  const area = `M${xOf(0).toFixed(1)},${yOf(series[0].price).toFixed(1)} ` +
    series.slice(1).map((p, i) => `L${xOf(i + 1).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ") +
    ` L${xOf(series.length - 1).toFixed(1)},${(H - pad.b).toFixed(1)} L${xOf(0).toFixed(1)},${(H - pad.b).toFixed(1)} Z`;
  const positive = dayChangePercent >= 0;
  const stroke   = positive ? "var(--green)" : "var(--red)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width:"100%", height:150 }}>
      <defs>
        <linearGradient id="zfStockArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={positive ? "hsl(152 70% 38%)" : "hsl(4 84% 52%)"} stopOpacity=".18" />
          <stop offset="100%" stopColor={positive ? "hsl(152 70% 38%)" : "hsl(4 84% 52%)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#zfStockArea)" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {["Open","Mid","Now"].map((label, index) => {
        const pointIndex = index === 0 ? 0 : index === 1 ? Math.floor((series.length - 1) / 2) : series.length - 1;
        return (
          <text key={label} x={xOf(pointIndex).toFixed(1)} y={H - 7} textAnchor="middle" fontSize="9" fill="var(--tx-400)" fontFamily="var(--ff-mono)">{label}</text>
        );
      })}
      <circle cx={xOf(series.length - 1).toFixed(1)} cy={yOf(series[series.length - 1].price).toFixed(1)} r="3.5" fill="var(--bg-card)" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
