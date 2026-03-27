import { useState, useEffect, useRef } from "react";
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
import { usePortfolioSync, loadFromLocal } from "@/hooks/usePortfolioSync";
import { useAuth }           from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type ActiveTab =
  | "overview" | "holdings" | "trades" | "watchlist" | "ai"
  | "charts" | "analytics" | "history" | "journal"
  | "sector" | "alerts" | "export" | "news";

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: "MAIN",
    items: [
      { id: "overview",   label: "Dashboard",   icon: LayoutDashboard },
      { id: "holdings",   label: "Portfolio",   icon: Wallet },
      { id: "trades",     label: "Trades",      icon: ScrollText },
      { id: "history",    label: "History",     icon: History },
    ],
  },
  {
    label: "ANALYTICS",
    items: [
      { id: "charts",     label: "Charts",      icon: BarChart3 },
      { id: "sector",     label: "Sectors",     icon: PieChart },
      { id: "analytics",  label: "Performance", icon: Activity },
    ],
  },
  {
    label: "TOOLS",
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
function fmtFullDate(): string {
  return new Date().toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;600&display=swap');

/* ══════════════════════════════════════════════════
   LEDGER PRO — Dark Institutional Design System
   Based on Stitch "Digital Ledger" reference
══════════════════════════════════════════════════ */
.zf {
  --bg-app:       #0a0e13;
  --bg-sidebar:   #0f1419;
  --bg-card:      #151a20;
  --bg-surface:   #1b2027;
  --bg-hover:     #21262e;
  --bg-input:     #0a0e13;

  /* Indigo primary (from Stitch) */
  --navy:         #a3a6ff;
  --navy-700:     #8387ff;
  --navy-600:     #6063ee;
  --navy-100:     rgba(163,166,255,.15);
  --navy-50:      rgba(163,166,255,.08);

  /* Text */
  --tx-900:       #f4f6fe;
  --tx-700:       #d0d3dc;
  --tx-500:       #a8abb2;
  --tx-400:       #72767c;
  --tx-300:       #44484e;
  --tx-200:       #2a2e35;

  /* Borders */
  --bd-200:       #44484e;
  --bd-100:       #2a2e35;
  --bd-50:        #1b2027;

  /* Semantic */
  --green:        #6bff8f;
  --green-bg:     rgba(107,255,143,.08);
  --green-bd:     rgba(107,255,143,.18);
  --red:          #ff716a;
  --red-bg:       rgba(255,113,106,.08);
  --red-bd:       rgba(255,113,106,.18);
  --amber:        #fbbf24;
  --amber-bg:     rgba(251,191,36,.08);
  --amber-bd:     rgba(251,191,36,.18);

  /* Shadows */
  --sh-1: 0 1px 3px rgba(0,0,0,.4);
  --sh-2: 0 4px 16px rgba(0,0,0,.5);
  --sh-3: 0 12px 40px rgba(0,0,0,.7);

  /* Typography */
  --ff-body: 'Inter', -apple-system, sans-serif;
  --ff-disp: 'Inter', -apple-system, sans-serif;
  --ff-mono: 'DM Mono', 'SF Mono', monospace;

  font-family: var(--ff-body);
  background: var(--bg-app);
  min-height: 100vh;
  color: var(--tx-900);
  display: flex;
  overflow: hidden;
  height: 100vh;
}

/* ══════════════════════════════════════════════════
   ANIMATIONS
══════════════════════════════════════════════════ */
@keyframes zf-pulse    { 0%,100%{opacity:1} 50%{opacity:.4} }
@keyframes zf-spin     { to { transform:rotate(360deg); } }
@keyframes zf-fadein   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
@keyframes zf-slidein  { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
@keyframes zf-scalein  { from{opacity:0;transform:scale(.97)} to{opacity:1;transform:scale(1)} }
@keyframes zf-shimmer  { 0%{background-position:200% center} 100%{background-position:-200% center} }
@keyframes zf-glow     { 0%,100%{box-shadow:0 0 20px rgba(163,166,255,.15)} 50%{box-shadow:0 0 35px rgba(163,166,255,.3)} }

.zf-anim-1 { animation: zf-fadein .45s cubic-bezier(.22,1,.36,1) both; }
.zf-anim-2 { animation: zf-fadein .45s .06s cubic-bezier(.22,1,.36,1) both; }
.zf-anim-3 { animation: zf-fadein .45s .12s cubic-bezier(.22,1,.36,1) both; }
.zf-anim-4 { animation: zf-fadein .45s .18s cubic-bezier(.22,1,.36,1) both; }
.zf-anim-5 { animation: zf-fadein .45s .24s cubic-bezier(.22,1,.36,1) both; }
.zf-anim-6 { animation: zf-fadein .45s .30s cubic-bezier(.22,1,.36,1) both; }
.zf-spin   { animation: zf-spin .9s linear infinite; }

/* ══════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════ */
.zf-sidebar {
  width: 280px;
  min-width: 280px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid rgba(68,72,78,.15);
  height: 100vh;
  display: flex;
  flex-direction: column;
  transition: width .3s cubic-bezier(.22,1,.36,1), min-width .3s cubic-bezier(.22,1,.36,1);
  overflow: hidden;
  z-index: 30;
  backdrop-filter: blur(12px);
}
.zf-sidebar.collapsed { width: 72px; min-width: 72px; }

.zf-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 28px 16px 20px;
  border-bottom: 1px solid rgba(68,72,78,.12);
  flex-shrink: 0;
  min-height: 72px;
}
.zf-logo {
  width: 40px; height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-600) 100%);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(163,166,255,.25);
  animation: zf-glow 4s ease-in-out infinite;
}
.zf-logo svg { color: #0f00a4; }
.zf-brand-text { overflow: hidden; white-space: nowrap; }
.zf-brand-name {
  font-size: 17px; font-weight: 900;
  color: #ffffff; letter-spacing: .12em;
  text-transform: uppercase; line-height: 1.1;
}
.zf-brand-sub {
  font-size: 9px; font-weight: 800;
  color: var(--navy); letter-spacing: .2em;
  text-transform: uppercase; margin-top: 2px;
}

.zf-collapse-btn {
  position: absolute; right: -12px; top: 78px;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  box-shadow: var(--sh-1);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; z-index: 40; color: var(--tx-400);
  transition: all .2s cubic-bezier(.22,1,.36,1);
}
.zf-collapse-btn:hover { background: var(--navy-50); color: var(--navy); transform: scale(1.1); }

.zf-nav-scroll {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 12px 16px;
}
.zf-nav-scroll::-webkit-scrollbar { width: 3px; }
.zf-nav-scroll::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 3px; }

.zf-nav-grp {
  font-size: 9.5px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .2em; color: var(--tx-300);
  padding: 16px 4px 6px; white-space: nowrap; overflow: hidden;
}
.zf-sidebar.collapsed .zf-nav-grp { opacity: 0; height: 0; padding: 0; margin: 0; }

.zf-nav-item {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 14px; border-radius: 10px;
  font-size: 13px; font-weight: 500; color: var(--tx-400);
  cursor: pointer; white-space: nowrap; overflow: hidden;
  position: relative; margin-bottom: 2px;
  transition: all .2s cubic-bezier(.22,1,.36,1);
}
.zf-nav-item svg { width: 18px; height: 18px; flex-shrink: 0; transition: transform .2s ease; }
.zf-nav-item:hover { color: var(--tx-700); background: var(--bg-hover); }
.zf-nav-item:hover svg { transform: scale(1.1); }
.zf-nav-item.active {
  color: #ffffff;
  background: linear-gradient(90deg, rgba(163,166,255,.18) 0%, transparent 100%);
  border-right: 2px solid var(--navy);
  font-weight: 600;
}
.zf-nav-item.active svg { color: var(--navy); }
.zf-sidebar.collapsed .zf-nav-item { justify-content: center; padding: 10px; gap: 0; border-right: none; }
.zf-sidebar.collapsed .zf-nav-item span { display: none; }
.zf-sidebar.collapsed .zf-nav-item.active { background: var(--navy-50); border-radius: 10px; border-right: none; }
.zf-nav-label { overflow: hidden; }

.zf-sidebar-foot { padding: 16px; border-top: 1px solid rgba(68,72,78,.12); flex-shrink: 0; }
.zf-user-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  overflow: hidden; transition: all .2s ease; cursor: pointer;
}
.zf-user-row:hover { background: var(--bg-hover); }
.zf-user-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, var(--navy-600), var(--navy));
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; color: #0f00a4; flex-shrink: 0;
}
.zf-user-info { overflow: hidden; flex: 1; }
.zf-user-name { font-size: 12px; font-weight: 600; color: var(--tx-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zf-user-role { font-size: 10px; color: var(--tx-400); font-weight: 500; }
.zf-sidebar.collapsed .zf-user-info, .zf-sidebar.collapsed .zf-brand-text { display: none; }

/* ══════════════════════════════════════════════════
   MAIN AREA
══════════════════════════════════════════════════ */
.zf-main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; min-width: 0; }

/* Header */
.zf-header {
  background: rgba(10,14,19,.85); backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(68,72,78,.12);
  height: 64px; min-height: 64px;
  display: flex; align-items: center; padding: 0 28px; gap: 14px; flex-shrink: 0;
}
.zf-page-title {
  font-size: 19px; font-weight: 800; color: #ffffff;
  letter-spacing: -.3px; flex: 1; white-space: nowrap;
}
.zf-search {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-surface); border: 1px solid rgba(68,72,78,.15);
  border-radius: 99px; padding: 7px 16px; width: 260px;
  transition: all .2s ease;
}
.zf-search:focus-within {
  border-color: rgba(163,166,255,.4); background: var(--bg-card);
  box-shadow: 0 0 0 3px rgba(163,166,255,.1);
}
.zf-search input {
  background: none; border: none; outline: none;
  font-size: 13px; color: var(--tx-700); font-family: var(--ff-body); width: 100%;
}
.zf-search input::placeholder { color: var(--tx-300); }

.zf-live {
  display: flex; align-items: center; gap: 6px;
  font-size: 10px; font-weight: 800;
  padding: 5px 12px; border-radius: 99px; white-space: nowrap;
  letter-spacing: .05em; text-transform: uppercase;
  background: var(--green-bg); border: 1px solid var(--green-bd); color: var(--green);
  transition: all .3s ease;
}
.zf-live.cached { background: var(--amber-bg); border-color: var(--amber-bd); color: var(--amber); }
.zf-ldot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: zf-pulse 2s infinite; }

.zf-hbtn {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--bg-surface); border: 1px solid rgba(68,72,78,.15);
  color: var(--tx-400);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .2s cubic-bezier(.22,1,.36,1); flex-shrink: 0; position: relative;
}
.zf-hbtn:hover { background: var(--bg-hover); border-color: var(--bd-100); color: var(--tx-700); transform: scale(1.05); }

.zf-umenu {
  position: absolute; right: 0; top: calc(100% + 8px);
  background: var(--bg-card); border: 1px solid var(--bd-100);
  border-radius: 12px; box-shadow: var(--sh-3); min-width: 190px; z-index: 100;
  overflow: hidden; animation: zf-scalein .15s ease both;
}
.zf-umenu-head { padding: 14px 16px; border-bottom: 1px solid var(--bd-50); background: var(--bg-surface); }
.zf-umenu-lbl { font-size: 9px; color: var(--tx-400); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 3px; }
.zf-umenu-email { font-size: 12.5px; font-weight: 600; color: var(--tx-900); }
.zf-umenu-btn {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 11px 16px; font-size: 12.5px; font-weight: 500;
  cursor: pointer; border: none; background: transparent;
  transition: background .15s; font-family: var(--ff-body); color: var(--tx-700);
}
.zf-umenu-btn:hover { background: var(--bg-hover); }
.zf-umenu-btn.danger { color: var(--red); }
.zf-umenu-btn.primary { color: var(--navy); }

/* Content scroll */
.zf-content {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  background: var(--bg-app); padding: 28px;
  display: flex; flex-direction: column; gap: 22px; min-height: 0;
}
.zf-content::-webkit-scrollbar { width: 4px; }
.zf-content::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 4px; }

/* ══════════════════════════════════════════════════
   GREETING
══════════════════════════════════════════════════ */
.zf-greeting {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0 4px; flex-shrink: 0;
}
.zf-greeting-name {
  font-size: 28px; font-weight: 800; color: #ffffff;
  letter-spacing: -.5px; line-height: 1.1;
}
.zf-greeting-date { font-size: 13px; color: var(--tx-500); font-weight: 500; margin-top: 4px; }
.zf-greeting-right { display: flex; align-items: center; gap: 8px; }
.zf-greeting-pill {
  display: flex; align-items: center; gap: 6px;
  font-size: 11.5px; font-weight: 600; color: var(--tx-500);
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  border-radius: 99px; padding: 6px 14px; cursor: pointer;
  transition: all .2s ease;
}
.zf-greeting-pill:hover { background: var(--bg-hover); color: var(--tx-700); }

/* ══════════════════════════════════════════════════
   KPI STAT CARDS
══════════════════════════════════════════════════ */
.zf-kpi-row { display: grid; grid-template-columns: repeat(4,1fr); gap: 18px; }
.zf-kpi {
  background: var(--bg-card); border: 1px solid var(--bd-50);
  border-radius: 16px; padding: 22px 22px 20px;
  display: flex; flex-direction: column; gap: 0;
  transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s ease, border-color .25s ease;
  position: relative; overflow: hidden; cursor: default;
}
.zf-kpi::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,255,255,.02) 0%, transparent 60%);
  pointer-events: none;
}
.zf-kpi:hover { transform: translateY(-4px); box-shadow: 0 16px 40px rgba(0,0,0,.5); border-color: rgba(163,166,255,.12); }

.zf-kpi.kpi-navy  { background: var(--bg-card); border-color: var(--bd-50); }
.zf-kpi.kpi-green { background: var(--bg-card); border-bottom: 2px solid rgba(107,255,143,.3); }
.zf-kpi.kpi-red   { background: var(--bg-card); border-bottom: 2px solid rgba(255,113,106,.3); }

.zf-kpi-icon {
  width: 40px; height: 40px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 18px; flex-shrink: 0; transition: transform .2s ease;
}
.zf-kpi:hover .zf-kpi-icon { transform: scale(1.08); }
.zf-kpi-lbl {
  font-size: 9.5px; font-weight: 800; text-transform: uppercase;
  letter-spacing: .15em; color: var(--tx-400); margin-bottom: 6px;
}
.zf-kpi-val {
  font-family: var(--ff-mono); font-size: 26px; font-weight: 600;
  color: var(--tx-900); line-height: 1; letter-spacing: -.6px;
}
.zf-kpi.kpi-green .zf-kpi-val { color: var(--green); }
.zf-kpi.kpi-red   .zf-kpi-val { color: var(--red); }
.zf-kpi-sub { font-size: 11px; color: var(--tx-500); margin-top: 8px; font-weight: 500; }
.zf-kpi-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 800; padding: 3px 9px;
  border-radius: 99px; margin-top: 10px; align-self: flex-start; letter-spacing: .02em;
}
.zf-chip-green { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bd); }
.zf-chip-red   { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red-bd); }
.zf-chip-navy  { background: var(--navy-50);  color: var(--navy);  border: 1px solid var(--navy-100); }
.zf-kpi-divider { margin-top: 10px; padding-top: 9px; border-top: 1px solid var(--bd-50); font-size: 10px; color: var(--tx-300); font-weight: 500; }

/* ══════════════════════════════════════════════════
   LAYOUT GRIDS
══════════════════════════════════════════════════ */
.zf-mid-row { display: grid; grid-template-columns: 1fr 300px; gap: 18px; min-height: 0; }
.zf-bot-row { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; min-height: 0; }

/* ══════════════════════════════════════════════════
   CARDS
══════════════════════════════════════════════════ */
.zf-card {
  background: var(--bg-card); border: 1px solid var(--bd-50);
  border-radius: 16px; display: flex; flex-direction: column;
  overflow: hidden; min-height: 0;
  transition: box-shadow .25s ease;
}
.zf-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,.4); }
.zf-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 22px; border-bottom: 1px solid var(--bd-50);
  flex-shrink: 0; gap: 10px;
}
.zf-card-title { font-size: 15px; font-weight: 700; color: #ffffff; letter-spacing: -.1px; }
.zf-card-meta { display: flex; align-items: center; gap: 8px; }
.zf-card-badge {
  font-size: 10px; font-weight: 700; color: var(--navy);
  background: var(--navy-50); border: 1px solid var(--navy-100);
  border-radius: 99px; padding: 3px 10px;
}
.zf-card-link {
  font-size: 11.5px; font-weight: 700; color: var(--navy);
  cursor: pointer; padding: 5px 13px; border-radius: 8px;
  background: var(--navy-50); border: 1px solid var(--navy-100);
  transition: all .2s ease; white-space: nowrap;
}
.zf-card-link:hover { background: var(--navy-700); color: #fff; border-color: var(--navy-700); transform: translateX(1px); }
.zf-card-body { padding: 0; overflow-y: auto; flex: 1; }
.zf-card-body::-webkit-scrollbar { width: 3px; }
.zf-card-body::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 3px; }

/* ══════════════════════════════════════════════════
   PERF CHART
══════════════════════════════════════════════════ */
.zf-perf-wrap { padding: 18px 22px; }
.zf-perf-numbers { display: flex; gap: 28px; margin-bottom: 18px; flex-wrap: wrap; }
.zf-perf-num { display: flex; flex-direction: column; gap: 2px; }
.zf-perf-num-val { font-family: var(--ff-mono); font-size: 20px; font-weight: 600; color: var(--tx-900); }
.zf-perf-num-lbl { font-size: 9.5px; color: var(--tx-400); font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
.zf-areachart { width: 100%; }

/* ══════════════════════════════════════════════════
   SECTOR PANEL
══════════════════════════════════════════════════ */
.zf-sector-list { padding: 14px 22px; display: flex; flex-direction: column; gap: 12px; }
.zf-sector-item { display: flex; flex-direction: column; gap: 5px; }
.zf-sector-row { display: flex; align-items: center; justify-content: space-between; }
.zf-sector-name { font-size: 12.5px; font-weight: 600; color: var(--tx-700); }
.zf-sector-pct  { font-family: var(--ff-mono); font-size: 11px; font-weight: 700; color: var(--navy); }
.zf-sector-bar  { height: 4px; border-radius: 4px; background: var(--bd-50); overflow: hidden; }
.zf-sector-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--navy) 0%, var(--navy-600) 100%); transition: width .6s cubic-bezier(.22,1,.36,1); }

/* ══════════════════════════════════════════════════
   HOLDINGS TABLE
══════════════════════════════════════════════════ */
.zf-tbl-head {
  display: grid; grid-template-columns: 2fr .6fr 1fr 1fr .9fr; gap: 0;
  padding: 11px 22px; background: var(--bg-surface);
  border-bottom: 1px solid var(--bd-100); position: sticky; top: 0; z-index: 2;
}
.zf-th { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .15em; color: var(--tx-400); }
.zf-th.r { text-align: right; }
.zf-trow {
  display: grid; grid-template-columns: 2fr .6fr 1fr 1fr .9fr; gap: 0;
  padding: 13px 22px; align-items: center; border-bottom: 1px solid var(--bd-50);
  transition: background .15s ease;
}
.zf-trow:hover { background: var(--bg-hover); }
.zf-trow:last-child { border-bottom: none; }
.zf-stock-cell { display: flex; align-items: center; gap: 11px; }
.zf-logo-wrap {
  width: 34px; height: 34px; border-radius: 8px;
  background: var(--bg-surface); border: 1px solid var(--bd-100);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 900; color: var(--navy);
  overflow: hidden; flex-shrink: 0; transition: transform .2s ease;
}
.zf-trow:hover .zf-logo-wrap { transform: scale(1.05); }
.zf-ticker-name { font-size: 13px; font-weight: 700; color: var(--tx-900); letter-spacing: -.1px; }
.zf-sector-tag {
  display: inline-block; font-size: 9.5px; font-weight: 600;
  padding: 1px 7px; border-radius: 4px;
  background: var(--bg-app); border: 1px solid var(--bd-100); color: var(--tx-400); margin-top: 2px;
}
.zf-td { font-family: var(--ff-mono); font-size: 12.5px; color: var(--tx-500); font-weight: 500; }
.zf-td.r { text-align: right; }
.zf-pl  { font-family: var(--ff-mono); font-size: 12.5px; font-weight: 700; text-align: right; }
.zf-pl-sub { font-family: var(--ff-mono); font-size: 10px; text-align: right; margin-top: 1px; }

/* ══════════════════════════════════════════════════
   WATCHLIST
══════════════════════════════════════════════════ */
.zf-wl-head {
  display: grid; grid-template-columns: 1fr auto auto; gap: 12px;
  padding: 11px 22px; background: var(--bg-surface); border-bottom: 1px solid var(--bd-100);
}
.zf-wl-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 22px; border-bottom: 1px solid var(--bd-50);
  transition: background .15s ease; gap: 10px; cursor: pointer;
}
.zf-wl-row:hover { background: var(--bg-hover); transform: scale(1.005); }
.zf-wl-row:last-child { border-bottom: none; }
.zf-wl-name  { font-size: 13px; font-weight: 700; color: var(--tx-900); }
.zf-wl-sub   { font-size: 10px; color: var(--tx-400); margin-top: 2px; font-weight: 500; }
.zf-wl-spark { width: 58px; height: 28px; flex-shrink: 0; }
.zf-wl-price { font-family: var(--ff-mono); font-size: 13px; font-weight: 700; color: var(--tx-900); text-align: right; }
.zf-wl-chg   { font-size: 10.5px; font-weight: 700; text-align: right; margin-top: 2px; }

/* ══════════════════════════════════════════════════
   AI INSIGHT TEASER CARD
══════════════════════════════════════════════════ */
.zf-ai-teaser {
  margin: 16px; padding: 16px;
  background: linear-gradient(135deg, rgba(163,166,255,.1) 0%, rgba(255,113,106,.06) 100%);
  border: 1px solid rgba(255,255,255,.05);
  border-radius: 12px; position: relative; overflow: hidden;
  transition: all .25s ease; cursor: pointer;
}
.zf-ai-teaser:hover { background: linear-gradient(135deg, rgba(163,166,255,.16) 0%, rgba(255,113,106,.10) 100%); transform: translateY(-1px); }
.zf-ai-teaser-bg {
  position: absolute; right: -8px; bottom: -8px;
  font-size: 80px; opacity: .06; pointer-events: none;
  transition: transform .4s ease; line-height: 1;
}
.zf-ai-teaser:hover .zf-ai-teaser-bg { transform: scale(1.18) rotate(8deg); opacity: .1; }

/* ══════════════════════════════════════════════════
   TAB PANEL (non-overview)
══════════════════════════════════════════════════ */
.zf-tab-panel {
  flex: 1; background: var(--bg-card); border: 1px solid var(--bd-50);
  border-radius: 16px; overflow: hidden;
  display: flex; flex-direction: column; min-height: 0;
  animation: zf-scalein .2s ease both;
}
.zf-tab-panel > * { flex: 1; overflow: auto; min-height: 0; }
.zf-tab-panel > *::-webkit-scrollbar { width: 4px; height: 4px; }
.zf-tab-panel > *::-webkit-scrollbar-thumb { background: var(--bd-100); border-radius: 4px; }
.zf-tab-panel th {
  background: var(--bg-surface) !important; color: var(--tx-400) !important;
  font-size: 9px !important; font-weight: 800 !important;
  text-transform: uppercase !important; letter-spacing: .15em !important;
  border-bottom: 1px solid var(--bd-100) !important; padding: 11px 18px !important;
}
.zf-tab-panel td {
  padding: 13px 18px !important; font-size: 13px !important;
  color: var(--tx-500) !important; border-bottom: 1px solid var(--bd-50) !important;
  vertical-align: middle !important;
}
.zf-tab-panel tr:hover td { background: var(--bg-hover) !important; }
.zf-tab-panel tbody tr:last-child td { border-bottom: none !important; }
.zf-tab-panel .font-semibold, .zf-tab-panel .font-bold { color: var(--tx-900) !important; }
.zf-tab-panel h2, .zf-tab-panel h3 { color: var(--navy) !important; }
.zf-tab-panel p.text-muted-foreground, .zf-tab-panel [class*="text-muted"] { color: var(--tx-400) !important; }
.zf-tab-panel button.bg-primary, .zf-tab-panel [class*="bg-primary"] { background: var(--navy) !important; color: #0f00a4 !important; }
.zf-tab-panel button[class*="outline"] { background: var(--bg-card) !important; border-color: var(--bd-100) !important; color: var(--navy) !important; }
.zf-tab-panel button[class*="outline"]:hover { background: var(--bg-hover) !important; }
.zf-tab-panel button[class*="ghost"]:hover { background: var(--bg-hover) !important; color: var(--navy) !important; }
.zf-tab-panel input:not([type="checkbox"]), .zf-tab-panel select, .zf-tab-panel textarea {
  background: var(--bg-input) !important; border-color: var(--bd-100) !important;
  color: var(--tx-900) !important; font-size: 13px !important;
}
.zf-tab-panel input:focus, .zf-tab-panel select:focus, .zf-tab-panel textarea:focus {
  border-color: var(--navy) !important; box-shadow: 0 0 0 3px rgba(163,166,255,.12) !important;
}
.zf-tab-panel label { color: var(--tx-500) !important; font-size: 12px !important; font-weight: 600 !important; }
.zf-tab-panel input::placeholder, .zf-tab-panel textarea::placeholder { color: var(--tx-300) !important; }
.zf-tab-panel [role="tablist"] { background: var(--bg-surface) !important; border-radius: 8px !important; }
.zf-tab-panel [role="tab"] { color: var(--tx-400) !important; }
.zf-tab-panel [role="tab"][data-state="active"] { background: var(--bg-hover) !important; color: var(--navy) !important; font-weight: 700 !important; }
.zf-tab-panel .recharts-text { fill: var(--tx-400) !important; }
.zf-tab-panel .rounded-xl, .zf-tab-panel .rounded-lg, .zf-tab-panel [class*="card"] { background: var(--bg-card) !important; border-color: var(--bd-50) !important; }

/* ══════════════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════════════ */
@media (max-width:1200px) { .zf-sidebar { width:72px; min-width:72px; } .zf-sidebar .zf-brand-text,.zf-sidebar .zf-user-info,.zf-sidebar .zf-nav-label,.zf-sidebar .zf-nav-grp { display:none; } .zf-sidebar .zf-nav-item { justify-content:center; padding:10px; gap:0; } }
@media (max-width:1100px) { .zf-mid-row { grid-template-columns:1fr; } .zf-mid-row .zf-sector-side { display:none; } }
@media (max-width:900px)  { .zf-kpi-row { grid-template-columns:repeat(2,1fr); } .zf-bot-row { grid-template-columns:1fr; } .zf-search { display:none; } }
@media (max-width:640px)  { .zf-kpi-row { grid-template-columns:1fr 1fr; } .zf-content { padding:14px; gap:14px; } }

/* ══════════════════════════════════════════════════
   LIGHT MODE — clean institutional white
   Mirrors the Stitch design with inverted palette
══════════════════════════════════════════════════ */
:not(.dark) .zf {
  --bg-app:       #f0f2f5;
  --bg-sidebar:   #ffffff;
  --bg-card:      #ffffff;
  --bg-surface:   #f6f8fb;
  --bg-hover:     #eef1f6;
  --bg-input:     #f6f8fb;

  /* Indigo primary — slightly deeper for light bg readability */
  --navy:         #4f52d4;
  --navy-700:     #3d40c0;
  --navy-600:     #6063ee;
  --navy-100:     rgba(79,82,212,.12);
  --navy-50:      rgba(79,82,212,.07);

  /* Text */
  --tx-900:       #0d1117;
  --tx-700:       #1f2533;
  --tx-500:       #4b5268;
  --tx-400:       #72767c;
  --tx-300:       #a8abb2;
  --tx-200:       #d4d7de;

  /* Borders */
  --bd-200:       #d4d7de;
  --bd-100:       #e8ebf0;
  --bd-50:        #f0f2f5;

  /* Semantic — richer on white */
  --green:        #059669;
  --green-bg:     #ecfdf5;
  --green-bd:     #a7f3d0;
  --red:          #dc2626;
  --red-bg:       #fef2f2;
  --red-bd:       #fecaca;
  --amber:        #d97706;
  --amber-bg:     #fffbeb;
  --amber-bd:     #fcd34d;

  /* Shadows — softer on light */
  --sh-1: 0 1px 4px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --sh-2: 0 4px 16px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04);
  --sh-3: 0 12px 40px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.06);

  color: var(--tx-900);
}

/* Light sidebar */
:not(.dark) .zf-sidebar {
  background: #ffffff;
  border-right: 1px solid #e8ebf0;
  box-shadow: 2px 0 12px rgba(0,0,0,.04);
}
:not(.dark) .zf-brand-name { color: #0d1117; }
:not(.dark) .zf-brand-sub  { color: var(--navy); }
:not(.dark) .zf-logo {
  background: linear-gradient(135deg, var(--navy) 0%, var(--navy-600) 100%);
  box-shadow: 0 4px 14px rgba(79,82,212,.2);
  animation: none;
}
:not(.dark) .zf-logo svg { color: #fff; }
:not(.dark) .zf-nav-grp   { color: #a8abb2; }
:not(.dark) .zf-nav-item  { color: #4b5268; }
:not(.dark) .zf-nav-item:hover { background: #eef1f6; color: #0d1117; }
:not(.dark) .zf-nav-item.active {
  background: linear-gradient(90deg, rgba(79,82,212,.1) 0%, transparent 100%);
  border-right: 2px solid var(--navy);
  color: var(--navy);
}
:not(.dark) .zf-nav-item.active svg { color: var(--navy); }
:not(.dark) .zf-collapse-btn { background: #fff; border-color: #e8ebf0; color: #72767c; }
:not(.dark) .zf-collapse-btn:hover { background: rgba(79,82,212,.07); color: var(--navy); }
:not(.dark) .zf-user-row  { background: #f6f8fb; border-color: #e8ebf0; }
:not(.dark) .zf-user-row:hover { background: #eef1f6; }
:not(.dark) .zf-user-avatar { background: linear-gradient(135deg, var(--navy), var(--navy-600)); color: #fff; }
:not(.dark) .zf-user-name { color: #1f2533; }
:not(.dark) .zf-user-role { color: #72767c; }

/* Light header */
:not(.dark) .zf-header {
  background: rgba(255,255,255,.9);
  border-bottom: 1px solid #e8ebf0;
  box-shadow: 0 1px 4px rgba(0,0,0,.05);
}
:not(.dark) .zf-page-title { color: #0d1117; }
:not(.dark) .zf-search { background: #f6f8fb; border-color: #e8ebf0; }
:not(.dark) .zf-search:focus-within { border-color: var(--navy); box-shadow: 0 0 0 3px rgba(79,82,212,.1); }
:not(.dark) .zf-search input { color: #1f2533; }
:not(.dark) .zf-search input::placeholder { color: #a8abb2; }
:not(.dark) .zf-hbtn { background: #f6f8fb; border-color: #e8ebf0; color: #72767c; }
:not(.dark) .zf-hbtn:hover { background: rgba(79,82,212,.07); border-color: rgba(79,82,212,.2); color: var(--navy); }
:not(.dark) .zf-live { background: #ecfdf5; border-color: #a7f3d0; color: #059669; }
:not(.dark) .zf-live.cached { background: #fffbeb; border-color: #fcd34d; color: #d97706; }

/* Light greeting */
:not(.dark) .zf-greeting-name { color: #0d1117; }
:not(.dark) .zf-greeting-pill { background: #fff; border-color: #e8ebf0; color: #4b5268; }
:not(.dark) .zf-greeting-pill:hover { background: #f0f2f5; }

/* Light KPI cards */
:not(.dark) .zf-kpi {
  background: #ffffff;
  border-color: #e8ebf0;
  box-shadow: var(--sh-1);
}
:not(.dark) .zf-kpi:hover { box-shadow: 0 8px 28px rgba(0,0,0,.1); border-color: rgba(79,82,212,.15); }
:not(.dark) .zf-kpi-lbl { color: #72767c; }
:not(.dark) .zf-kpi-val { color: #0d1117; }
:not(.dark) .zf-kpi-sub { color: #72767c; }
:not(.dark) .zf-kpi.kpi-green { border-bottom-color: #a7f3d0; }
:not(.dark) .zf-kpi.kpi-red   { border-bottom-color: #fecaca; }
:not(.dark) .zf-chip-green { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
:not(.dark) .zf-chip-red   { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
:not(.dark) .zf-chip-navy  { background: rgba(79,82,212,.08); color: var(--navy); border-color: rgba(79,82,212,.18); }

/* Light cards */
:not(.dark) .zf-card { background: #ffffff; border-color: #e8ebf0; box-shadow: var(--sh-1); }
:not(.dark) .zf-card:hover { box-shadow: var(--sh-2); }
:not(.dark) .zf-card-head { background: #f6f8fb; border-bottom-color: #e8ebf0; }
:not(.dark) .zf-card-title { color: #0d1117; }
:not(.dark) .zf-card-badge { background: rgba(79,82,212,.07); border-color: rgba(79,82,212,.15); color: var(--navy); }
:not(.dark) .zf-card-link  { background: rgba(79,82,212,.07); border-color: rgba(79,82,212,.15); color: var(--navy); }
:not(.dark) .zf-card-link:hover { background: var(--navy); color: #fff; border-color: var(--navy); }

/* Light table */
:not(.dark) .zf-tbl-head { background: #f6f8fb; border-bottom-color: #e8ebf0; }
:not(.dark) .zf-th { color: #a8abb2; }
:not(.dark) .zf-trow { border-bottom-color: #f0f2f5; }
:not(.dark) .zf-trow:hover { background: #f6f8fb; }
:not(.dark) .zf-ticker-name { color: #0d1117; }
:not(.dark) .zf-sector-tag { background: #f0f2f5; border-color: #e8ebf0; color: #72767c; }
:not(.dark) .zf-logo-wrap { background: rgba(79,82,212,.07); border-color: rgba(79,82,212,.15); color: var(--navy); }
:not(.dark) .zf-td { color: #4b5268; }
:not(.dark) .zf-wl-head { background: #f6f8fb; border-bottom-color: #e8ebf0; }
:not(.dark) .zf-wl-row { border-bottom-color: #f0f2f5; }
:not(.dark) .zf-wl-row:hover { background: #f6f8fb; }
:not(.dark) .zf-wl-name  { color: #0d1117; }
:not(.dark) .zf-wl-sub   { color: #a8abb2; }
:not(.dark) .zf-wl-price { color: #0d1117; }
:not(.dark) .zf-sector-name { color: #1f2533; }
:not(.dark) .zf-sector-pct  { color: var(--navy); }
:not(.dark) .zf-sector-bar  { background: #e8ebf0; }

/* Light sector fill gradient */
:not(.dark) .zf-sector-fill {
  background: linear-gradient(90deg, var(--navy) 0%, var(--navy-600) 100%);
}

/* Light umenu */
:not(.dark) .zf-umenu { background: #fff; border-color: #e8ebf0; }
:not(.dark) .zf-umenu-head { background: #f6f8fb; border-bottom-color: #e8ebf0; }
:not(.dark) .zf-umenu-lbl  { color: #a8abb2; }
:not(.dark) .zf-umenu-email { color: #0d1117; }
:not(.dark) .zf-umenu-btn  { color: #1f2533; }
:not(.dark) .zf-umenu-btn:hover { background: #f0f2f5; }
:not(.dark) .zf-umenu-btn.danger  { color: #dc2626; }
:not(.dark) .zf-umenu-btn.primary { color: var(--navy); }

/* Light glow — softer on light bg */
:not(.dark) .zf-logo { animation: none; box-shadow: 0 4px 14px rgba(79,82,212,.22); }

/* Light AI teaser */
:not(.dark) .zf-ai-teaser {
  background: linear-gradient(135deg, rgba(79,82,212,.06) 0%, rgba(220,38,38,.04) 100%);
  border-color: rgba(79,82,212,.12);
}
:not(.dark) .zf-ai-teaser:hover {
  background: linear-gradient(135deg, rgba(79,82,212,.1) 0%, rgba(220,38,38,.07) 100%);
}

/* Light tab panel overrides */
:not(.dark) .zf-tab-panel { background: #fff; border-color: #e8ebf0; }
:not(.dark) .zf-tab-panel th { background: #f6f8fb !important; color: #a8abb2 !important; border-bottom-color: #e8ebf0 !important; }
:not(.dark) .zf-tab-panel td { color: #4b5268 !important; border-bottom-color: #f0f2f5 !important; }
:not(.dark) .zf-tab-panel tr:hover td { background: #f6f8fb !important; }
:not(.dark) .zf-tab-panel .font-semibold,
:not(.dark) .zf-tab-panel .font-bold { color: #0d1117 !important; }
:not(.dark) .zf-tab-panel h2,
:not(.dark) .zf-tab-panel h3 { color: var(--navy) !important; }
:not(.dark) .zf-tab-panel [role="tablist"] { background: #f6f8fb !important; }
:not(.dark) .zf-tab-panel [role="tab"] { color: #72767c !important; }
:not(.dark) .zf-tab-panel [role="tab"][data-state="active"] { background: #fff !important; color: var(--navy) !important; }
:not(.dark) .zf-tab-panel input:not([type="checkbox"]),
:not(.dark) .zf-tab-panel select,
:not(.dark) .zf-tab-panel textarea { background: #f6f8fb !important; border-color: #e8ebf0 !important; color: #0d1117 !important; }
:not(.dark) .zf-tab-panel input:focus,
:not(.dark) .zf-tab-panel select:focus { border-color: var(--navy) !important; box-shadow: 0 0 0 3px rgba(79,82,212,.1) !important; }
:not(.dark) .zf-tab-panel .rounded-xl,
:not(.dark) .zf-tab-panel .rounded-lg { background: #fff !important; border-color: #e8ebf0 !important; }
:not(.dark) .zf-tab-panel button.bg-primary { background: var(--navy) !important; color: #fff !important; }
:not(.dark) .zf-tab-panel button[class*="outline"] { background: #fff !important; border-color: #e8ebf0 !important; color: var(--navy) !important; }
:not(.dark) .zf-tab-panel button[class*="outline"]:hover { background: rgba(79,82,212,.07) !important; }

/* Dark mode stays as-is */
.dark .zf { color-scheme: dark; }
`;

// ─── Line Chart Widget ────────────────────────────────────────────────────────
function LineChartWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const curMonth = new Date().getMonth();
  const W = 500, H = 130, pad = { l:36, r:12, t:10, b:28 };

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
          <stop offset="0%" stopColor="#1c3557" stopOpacity=".14" />
          <stop offset="100%" stopColor="#1c3557" stopOpacity=".01" />
        </linearGradient>
      </defs>
      {yTicks.map(t => (
        <g key={t.v}>
          <line x1={pad.l} x2={W-pad.r} y1={t.y.toFixed(1)} y2={t.y.toFixed(1)} stroke="#f0f2f5" strokeWidth="1" />
          <text x={pad.l-4} y={(t.y+3.5).toFixed(1)} textAnchor="end" fontSize="9" fill="var(--tx-300)" fontFamily="var(--ff-body)">{t.label}</text>
        </g>
      ))}
      <path d={thisArea} fill="url(#lgArea)" />
      <polyline points={prevLine} fill="none" stroke="var(--tx-200)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
      <polyline points={thisLine} fill="none" stroke="#1c3557" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (i === 0 || i === pts.length - 1 || i % 2 === 0) && (
        <text key={p.m} x={xOf(i).toFixed(1)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--tx-300)" fontFamily="var(--ff-body)">{p.m}</text>
      ))}
      <circle cx={xOf(pts.length-1).toFixed(1)} cy={yOf(pts[pts.length-1].val).toFixed(1)} r="4" fill="white" stroke="#1c3557" strokeWidth="2" />
    </svg>
  );
}

// ─── Donut Chart Widget ────────────────────────────────────────────────────────
function DonutWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const map = new Map<string, number>();
  active.forEach(s => map.set(s.sector ?? "Other", (map.get(s.sector ?? "Other") ?? 0) + calcInvestedValue(s)));
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  const entries = [...map.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
  const COLORS = ["#1c3557","#6ea8d8","#a8cce8","#2a7ec9","#93b8d4"];

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
      <svg viewBox="0 0 100 100" style={{ width:88, height:88, flexShrink:0 }}>
        {slices.map(s => <path key={s.name} d={s.d} fill={s.color} />)}
        <text x="50" y="47" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1f2d3d" fontFamily="var(--ff-body)">{fmt(total)}</text>
        <text x="50" y="57" textAnchor="middle" fontSize="7" fill="var(--tx-300)" fontFamily="var(--ff-body)">invested</text>
      </svg>
      <div style={{ display:"flex", flexDirection:"column", gap:6, flex:1 }}>
        {slices.map(s => (
          <div key={s.name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:s.color, flexShrink:0 }} />
              <span style={{ fontSize:11, color:"var(--tx-500)", fontWeight:500 }}>{s.name}</span>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:"var(--tx-700)", fontFamily:"var(--ff-mono)" }}>
              {(s.pct*100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Bar Chart Widget ────────────────────────────────────────────────────────
function BarWidget({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const items  = active
    .map(s => ({ ticker:s.ticker, val:calcFinalValue(s), pnlPct:s.entryPrice>0?(s.cmp-s.entryPrice)/s.entryPrice*100:0 }))
    .sort((a,b) => b.val-a.val).slice(0,6);

  if (items.length === 0) return (
    <div style={{ height:80, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--tx-300)", fontSize:12 }}>No data</div>
  );

  const maxV = Math.max(...items.map(i => i.val)) || 1;
  const COLORS = ["#1c3557","#2a5f9e","#3b82c4","#5a9fd4","#7ab8e0","#9fcce8"];

  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:104 }}>
      {items.map((item, i) => {
        const h = Math.max(6, (item.val / maxV) * 80);
        const pos = item.pnlPct >= 0;
        return (
          <div key={item.ticker} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flex:1 }}>
            <div style={{ fontSize:9, fontWeight:700, color:pos?"var(--green)":"var(--red)", fontFamily:"var(--ff-mono)" }}>
              {pos?"+":""}{item.pnlPct.toFixed(1)}%
            </div>
            <div style={{ width:"100%", height:h, borderRadius:"5px 5px 0 0", background:COLORS[i%COLORS.length], opacity:pos?1:0.65 }} />
            <div style={{ fontSize:9, color:"var(--tx-400)", fontWeight:600, textAlign:"center", whiteSpace:"nowrap", overflow:"hidden", maxWidth:"100%" }}>
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
    try { return localStorage.getItem("zf-dark") === "1"; } catch { return false; } /* default: light */
  });

  // Apply dark mode to <html>
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
      // Sanitize: clear corrupted option LTPs caused by the old bug that stored
      // the underlying stock spot price as the option premium. An option premium
      // should always be << the underlying price. We detect corruption by checking
      // if ltp > entryPrice * 10 for options (a 10x move on a premium is impossible
      // in normal trading, but storing ₹6414 for a ₹118 premium is clearly wrong).
      return parsed.map(t => {
        if (t.instrumentType !== "FUT" && t.ltp !== undefined) {
          const maxReasonableLtp = Math.max(t.entryPrice * 20, 500);
          if (t.ltp > maxReasonableLtp) {
            console.warn(`[FnO] Clearing corrupted LTP for ${t.symbol} ${t.instrumentType}: ₹${t.ltp} → reset to entry ₹${t.entryPrice}`);
            return { ...t, ltp: undefined };
          }
        }
        return t;
      });
    } catch { return fnOTradesData; }
  });
  const [tradesSubTab, setTradesSubTab] = useState<"equity"|"fno">("equity");

  // Persist F&O trades
  useEffect(() => {
    try { localStorage.setItem("zf-fno-trades", JSON.stringify(fnoTrades)); } catch {}
  }, [fnoTrades]);

  const { toast }         = useToast();
  const { user, signOut, loading: _authLoading } = useAuth();
  const tickers = stocks.map(s => s.ticker);
  const { prices, source, marketOpen, refresh } = useLivePrices(tickers);
  // isLive = fresh data from any real source (not memory-cache)
  const isLive = source !== null && source !== "memory-cache";
  usePortfolioSync({ stocks, trades, watchlist, alerts, setStocks, setTrades, setWatchlist, setAlerts });

  const live = stocks.map(s =>
    prices[s.ticker]?.price ? { ...s, cmp: prices[s.ticker].price } : s
  );

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (uMenuRef.current && !uMenuRef.current.contains(e.target as Node)) setUMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Metrics ──────────────────────────────────────────────────────────────
  const activePos   = live.filter(s => s.status === "Active");
  const closedPos   = live.filter(s => s.status !== "Active");

  // Equity metrics
  const equityInvested  = live.reduce((s, x) => s + calcInvestedValue(x), 0);          // ALL equity ever invested
  const activeCurr      = activePos.reduce((s, x) => s + calcFinalValue(x), 0);         // current value of open positions
  const realisedPnl     = closedPos.reduce((s, x) => s + calcProfitLoss(x), 0);         // closed trade P&L
  const unrealisedPnl   = activePos.reduce((s, x) => s + calcProfitLoss(x), 0);         // open position P&L

  // F&O metrics
  const fnoOpen         = fnoTrades.filter(t => t.status === "Open");
  const fnoClosed       = fnoTrades.filter(t => t.status !== "Open");
  // F&O "invested" = premium paid for options + margin deployed for futures (~15% notional)
  const fnoInvested     = fnoTrades.reduce((s, t) => s + calcFnOInvested(t), 0);
  // F&O unrealised P&L = sum of P&L on all open positions
  const fnoUnrealised   = fnoOpen.reduce((s, t) => s + calcFnOPnL(t), 0);
  const fnoRealised     = fnoClosed.reduce((s, t) => s + calcFnOPnL(t), 0);
  // F&O current value = invested capital + unrealised P&L (NOT full notional)
  // This keeps "Portfolio Value" meaningful — shows what your F&O book is worth today
  const fnoActiveCurr   = fnoInvested + fnoUnrealised;

  // COMBINED dashboard metrics
  // "Total Invested" = equity cost basis (all trades) + F&O capital deployed
  const invested        = equityInvested + fnoInvested;
  // "Portfolio Value" = active equity market value + F&O current value
  const current         = activeCurr + fnoActiveCurr;
  // "Unrealised P&L" = equity open P&L + F&O open P&L
  const pnl             = unrealisedPnl + fnoUnrealised;
  const pnlPct          = invested > 0 ? pnl / invested * 100 : 0;
  // "Realised P&L" = equity closed P&L + F&O closed P&L
  const totalRealised   = realisedPnl + fnoRealised;

  const winners         = closedPos.filter(s => calcProfitLoss(s) > 0);
  const winRate         = closedPos.length > 0 ? winners.length / closedPos.length * 100 : 0;
  // Today's P&L — use prices[ticker].change (absolute ₹ day move) when available.
  // change is populated by the API from Yahoo/Upstox for ALL sources, not just live.
  const todayPnl = activePos.reduce((acc, s) => {
    const pd = prices[s.ticker];
    if (pd?.change !== undefined && pd.change !== 0) return acc + pd.change * s.quantity;
    // fallback only if API returned no day-change at all
    return acc;
  }, 0);
  const todayPct = activeCurr > 0 ? (todayPnl / activeCurr) * 100 : 0;

  const performers = activePos
    .filter(s => s.entryPrice > 0)
    .map(s => ({ ticker: s.ticker, pct: (s.cmp - s.entryPrice) / s.entryPrice * 100 }))
    .sort((a, b) => b.pct - a.pct);
  const best  = performers[0];
  const worst = performers[performers.length - 1];

  // Sector allocation
  const sectorMap = new Map<string, number>();
  activePos.forEach(s => {
    const sec = s.sector ?? "Other";
    sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + calcInvestedValue(s));
  });
  const sectorTotal = invested > 0 ? activePos.reduce((s, x) => s + calcInvestedValue(x), 0) : 1;
  const sectors = [...sectorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, val]) => ({ name, val, pct: val / sectorTotal * 100 }));

  const SECTOR_COLORS = ["#1c3557","#2a5f9e","#3b82c4","#6aa8dc","#9ac5e8","#c0d9f0"];

  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // Page title per tab
  const PAGE_TITLES: Record<ActiveTab, string> = {
    overview: "Dashboard", holdings: "Portfolio Holdings", trades: "Trades & F&O",
    watchlist: "Watchlist", ai: "AI Insights", charts: "Charts & Analytics",
    analytics: "Trade Analytics", history: "Trade History", journal: "Trade Journal",
    sector: "Sector Allocation", alerts: "Price Alerts", export: "Export Data",
    news: "Holdings News Feed",
  };

  // ── Auth gate ─────────────────────────────────────────────────────────────
  // Loading state
  if (_authLoading) return (
    <div style={{ height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f4f6f9", fontFamily:"DM Sans, sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:40, height:40, border:"3px solid #e5e7eb", borderTop:"3px solid #1c3557", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
        <div style={{ fontSize:13, color:"#6b7280" }}>Loading…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // Not logged in — show landing / intro page
  if (!user) return (
    <>
      <style>{CSS}</style>
      <style>{`
        .lp { min-height:100vh; background:#f4f6f9; font-family:'DM Sans',-apple-system,sans-serif; display:flex; flex-direction:column; }
        .lp-nav { background:#fff; border-bottom:1px solid #e5e7eb; padding:0 40px; height:64px; display:flex; align-items:center; justify-content:space-between; }
        .lp-brand { display:flex; align-items:center; gap:10px; }
        .lp-logo { width:32px; height:32px; background:#1c3557; border-radius:9px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(28,53,87,.3); }
        .lp-name { font-size:18px; font-weight:700; color:#1c3557; letter-spacing:-.3px; }
        .lp-signin-btn { background:#1c3557; color:white; border:none; padding:9px 22px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; transition:background .15s; }
        .lp-signin-btn:hover { background:#224168; }
        .lp-hero { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 24px; text-align:center; }
        .lp-hero-badge { display:inline-flex; align-items:center; gap:6px; background:#eef4fc; color:#1c3557; border:1px solid #ddeaf8; border-radius:20px; padding:5px 14px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin-bottom:24px; }
        .lp-hero-dot { width:6px; height:6px; border-radius:50%; background:#059669; }
        .lp-h1 { font-size:clamp(32px,5vw,56px); font-weight:800; color:#111827; line-height:1.1; letter-spacing:-1.5px; max-width:700px; margin-bottom:18px; }
        .lp-h1 span { color:#1c3557; }
        .lp-sub { font-size:17px; color:#6b7280; max-width:520px; line-height:1.6; margin-bottom:36px; }
        .lp-cta-row { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
        .lp-cta-primary { background:#1c3557; color:white; border:none; padding:13px 32px; border-radius:10px; font-size:14px; font-weight:700; cursor:pointer; font-family:inherit; transition:all .15s; box-shadow:0 4px 14px rgba(28,53,87,.3); }
        .lp-cta-primary:hover { background:#224168; transform:translateY(-1px); box-shadow:0 6px 20px rgba(28,53,87,.35); }
        .lp-cta-ghost { background:transparent; color:#1c3557; border:1.5px solid #ddeaf8; padding:13px 32px; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; font-family:inherit; transition:all .15s; }
        .lp-cta-ghost:hover { background:#eef4fc; border-color:#1c3557; }
        .lp-features { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; max-width:860px; width:100%; margin-top:64px; }
        .lp-feat { background:#fff; border:1px solid #f0f2f5; border-radius:14px; padding:26px 22px; text-align:left; box-shadow:0 1px 3px rgba(0,0,0,.06); }
        .lp-feat-icon { width:40px; height:40px; border-radius:10px; background:#eef4fc; border:1px solid #ddeaf8; display:flex; align-items:center; justify-content:center; margin-bottom:14px; font-size:20px; }
        .lp-feat-title { font-size:14px; font-weight:700; color:#111827; margin-bottom:6px; }
        .lp-feat-desc { font-size:12.5px; color:#6b7280; line-height:1.6; }
        .lp-stats { display:flex; gap:40px; justify-content:center; margin-top:52px; flex-wrap:wrap; }
        .lp-stat { text-align:center; }
        .lp-stat-val { font-size:28px; font-weight:800; color:#1c3557; letter-spacing:-1px; }
        .lp-stat-lbl { font-size:11px; color:#9ca3af; font-weight:600; text-transform:uppercase; letter-spacing:.08em; margin-top:3px; }
        @media(max-width:640px){ .lp-features{grid-template-columns:1fr;} .lp-h1{font-size:32px;} }
      `}</style>
      <div className="lp">
        <nav className="lp-nav">
          <div className="lp-brand">
            <div className="lp-logo">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 13L5.5 4.5L10 9L12 6.5L14 13H2Z" fill="white" />
              </svg>
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
          <div className="lp-stats">
            {[
              { val:"5-Tier", lbl:"Price Fallback" },
              { val:"Real-time", lbl:"NSE/BSE Data" },
              { val:"AI-Powered", lbl:"Trade Analysis" },
              { val:"100%", lbl:"Private & Secure" },
            ].map(s => (
              <div key={s.lbl} className="lp-stat">
                <div className="lp-stat-val">{s.val}</div>
                <div className="lp-stat-lbl">{s.lbl}</div>
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

          {/* Collapse toggle */}
          <button className="zf-collapse-btn" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>

          {/* Brand */}
          <div className="zf-brand">
            <div className="zf-logo">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 13L5.5 4.5L10 9L12 6.5L14 13H2Z" fill="white" />
              </svg>
            </div>
            <div className="zf-brand-text">
              <div className="zf-brand-name">ZenFolio</div>
              <div className="zf-brand-sub">Portfolio Tracker</div>
            </div>
          </div>

          {/* Nav */}
          <div className="zf-nav-scroll">
            {NAV_GROUPS.map(grp => (
              <div key={grp.label}>
                <div className="zf-nav-grp">{grp.label}</div>
                {grp.items.map(({ id, label, icon: Icon }) => (
                  <div
                    key={id}
                    className={`zf-nav-item${tab === id ? " active" : ""}`}
                    onClick={() => setTab(id as ActiveTab)}
                    title={collapsed ? label : undefined}
                  >
                    <Icon strokeWidth={tab === id ? 2.2 : 1.8} size={15} />
                    <span className="zf-nav-label">{label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="zf-sidebar-foot">
            <div className="zf-user-row" title={collapsed ? (user?.email ?? "Guest") : undefined}>
              <div className="zf-user-avatar">
                {(user?.email?.[0] ?? "G").toUpperCase()}
              </div>
              <div className="zf-user-info">
                <div className="zf-user-name">{user?.email?.split("@")[0] ?? "Guest"}</div>
                <div className="zf-user-role">Trader</div>
              </div>
            </div>
          </div>
        </aside>

        {/* ══════════ MAIN ══════════ */}
        <div className="zf-main">

          {/* Header */}
          <header className="zf-header">
            <div className="zf-page-title">{PAGE_TITLES[tab]}</div>

            {/* Search */}
            <div className="zf-search">
              <Search size={13} color="var(--tx-300)" />
              <input
                placeholder="Search stocks…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
              />
            </div>

            {/* NSE status */}
            <div className={`zf-live${!isLive ? " cached" : ""}`}>
              <div className="zf-ldot" />
              NSE {isLive ? "Live" : "Cached"} · {now}
            </div>

            {/* Refresh */}
            <button className="zf-hbtn" onClick={refresh} title="Refresh prices">
              <RefreshCw size={14} className={!isLive ? "zf-spin" : ""} />
            </button>

            {/* Dark mode toggle */}
            <button className="zf-hbtn" onClick={() => setDarkMode(d => !d)}
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
              {darkMode ? <span style={{ fontSize:15 }}>☀️</span> : <span style={{ fontSize:15 }}>🌙</span>}
            </button>

            {/* User menu */}
            <div style={{ position: "relative" }} ref={uMenuRef}>
              <button className="zf-hbtn" onClick={() => setUMenu(p => !p)}>
                <Settings size={14} />
              </button>
              {uMenu && (
                <div className="zf-umenu">
                  <div className="zf-umenu-head">
                    <div className="zf-umenu-lbl">Signed in as</div>
                    <div className="zf-umenu-email">{user?.email ?? "Not signed in"}</div>
                  </div>
                  {user ? (
                    <button className="zf-umenu-btn danger" onClick={() => { signOut(); setUMenu(false); }}>
                      <LogOut size={13} /> Sign out
                    </button>
                  ) : (
                    <button className="zf-umenu-btn primary" onClick={() => { setShowAuth(true); setUMenu(false); }}>
                      <LogOut size={13} /> Sign in
                    </button>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Greeting bar — overview only */}
          {tab === "overview" && (
            <div className="zf-greeting" style={{ animation:"zf-fadein .4s cubic-bezier(.22,1,.36,1) both" }}>
              <div>
                <div className="zf-greeting-name">{getGreeting()}, {user?.email?.split("@")[0] ?? "Trader"} 👋</div>
                <p style={{ fontSize:13, color:"var(--tx-500)", marginTop:4, fontWeight:500 }}>
                  Your portfolio is{" "}
                  <span style={{ color: pnl>=0 ? "var(--green)" : "var(--red)", fontWeight:700 }}>
                    {pnl >= 0 ? "up" : "down"} {sign(pnl)}{Math.abs(pnlPct).toFixed(1)}%
                  </span>
                  {" "}since your last entry.
                </p>
              </div>
              <div className="zf-greeting-right">
                <div className="zf-greeting-pill">
                  <span style={{ width:7, height:7, borderRadius:"50%", background:isLive?"var(--green)":"var(--amber)", display:"inline-block" }} />
                  NSE {isLive ? "Live" : "Cached"} · {now}
                </div>
                {activePos.length > 0 && (
                  <div className="zf-greeting-pill" style={{ color: pnl>=0?"var(--green)":"var(--red)", borderColor: pnl>=0?"var(--green-bd)":"var(--red-bd)" }}>
                    {pnl >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {sign(pnl)}{fmt(Math.abs(pnl))} unrealised
                  </div>
                )}
                <div className="zf-greeting-pill" onClick={refresh} style={{ cursor:"pointer" }}>
                  <RefreshCw size={12} /> Refresh
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="zf-content">

            {/* ══════════ OVERVIEW — Stitch "Digital Ledger" layout ══════════ */}
            {tab === "overview" && (<>

              {/* ── ROW 1: 4 KPI stat cards — Stitch style with staggered animation ── */}
              <div className="zf-kpi-row">

                {/* Card 1 — Total Invested */}
                <div className="zf-kpi zf-anim-1">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
                    <div className="zf-kpi-icon" style={{ background:"rgba(163,166,255,.1)", marginBottom:0 }}>
                      <Wallet size={18} color="var(--navy)" />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:800, color:"var(--tx-400)", textTransform:"uppercase", letterSpacing:".15em" }}>Invested</span>
                  </div>
                  <div className="zf-kpi-lbl">Total Invested</div>
                  <div className="zf-kpi-val">{fmt(invested)}</div>
                  <div className="zf-kpi-sub">{closedPos.length} closed · {live.length} total assets</div>
                </div>

                {/* Card 2 — Portfolio Value (highlighted) */}
                <div className="zf-kpi zf-anim-2" style={{ borderBottom:"2px solid rgba(163,166,255,.25)" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
                    <div className="zf-kpi-icon" style={{ background:"rgba(163,166,255,.1)", marginBottom:0 }}>
                      <TrendingUp size={18} color="var(--navy)" />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:800, color:"var(--navy)", textTransform:"uppercase", letterSpacing:".15em" }}>Net Worth</span>
                  </div>
                  <div className="zf-kpi-lbl">Portfolio Value</div>
                  <div className="zf-kpi-val">{fmt(current)}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:6 }}>
                    {pnl >= 0
                      ? <TrendingUp size={12} color="var(--green)" />
                      : <TrendingDown size={12} color="var(--red)" />}
                    <span style={{ fontSize:11, fontWeight:700, color:pnl>=0?"var(--green)":"var(--red)" }}>
                      {sign(pnl)}{fmt(Math.abs(pnl))} ({sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Card 3 — Today's P&L */}
                <div className="zf-kpi zf-anim-3">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
                    <div className="zf-kpi-icon" style={{ background:todayPnl>=0?"var(--green-bg)":"var(--red-bg)", marginBottom:0 }}>
                      <Zap size={18} color={todayPnl>=0?"var(--green)":"var(--red)"} />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:800, color:"var(--tx-400)", textTransform:"uppercase", letterSpacing:".15em" }}>Live P&L</span>
                  </div>
                  <div className="zf-kpi-lbl">Today's P&L</div>
                  <div className="zf-kpi-val" style={{ color:todayPnl>=0?"var(--green)":"var(--red)" }}>
                    {sign(todayPnl)}{fmt(Math.abs(todayPnl))}
                  </div>
                  <div className="zf-kpi-sub" style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em", marginTop:8 }}>
                    {isLive ? "🟢" : "🟡"} Last update: {now} IST
                  </div>
                </div>

                {/* Card 4 — Win Rate */}
                <div className="zf-kpi zf-anim-4">
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
                    <div className="zf-kpi-icon" style={{ background:"rgba(255,113,106,.1)", marginBottom:0 }}>
                      <Award size={18} color="var(--red)" />
                    </div>
                    <span style={{ fontSize:"9px", fontWeight:800, color:"var(--tx-400)", textTransform:"uppercase", letterSpacing:".15em" }}>Win Rate</span>
                  </div>
                  <div className="zf-kpi-lbl">Win Rate</div>
                  <div className="zf-kpi-val" style={{ color:winRate>=50?"var(--green)":winRate>0?"var(--amber)":"var(--tx-400)" }}>
                    {winRate.toFixed(0)}%
                  </div>
                  <div className="zf-kpi-sub">
                    Realized: <span style={{ color:"var(--green)", fontWeight:700 }}>{sign(totalRealised)}{fmt(Math.abs(totalRealised))}</span>
                  </div>
                </div>
              </div>

              {/* ── ROW 2: Performance Chart + Sector Allocation ── */}
              <div className="zf-mid-row zf-anim-5">

                {/* Performance Matrix */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <div>
                      <span className="zf-card-title">Performance Matrix</span>
                      <div style={{ display:"flex", gap:18, marginTop:6 }}>
                        {(["Portfolio Value","Invested Amount","P&L Trends"] as const).map((label, i) => (
                          <button key={label} style={{
                            fontSize:11.5, fontWeight: i===0 ? 700 : 500,
                            color: i===0 ? "var(--navy)" : "var(--tx-400)",
                            background:"none", border:"none", cursor:"pointer", padding:"0 0 4px",
                            fontFamily:"var(--ff-body)",
                            borderBottom: i===0 ? "2px solid var(--navy)" : "2px solid transparent",
                            transition:"all .2s ease",
                          }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", background:"var(--bg-app)", padding:"4px", borderRadius:8, gap:2 }}>
                      {(["1Y","2Y","ALL"] as const).map((r,i) => (
                        <button key={r} style={{
                          padding:"4px 10px", fontSize:10, fontWeight:800,
                          background: i===0 ? "var(--bg-surface)" : "transparent",
                          color: i===0 ? "var(--tx-900)" : "var(--tx-400)",
                          border:"none", borderRadius:6, cursor:"pointer", fontFamily:"var(--ff-body)",
                          transition:"all .15s ease",
                        }}>{r}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:"8px 20px 16px", position:"relative" }}>
                    {/* Floating price callout */}
                    <div style={{
                      position:"absolute", top:12, right:32, zIndex:3,
                      background:"rgba(27,32,39,.9)", backdropFilter:"blur(8px)",
                      border:"1px solid rgba(255,255,255,.08)",
                      padding:"6px 12px", borderRadius:8,
                      fontSize:10, fontWeight:700, color:"var(--tx-700)",
                      display:"flex", alignItems:"center", gap:6,
                    }}>
                      {fmt(current)}
                      <span style={{ color:"var(--green)", fontWeight:800 }}>
                        {sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%
                      </span>
                    </div>
                    <LineChartWidget stocks={live} />
                  </div>
                </div>

                {/* Sector Weightage */}
                <div className="zf-card zf-sector-side">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Sector Weightage</span>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"20px 22px 16px" }}>
                    <DonutWidget stocks={live} />
                  </div>
                  <div className="zf-sector-list">
                    {sectors.slice(0,5).map((s, i) => {
                      const clrs = ["var(--navy)","var(--green)","var(--red)","var(--amber)","#a78bfa"];
                      return (
                        <div key={s.name} className="zf-sector-item">
                          <div className="zf-sector-row">
                            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                              <div style={{ width:7, height:7, borderRadius:"50%", background:clrs[i], flexShrink:0 }} />
                              <span className="zf-sector-name">{s.name}</span>
                            </div>
                            <span className="zf-sector-pct">{s.pct.toFixed(0)}%</span>
                          </div>
                          <div className="zf-sector-bar">
                            <div className="zf-sector-fill" style={{ width:`${s.pct}%`, background:clrs[i] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── ROW 3: Current Holdings + Watchlist ── */}
              <div className="zf-bot-row zf-anim-6">

                {/* Holdings Table */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Current Holdings</span>
                    <button className="zf-card-link" onClick={() => setTab("holdings")}>View all</button>
                  </div>
                  <div className="zf-card-body">
                    <div className="zf-tbl-head">
                      <span className="zf-th">Asset Name</span>
                      <span className="zf-th r">Qty</span>
                      <span className="zf-th r">Avg Price</span>
                      <span className="zf-th r">LTP</span>
                      <span className="zf-th r">P&L</span>
                    </div>
                    {activePos.length === 0 ? (
                      <div style={{ padding:"40px 22px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>
                        No active holdings. <button onClick={() => setTab("holdings")} style={{ color:"var(--navy)", background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Add one →</button>
                      </div>
                    ) : activePos.slice(0, 5).map((s, si) => {
                      const pl    = s.entryPrice > 0 ? (s.cmp - s.entryPrice) / s.entryPrice * 100 : 0;
                      const plAmt = (s.cmp - s.entryPrice) * s.quantity;
                      const pos   = pl >= 0;
                      const initials = s.ticker.slice(0, 4);
                      return (
                        <div key={s.ticker} className="zf-trow" style={{ animationDelay:`${si * 0.04}s` }}
                          onClick={() => setTab("holdings")} style={{ cursor:"pointer" }}>
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
                            <div className="zf-pl-sub" style={{ color:pos?"var(--green)":"var(--red)", opacity:.7 }}>
                              {sign(pl)}{Math.abs(pl).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Watchlist Panel */}
                <div className="zf-card" style={{ display:"flex", flexDirection:"column" }}>
                  <div className="zf-card-head">
                    <span className="zf-card-title">Watchlist</span>
                    <button style={{
                      width:30, height:30, borderRadius:"50%",
                      background:"var(--navy-50)", border:"1px solid var(--navy-100)",
                      color:"var(--navy)", display:"flex", alignItems:"center", justifyContent:"center",
                      cursor:"pointer", fontSize:18, fontWeight:300, transition:"all .2s ease",
                    }}
                    onClick={() => setTab("watchlist")}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="var(--navy)"; (e.currentTarget as HTMLElement).style.color="#0f00a4"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="var(--navy-50)"; (e.currentTarget as HTMLElement).style.color="var(--navy)"; }}>
                      +
                    </button>
                  </div>
                  <div className="zf-card-body" style={{ flex:1 }}>
                    {watchlist.length === 0 ? (
                      <div style={{ padding:"32px 22px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>
                        No watchlist stocks yet
                      </div>
                    ) : watchlist.slice(0, 4).map((w, wi) => {
                      const cmp = w.cmp ?? 0;
                      const pos = cmp >= (w.entryZoneLow ?? cmp);
                      const seed = w.stockName.charCodeAt(0) + wi * 7;
                      return (
                        <div key={w.stockName} className="zf-wl-row"
                          style={{ transition:"all .2s cubic-bezier(.22,1,.36,1)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                            <div style={{
                              width:38, height:38, borderRadius:10,
                              background:"var(--bg-surface)", border:"1px solid var(--bd-50)",
                              display:"flex", alignItems:"center", justifyContent:"center",
                              fontSize:10, fontWeight:900, color:"var(--tx-500)", flexShrink:0,
                            }}>
                              {w.stockName.slice(0,3).toUpperCase()}
                            </div>
                            <div>
                              <div className="zf-wl-name">{w.stockName}</div>
                              <div className="zf-wl-sub">{w.sector ?? "NSE"}</div>
                            </div>
                          </div>
                          <svg className="zf-wl-spark" viewBox="0 0 56 26" fill="none">
                            <polyline points={Array.from({length:8},(_,i)=>{
                              const x=4+i*7; const y=13+Math.sin((i+seed)*1.1)*8*(pos?1:-1);
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

                    {/* AI Insight Teaser — from Stitch design */}
                    <div className="zf-ai-teaser" onClick={() => setTab("ai")}
                      style={{ marginTop: watchlist.length > 0 ? 0 : 8 }}>
                      <div style={{ position:"relative", zIndex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:8 }}>
                          <span style={{ fontSize:13 }}>✨</span>
                          <span style={{ fontSize:9.5, fontWeight:900, color:"#ffffff", textTransform:"uppercase", letterSpacing:".2em" }}>AI Opportunity</span>
                        </div>
                        <p style={{ fontSize:11, lineHeight:1.6, color:"var(--tx-500)", marginBottom:12 }}>
                          {activePos.length > 0
                            ? <>Portfolio momentum score for <strong style={{ color:"#ffffff" }}>{best?.ticker ?? activePos[0]?.ticker}</strong> has strengthened based on recent price action. Potential breakout zone detected.</>
                            : <>Add holdings to unlock AI-powered portfolio analysis, sector insights, and trade recommendations.</>
                          }
                        </p>
                        <button style={{
                          fontSize:10.5, fontWeight:700, color:"var(--navy)",
                          background:"none", border:"none", cursor:"pointer",
                          fontFamily:"var(--ff-body)", padding:0, textDecoration:"none",
                        }}>
                          View Deep Dive Analysis →
                        </button>
                      </div>
                      <div className="zf-ai-teaser-bg">🧠</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ROW 3: F&O Positions ── */}
              <div className="zf-card zf-anim-5" style={{ animationDelay:".36s" }}>
                <div className="zf-card-head">
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span className="zf-card-title">F&O Positions</span>
                    <span className="zf-card-badge">{fnoOpen.length} open</span>
                    {fnoClosed.length > 0 && <span style={{ fontSize:11, color:"var(--tx-400)" }}>· {fnoClosed.length} closed</span>}
                  </div>
                  <div className="zf-card-meta">
                    <button className="zf-card-link" onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}>
                      {fnoOpen.length > 0 ? "Manage F&O →" : "+ Add F&O Trade"}
                    </button>
                  </div>
                </div>
                {/* Always-visible KPI strip */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderBottom:"1px solid var(--bd-50)" }}>
                  {([
                    { lbl:"Open Positions", val:String(fnoOpen.length), sub:`Premium: ${fmt(fnoInvested)}`, clr:"var(--navy)" },
                    { lbl:"Unrealised P&L", val:`${sign(fnoUnrealised)}${fmt(Math.abs(fnoUnrealised))}`, sub:`${fnoOpen.length} position${fnoOpen.length!==1?"s":""}`, clr:fnoUnrealised>=0?"var(--green)":"var(--red)" },
                    { lbl:"Realised P&L",   val:`${sign(fnoRealised)}${fmt(Math.abs(fnoRealised))}`, sub:`${fnoClosed.length} closed`, clr:fnoRealised>=0?"var(--green)":"var(--red)" },
                    { lbl:"Win Rate",       val:fnoClosed.length>0?`${Math.round(fnoClosed.filter(t=>calcFnOPnL(t)>0).length/fnoClosed.length*100)}%`:"—", sub:`${fnoClosed.filter(t=>calcFnOPnL(t)>0).length}/${fnoClosed.length} profitable`, clr:"var(--amber)" },
                  ] as const).map((m,i) => (
                    <div key={m.lbl} style={{ padding:"14px 20px", borderRight:i<3?"1px solid var(--bd-100)":"none" }}>
                      <div style={{ fontSize:9.5, fontWeight:700, textTransform:"uppercase", letterSpacing:".09em", color:"var(--tx-300)", marginBottom:5 }}>{m.lbl}</div>
                      <div style={{ fontFamily:"var(--ff-mono)", fontSize:20, fontWeight:700, color:m.clr, letterSpacing:"-.5px" }}>{m.val}</div>
                      <div style={{ fontSize:10.5, color:"var(--tx-400)", marginTop:3 }}>{m.sub}</div>
                    </div>
                  ))}
                </div>
                {/* Table or CTA */}
                {fnoOpen.length === 0 ? (
                  <div style={{ padding:"22px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--tx-700)", marginBottom:3 }}>No open F&O positions</div>
                      <div style={{ fontSize:12, color:"var(--tx-300)" }}>
                        Go to{" "}
                        <button onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                          style={{ background:"none", border:"none", color:"var(--navy)", fontSize:12, fontWeight:700, cursor:"pointer", padding:0 }}>
                          Trades → F&O
                        </button>
                        {" "}to add futures or options.
                      </div>
                    </div>
                    <button onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                      style={{ background:"var(--navy)", color:"#fff", border:"none", padding:"8px 18px", borderRadius:9, fontSize:12.5, fontWeight:600, cursor:"pointer", fontFamily:"var(--ff-body)", flexShrink:0 }}>
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
                              padding:"10px 14px", fontSize:"9.5px", fontWeight:700,
                              textTransform:"uppercase", letterSpacing:".09em", color:"var(--tx-300)",
                              background:"var(--bg-surface)", borderBottom:"1.5px solid var(--bd-200)",
                              textAlign: (["Entry","LTP","P&L"] as string[]).includes(h) ? "right" : (["Type","Status"] as string[]).includes(h) ? "center" : "left",
                              whiteSpace:"nowrap",
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fnoOpen.map(t => {
                          const ltp = t.ltp ?? t.entryPrice;
                          const pnl = t.instrumentType === "PE" ? (t.entryPrice-ltp)*t.lots*t.lotSize : (ltp-t.entryPrice)*t.lots*t.lotSize;
                          const pct = t.entryPrice > 0 ? pnl/(t.entryPrice*t.lots*t.lotSize)*100 : 0;
                          const pos = pnl >= 0;
                          const tcMap: Record<string,{bg:string;color:string;bd:string}> = {
                            CE:  { bg:"var(--green-bg)", color:"var(--green)", bd:"var(--green-bd)" },
                            PE:  { bg:"var(--red-bg)",   color:"var(--red)",   bd:"var(--red-bd)"   },
                            FUT: { bg:"var(--navy-50)",  color:"var(--navy)",  bd:"var(--navy-100)" },
                          };
                          const tc = tcMap[t.instrumentType] ?? tcMap["FUT"];
                          const ep = t.expiry.split("-");
                          const mo = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                          const ed = ep.length===3 ? `${parseInt(ep[0])} ${mo[parseInt(ep[1])]} ’${ep[2].slice(-2)}` : t.expiry;
                          return (
                            <tr key={t.id} style={{ cursor:"pointer", transition:"background .12s" }}
                              onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="var(--bg-hover)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background=""}>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)" }}>
                                <div style={{ fontSize:13, fontWeight:700, color:"var(--tx-900)" }}>{t.symbol}</div>
                                {t.notes && <div style={{ fontSize:10, color:"var(--tx-400)", marginTop:1, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes}</div>}
                              </td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"center" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:5, background:tc.bg, color:tc.color, border:`1px solid ${tc.bd}` }}>{t.instrumentType}</span>
                              </td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>{t.strike ? `₹${t.strike.toLocaleString("en-IN")}` : "—"}</td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontSize:12, fontWeight:600, color:"var(--tx-700)", whiteSpace:"nowrap" }}>{ed}</td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>{t.lots} × {t.lotSize.toLocaleString("en-IN")}</td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)", textAlign:"right" }}>₹{t.entryPrice.toFixed(2)}</td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"right" }}>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:12, fontWeight:600, color:"var(--navy)", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4 }}>
                                  {t.ltp && <span style={{ width:5, height:5, borderRadius:"50%", background:"var(--green)", display:"inline-block" }} />}
                                  ₹{ltp.toFixed(2)}
                                </div>
                              </td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"right" }}>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:12.5, fontWeight:700, color:pos?"var(--green)":"var(--red)" }}>{sign(pnl)}{fmt(Math.abs(pnl))}</div>
                                <div style={{ fontFamily:"var(--ff-mono)", fontSize:10, color:pos?"var(--green)":"var(--red)" }}>{sign(pct)}{Math.abs(pct).toFixed(1)}%</div>
                              </td>
                              <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"center" }}>
                                <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10.5, fontWeight:700, padding:"3px 10px", borderRadius:20, background:"var(--navy-50)", color:"var(--navy)", border:"1px solid var(--navy-100)" }}>Open</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── ROW 4: Charts moved to bottom ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:18, animationDelay:".42s" }} className="zf-anim-6">

                {/* Large line chart */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <div>
                      <span className="zf-card-title">Portfolio Performance</span>
                      <div style={{ display:"flex", gap:16, marginTop:4 }}>
                        {(["Portfolio Value","Invested","P&L"] as const).map((label, i) => (
                          <button key={label} style={{
                            fontSize:11, fontWeight: i===0 ? 700 : 400,
                            color: i===0 ? "var(--navy)" : "var(--tx-300)",
                            background:"none", border:"none", cursor:"pointer", padding:0,
                            fontFamily:"var(--ff-body)",
                          }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--tx-400)" }}>
                        <span style={{ width:16, height:3, borderRadius:2, background:"var(--navy)", display:"inline-block" }} />
                        This year
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--tx-400)" }}>
                        <span style={{ width:16, height:3, borderRadius:2, background:"var(--tx-200)", display:"inline-block" }} />
                        Last year
                      </div>
                      <button className="zf-card-link" onClick={() => setTab("charts")}>Full view →</button>
                    </div>
                  </div>
                  <div style={{ padding:"8px 20px 16px" }}>
                    <LineChartWidget stocks={live} />
                  </div>
                </div>

                {/* Right: donut + bar */}
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  <div className="zf-card" style={{ flex:1 }}>
                    <div className="zf-card-head"><span className="zf-card-title">Sector Allocation</span></div>
                    <div style={{ padding:"14px 20px" }}><DonutWidget stocks={live} /></div>
                  </div>
                  <div className="zf-card" style={{ flex:1 }}>
                    <div className="zf-card-head">
                      <span className="zf-card-title">Holdings Value</span>
                      <span className="zf-card-badge">{activePos.length} stocks</span>
                    </div>
                    <div style={{ padding:"14px 20px" }}><BarWidget stocks={live} /></div>
                  </div>
                </div>
              </div>

            </>)}

            {/* ══════════ OTHER TABS ══════════ */}
            {tab !== "overview" && (
              <div className="zf-tab-panel" style={{ flex: 1, minHeight: "calc(100vh - 140px)" }}>
                {/* Holdings = active positions only */}
                {tab === "holdings"  && <PortfolioTable stocks={live.filter(s => s.status === "Active")} onUpdate={setStocks} />}

                {/* Trades = sub-tabbed: Equity | F&O */}
                {tab === "trades" && (
                  <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--bg-card)" }}>
                    {/* Sub-tab bar */}
                    <div style={{ display:"flex", alignItems:"center", gap:2, padding:"14px 20px 0", borderBottom:"1.5px solid var(--bd-100)", background:"var(--bg-surface)", flexShrink:0 }}>
                      {([
                        { id:"equity", label:"Equity Trades", count: live.length },
                        { id:"fno",    label:"F&O Positions", count: fnoTrades.length },
                      ] as const).map(st => (
                        <button key={st.id}
                          onClick={() => setTradesSubTab(st.id)}
                          style={{
                            fontSize:13, fontWeight: tradesSubTab === st.id ? 700 : 500,
                            color: tradesSubTab === st.id ? "var(--navy)" : "var(--tx-400)",
                            padding:"9px 18px 10px", borderRadius:"8px 8px 0 0",
                            border: tradesSubTab === st.id ? "1px solid var(--bd-100)" : "1px solid transparent",
                            borderBottom: tradesSubTab === st.id ? "1.5px solid var(--bg-card)" : "1px solid transparent",
                            background: tradesSubTab === st.id ? "var(--bg-card)" : "transparent",
                            cursor:"pointer", fontFamily:"inherit", position:"relative", bottom:"-1.5px",
                            display:"flex", alignItems:"center", gap:7, transition:"all .14s",
                          }}>
                          {st.label}
                          <span style={{
                            display:"inline-flex", alignItems:"center", justifyContent:"center",
                            width:18, height:18, borderRadius:"50%", fontSize:9, fontWeight:700,
                            background: tradesSubTab === st.id ? "#eef4fc" : "#f0f2f5",
                            color: tradesSubTab === st.id ? "#1c3557" : "#9ca3af",
                          }}>{st.count}</span>
                          {st.id === "fno" && (
                            <span style={{
                              fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4,
                              background:"#eef4fc", color:"#1c3557", border:"1px solid #ddeaf8",
                              letterSpacing:".04em",
                            }}>NEW</span>
                          )}
                        </button>
                      ))}
                    </div>
                    {/* Sub-tab content */}
                    <div style={{ flex:1, overflow:"auto", minHeight:0 }}>
                      {tradesSubTab === "equity" && <TradeStrategyTable trades={trades} onUpdate={setTrades} stocks={live} />}
                      {tradesSubTab === "fno"    && <FnOTable trades={fnoTrades} onUpdate={setFnoTrades} />}
                    </div>
                  </div>
                )}
                {tab === "watchlist" && <WatchlistTable watchlist={watchlist} onUpdate={setWatchlist} />}
                {tab === "news"      && <StockNewsFeed stocks={live} />}
                {tab === "charts"    && <PortfolioCharts stocks={live} />}
                {tab === "analytics" && <TradeAnalytics stocks={live} />}
                {tab === "history"   && <TradeHistory stocks={live} />}
                {tab === "journal"   && <TradeJournal entries={journal} onUpdate={setJournal} />}
                {tab === "sector"    && <SectorDiversification stocks={live} />}
                {tab === "alerts"    && <PriceAlerts alerts={alerts} onUpdate={setAlerts} stocks={live} />}
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