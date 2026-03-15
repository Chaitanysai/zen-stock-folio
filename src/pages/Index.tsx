import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, TrendingUp, ScrollText, Eye,
  Brain, History, BarChart3, Bell, RefreshCw,
  LogOut, Settings, PieChart, Zap, ChevronLeft,
  ChevronRight, Search, TrendingDown,
  Activity, Wallet, Award
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
  | "sector" | "alerts" | "export";

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

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500;600&display=swap');

/* ══════════════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════════════ */
.zf {
  /* Backgrounds — pure white like reference */
  --bg-app:       #f4f6f9;
  --bg-sidebar:   #ffffff;
  --bg-card:      #ffffff;
  --bg-surface:   #f8f9fc;
  --bg-hover:     #f0f4f8;
  --bg-input:     #f8f9fc;

  /* Navy brand */
  --navy:         #1c3557;
  --navy-700:     #224168;
  --navy-600:     #2a5080;
  --navy-100:     #ddeaf8;
  --navy-50:      #eef4fc;

  /* Text */
  --tx-900:       #111827;
  --tx-700:       #1f2d3d;
  --tx-500:       #4b5563;
  --tx-400:       #6b7280;
  --tx-300:       #9ca3af;
  --tx-200:       #d1d5db;

  /* Borders — clean grey like reference */
  --bd-200:       #e5e7eb;
  --bd-100:       #f0f2f5;
  --bd-50:        #f9fafb;

  /* Semantic */
  --green:        #059669;
  --green-bg:     #ecfdf5;
  --green-bd:     #a7f3d0;
  --red:          #dc2626;
  --red-bg:       #fef2f2;
  --red-bd:       #fecaca;
  --amber:        #d97706;
  --amber-bg:     #fffbeb;
  --amber-bd:     #fcd34d;

  /* Shadows — crisp like reference */
  --sh-1: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --sh-2: 0 4px 12px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.04);
  --sh-3: 0 8px 24px rgba(0,0,0,.10), 0 3px 8px rgba(0,0,0,.05);

  /* Typography */
  --ff-body: 'DM Sans', -apple-system, sans-serif;
  --ff-disp: 'DM Serif Display', Georgia, serif;
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
   SIDEBAR  — like DashStack reference
══════════════════════════════════════════════════ */
.zf-sidebar {
  width: 220px;
  min-width: 220px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--bd-200);
  height: 100vh;
  display: flex;
  flex-direction: column;
  transition: width .2s ease, min-width .2s ease;
  overflow: hidden;
  box-shadow: 2px 0 8px rgba(28,53,87,.05);
  z-index: 30;
}
.zf-sidebar.collapsed {
  width: 64px;
  min-width: 64px;
}

/* Brand row */
.zf-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--bd-100);
  flex-shrink: 0;
  min-height: 64px;
}
.zf-logo {
  width: 32px; height: 32px;
  border-radius: 9px;
  background: var(--navy);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(28,53,87,.3);
}
.zf-brand-text { overflow: hidden; white-space: nowrap; }
.zf-brand-name {
  font-family: var(--ff-disp);
  font-size: 17px;
  color: var(--navy);
  line-height: 1.1;
  letter-spacing: -.2px;
}
.zf-brand-sub {
  font-size: 10px;
  color: var(--tx-400);
  font-weight: 500;
  letter-spacing: .02em;
  margin-top: 1px;
}

/* Collapse toggle */
.zf-collapse-btn {
  position: absolute;
  right: -12px;
  top: 70px;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 1px solid var(--bd-200);
  box-shadow: var(--sh-1);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  z-index: 40;
  color: var(--tx-400);
  transition: all .15s;
}
.zf-collapse-btn:hover { background: var(--navy-100); color: var(--navy); }

/* Nav scroll area */
.zf-nav-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 8px;
}
.zf-nav-scroll::-webkit-scrollbar { width: 3px; }
.zf-nav-scroll::-webkit-scrollbar-thumb { background: var(--bd-200); border-radius: 3px; }

/* Group label */
.zf-nav-grp {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: var(--tx-300);
  padding: 12px 10px 4px;
  white-space: nowrap;
  overflow: hidden;
}
.zf-sidebar.collapsed .zf-nav-grp { opacity: 0; height: 0; padding: 0; margin: 0; }

/* Nav item */
.zf-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 400;
  color: var(--tx-500);
  cursor: pointer;
  transition: all .14s ease;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  border: 1px solid transparent;
  margin-bottom: 1px;
}
.zf-nav-item svg { width: 15px; height: 15px; flex-shrink: 0; }
.zf-nav-item:hover {
  background: var(--bg-hover);
  color: var(--tx-700);
}
.zf-nav-item.active {
  background: var(--navy-50);
  color: var(--navy);
  font-weight: 600;
  border-color: var(--navy-100);
}
.zf-nav-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 20%; bottom: 20%;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: var(--navy);
}
.zf-sidebar.collapsed .zf-nav-item {
  justify-content: center;
  padding: 10px;
  gap: 0;
}
.zf-sidebar.collapsed .zf-nav-item span { display: none; }
.zf-sidebar.collapsed .zf-nav-item.active::before { display: none; }
.zf-nav-label { overflow: hidden; }

/* Sidebar footer */
.zf-sidebar-foot {
  padding: 12px;
  border-top: 1px solid var(--bd-100);
  flex-shrink: 0;
}
.zf-user-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--bd-100);
  overflow: hidden;
}
.zf-user-avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--navy);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: white;
  flex-shrink: 0;
}
.zf-user-info { overflow: hidden; flex: 1; }
.zf-user-name { font-size: 12px; font-weight: 600; color: var(--tx-700); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zf-user-role { font-size: 10px; color: var(--tx-400); margin-top: 0; }
.zf-sidebar.collapsed .zf-user-info,
.zf-sidebar.collapsed .zf-brand-text { display: none; }

/* ══════════════════════════════════════════════════
   MAIN AREA
══════════════════════════════════════════════════ */
.zf-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  min-width: 0;
}

/* ── Header ── */
.zf-header {
  background: var(--bg-card);
  border-bottom: 1px solid var(--bd-200);
  height: 64px;
  min-height: 64px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(28,53,87,.05);
}

/* Page title in header */
.zf-page-title {
  font-family: var(--ff-disp);
  font-size: 18px;
  color: var(--navy);
  letter-spacing: -.2px;
  flex: 1;
  white-space: nowrap;
}

/* Search bar */
.zf-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--bd-200);
  border-radius: 9px;
  padding: 7px 13px;
  width: 220px;
  transition: all .14s;
}
.zf-search:focus-within {
  border-color: var(--navy);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px rgba(28,53,87,.08);
}
.zf-search input {
  background: none;
  border: none;
  outline: none;
  font-size: 12.5px;
  color: var(--tx-700);
  font-family: var(--ff-body);
  width: 100%;
}
.zf-search input::placeholder { color: var(--tx-300); }

/* Live badge */
.zf-live {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600;
  padding: 5px 12px;
  border-radius: 20px;
  white-space: nowrap;
  background: var(--green-bg);
  border: 1px solid var(--green-bd);
  color: var(--green);
}
.zf-live.cached {
  background: var(--amber-bg);
  border-color: var(--amber-bd);
  color: var(--amber);
}
.zf-ldot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: zf-pulse 2s infinite;
}
@keyframes zf-pulse {
  0%,100% { opacity: 1; }
  50%      { opacity: .45; }
}

/* Icon button */
.zf-hbtn {
  width: 34px; height: 34px;
  border-radius: 9px;
  background: var(--bg-surface);
  border: 1px solid var(--bd-200);
  color: var(--tx-400);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all .13s;
  flex-shrink: 0;
  position: relative;
}
.zf-hbtn:hover { background: var(--navy-50); border-color: var(--navy-100); color: var(--navy); }

/* User menu dropdown */
.zf-umenu {
  position: absolute;
  right: 0; top: calc(100% + 8px);
  background: var(--bg-card);
  border: 1px solid var(--bd-200);
  border-radius: 10px;
  box-shadow: var(--sh-3);
  min-width: 180px;
  z-index: 100;
  overflow: hidden;
}
.zf-umenu-head { padding: 12px 14px; border-bottom: 1px solid var(--bd-100); background: var(--bg-surface); }
.zf-umenu-email { font-size: 12px; font-weight: 600; color: var(--tx-700); }
.zf-umenu-lbl { font-size: 9.5px; color: var(--tx-400); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
.zf-umenu-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 10px 14px;
  font-size: 12px; font-weight: 600;
  cursor: pointer; border: none; background: transparent;
  transition: background .12s; font-family: var(--ff-body);
}
.zf-umenu-btn:hover { background: var(--bg-hover); }
.zf-umenu-btn.danger { color: var(--red); }
.zf-umenu-btn.primary { color: var(--navy); }

/* ── Content scroll area ── */
.zf-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-app);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
}
.zf-content::-webkit-scrollbar { width: 5px; }
.zf-content::-webkit-scrollbar-thumb { background: var(--bd-200); border-radius: 5px; }
.zf-content::-webkit-scrollbar-track { background: transparent; }

/* ══════════════════════════════════════════════════
   KPI STAT CARDS  — 4 across, F-pattern top row
══════════════════════════════════════════════════ */
.zf-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.zf-kpi {
  background: var(--bg-card);
  border: 1px solid var(--bd-100);
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: var(--sh-1);
  display: flex;
  flex-direction: column;
  gap: 0;
  transition: box-shadow .18s, transform .18s;
  position: relative;
  overflow: hidden;
}
.zf-kpi:hover { box-shadow: var(--sh-2); transform: translateY(-1px); }

/* Left accent bar */
.zf-kpi::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  border-radius: 12px 0 0 12px;
  background: var(--navy-100);
}
.zf-kpi.kpi-green::before { background: var(--green-bg); border-left: 4px solid var(--green); left: 0; width: 0; }
.zf-kpi.kpi-red::before   { background: var(--red-bg);   border-left: 4px solid var(--red);   left: 0; width: 0; }
.zf-kpi.kpi-green { background: var(--green-bg); border-color: var(--green-bd); }
.zf-kpi.kpi-red   { background: var(--red-bg);   border-color: var(--red-bd); }
.zf-kpi.kpi-navy  { background: var(--navy-50);  border-color: var(--navy-100); }
.zf-kpi.kpi-navy::before { background: var(--navy); }

/* Icon circle */
.zf-kpi-icon {
  width: 38px; height: 38px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 14px;
  flex-shrink: 0;
}
.zf-kpi-lbl {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .09em;
  color: var(--tx-400);
  margin-bottom: 5px;
}
.zf-kpi-val {
  font-family: var(--ff-mono);
  font-size: 26px;
  font-weight: 600;
  color: var(--tx-900);
  line-height: 1;
  letter-spacing: -.6px;
}
.zf-kpi.kpi-green .zf-kpi-val { color: var(--green); }
.zf-kpi.kpi-red   .zf-kpi-val { color: var(--red); }
.zf-kpi-sub {
  font-size: 11px;
  color: var(--tx-400);
  margin-top: 6px;
  font-weight: 500;
}
.zf-kpi-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  margin-top: 8px;
  align-self: flex-start;
}
.zf-chip-green { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bd); }
.zf-chip-red   { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red-bd); }
.zf-chip-navy  { background: var(--navy-50);  color: var(--navy);  border: 1px solid var(--navy-100); }
.zf-kpi-divider {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px solid var(--bd-50);
  font-size: 10px;
  color: var(--tx-300);
  font-weight: 500;
}

/* ══════════════════════════════════════════════════
   MIDDLE ROW — wide chart + narrow sector panel
   Grid type B from reference (image 4)
══════════════════════════════════════════════════ */
.zf-mid-row {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 16px;
  min-height: 0;
}

/* ══════════════════════════════════════════════════
   BOTTOM ROW — holdings table + watchlist
   Grid type D from reference (image 4)
══════════════════════════════════════════════════ */
.zf-bot-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  min-height: 0;
}

/* ══════════════════════════════════════════════════
   CARD — shared panel wrapper
══════════════════════════════════════════════════ */
.zf-card {
  background: var(--bg-card);
  border: 1px solid var(--bd-100);
  border-radius: 12px;
  box-shadow: var(--sh-1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.zf-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--bd-50);
  flex-shrink: 0;
  background: var(--bg-surface);
  gap: 10px;
}
.zf-card-title {
  font-family: var(--ff-disp);
  font-size: 14.5px;
  color: var(--navy);
  letter-spacing: -.1px;
}
.zf-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.zf-card-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--navy);
  background: var(--navy-50);
  border: 1px solid var(--navy-100);
  border-radius: 20px;
  padding: 2px 9px;
}
.zf-card-link {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--navy);
  cursor: pointer;
  padding: 5px 12px;
  border-radius: 8px;
  background: var(--navy-50);
  border: 1px solid var(--navy-100);
  transition: all .13s;
  white-space: nowrap;
}
.zf-card-link:hover { background: var(--navy); color: white; }
.zf-card-body { padding: 0; overflow-y: auto; flex: 1; }
.zf-card-body::-webkit-scrollbar { width: 3px; }
.zf-card-body::-webkit-scrollbar-thumb { background: var(--bd-200); border-radius: 3px; }

/* ══════════════════════════════════════════════════
   MINI PERFORMANCE CHART inside mid row
══════════════════════════════════════════════════ */
.zf-perf-wrap { padding: 16px 20px; }
.zf-perf-numbers {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.zf-perf-num { display: flex; flex-direction: column; gap: 2px; }
.zf-perf-num-val { font-family: var(--ff-mono); font-size: 20px; font-weight: 600; color: var(--tx-900); }
.zf-perf-num-lbl { font-size: 10px; color: var(--tx-400); font-weight: 600; text-transform: uppercase; letter-spacing: .07em; }

/* SVG area chart */
.zf-areachart { width: 100%; }

/* ══════════════════════════════════════════════════
   SECTOR PANEL (right side of mid row)
══════════════════════════════════════════════════ */
.zf-sector-list { padding: 12px 20px; display: flex; flex-direction: column; gap: 10px; }
.zf-sector-item { display: flex; flex-direction: column; gap: 4px; }
.zf-sector-row { display: flex; align-items: center; justify-content: space-between; }
.zf-sector-name { font-size: 12px; font-weight: 600; color: var(--tx-700); }
.zf-sector-pct  { font-family: var(--ff-mono); font-size: 11px; font-weight: 600; color: var(--navy); }
.zf-sector-bar  { height: 5px; border-radius: 3px; background: var(--bd-100); overflow: hidden; }
.zf-sector-fill { height: 100%; border-radius: 3px; background: var(--navy); transition: width .4s ease; }

/* ══════════════════════════════════════════════════
   HOLDINGS TABLE
══════════════════════════════════════════════════ */
.zf-tbl-head {
  display: grid;
  grid-template-columns: 2fr .6fr 1fr 1fr .9fr;
  gap: 0;
  padding: 10px 20px;
  background: var(--bg-surface);
  border-bottom: 1.5px solid var(--bd-200);
  position: sticky;
  top: 0;
  z-index: 2;
}
.zf-th {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .09em;
  color: var(--tx-300);
}
.zf-th.r { text-align: right; }
.zf-trow {
  display: grid;
  grid-template-columns: 2fr .6fr 1fr 1fr .9fr;
  gap: 0;
  padding: 12px 20px;
  align-items: center;
  border-bottom: 1px solid var(--bd-50);
  transition: background .12s;
}
.zf-trow:hover { background: var(--bg-hover); }
.zf-trow:last-child { border-bottom: none; }

.zf-stock-cell { display: flex; align-items: center; gap: 10px; }
.zf-logo-wrap {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: var(--navy-50);
  border: 1px solid var(--navy-100);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--navy);
  overflow: hidden;
  flex-shrink: 0;
}
.zf-logo-wrap img { width: 100%; height: 100%; object-fit: contain; }
.zf-ticker-name { font-size: 13px; font-weight: 700; color: var(--tx-900); letter-spacing: -.1px; }
.zf-sector-tag {
  display: inline-block;
  font-size: 9.5px; font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--bg-app);
  border: 1px solid var(--bd-200);
  color: var(--tx-400);
  margin-top: 2px;
}
.zf-td { font-family: var(--ff-mono); font-size: 12px; color: var(--tx-500); font-weight: 500; }
.zf-td.r { text-align: right; }
.zf-pl  { font-family: var(--ff-mono); font-size: 12px; font-weight: 700; text-align: right; }
.zf-pl-sub { font-family: var(--ff-mono); font-size: 10px; text-align: right; margin-top: 1px; }

/* ══════════════════════════════════════════════════
   WATCHLIST PANEL
══════════════════════════════════════════════════ */
.zf-wl-head {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 12px;
  padding: 10px 20px;
  background: var(--bg-surface);
  border-bottom: 1.5px solid var(--bd-200);
}
.zf-wl-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 20px;
  border-bottom: 1px solid var(--bd-50);
  transition: background .12s;
  gap: 10px;
}
.zf-wl-row:hover { background: var(--bg-hover); }
.zf-wl-row:last-child { border-bottom: none; }
.zf-wl-name { font-size: 13px; font-weight: 700; color: var(--tx-900); }
.zf-wl-sub  { font-size: 10px; color: var(--tx-400); margin-top: 2px; font-weight: 500; }
.zf-wl-spark { width: 56px; height: 26px; flex-shrink: 0; }
.zf-wl-price { font-family: var(--ff-mono); font-size: 13px; font-weight: 600; color: var(--tx-900); text-align: right; }
.zf-wl-chg   { font-size: 10.5px; font-weight: 700; text-align: right; margin-top: 2px; }

/* ══════════════════════════════════════════════════
   TAB CONTENT PANEL (non-overview)
══════════════════════════════════════════════════ */
.zf-tab-panel {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--bd-100);
  border-radius: 12px;
  box-shadow: var(--sh-1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.zf-tab-panel > * {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
/* Padded variant for charts/AI etc */
.zf-tab-panel.padded > * { padding: 0; }
.zf-tab-panel > *::-webkit-scrollbar { width: 5px; height: 5px; }
.zf-tab-panel > *::-webkit-scrollbar-thumb { background: var(--bd-200); border-radius: 5px; }

/* Override child component colors to match cream theme */
.zf-tab-panel th {
  background: var(--bg-surface) !important;
  color: var(--tx-300) !important;
  font-size: 9.5px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: .09em !important;
  border-bottom: 1.5px solid var(--bd-200) !important;
  padding: 11px 18px !important;
}
.zf-tab-panel td {
  padding: 13px 18px !important;
  font-size: 13px !important;
  color: var(--tx-500) !important;
  border-bottom: 1px solid var(--bd-50) !important;
  vertical-align: middle !important;
}
.zf-tab-panel tr:hover td { background: var(--bg-hover) !important; }
.zf-tab-panel tbody tr:last-child td { border-bottom: none !important; }
.zf-tab-panel .font-semibold,
.zf-tab-panel .font-bold { color: var(--tx-900) !important; }
.zf-tab-panel h2, .zf-tab-panel h3 { color: var(--navy) !important; font-family: var(--ff-disp) !important; }
.zf-tab-panel p.text-muted-foreground,
.zf-tab-panel [class*="text-muted"] { color: var(--tx-400) !important; }
.zf-tab-panel button.bg-primary,
.zf-tab-panel [class*="bg-primary"] { background: var(--navy) !important; color: white !important; }
.zf-tab-panel button.bg-primary:hover { background: var(--navy-700) !important; }
.zf-tab-panel button[class*="outline"] {
  background: var(--bg-card) !important;
  border-color: var(--bd-200) !important;
  color: var(--navy) !important;
}
.zf-tab-panel button[class*="outline"]:hover { background: var(--navy-50) !important; }
.zf-tab-panel button[class*="ghost"]:hover { background: var(--bg-hover) !important; color: var(--navy) !important; }
.zf-tab-panel input:not([type="checkbox"]),
.zf-tab-panel select, .zf-tab-panel textarea {
  background: var(--bg-input) !important;
  border-color: var(--bd-200) !important;
  color: var(--tx-900) !important;
  font-size: 13px !important;
}
.zf-tab-panel input:focus, .zf-tab-panel select:focus, .zf-tab-panel textarea:focus {
  border-color: var(--navy) !important;
  box-shadow: 0 0 0 3px rgba(28,53,87,.1) !important;
}
.zf-tab-panel label { color: var(--tx-500) !important; font-size: 12px !important; font-weight: 600 !important; }
.zf-tab-panel input::placeholder, .zf-tab-panel textarea::placeholder { color: var(--tx-200) !important; }
.zf-tab-panel [role="tablist"] { background: var(--bg-surface) !important; border-radius: 8px !important; }
.zf-tab-panel [role="tab"] { color: var(--tx-400) !important; }
.zf-tab-panel [role="tab"][data-state="active"] { background: var(--bg-card) !important; color: var(--navy) !important; font-weight: 700 !important; }
.zf-tab-panel .recharts-text { fill: var(--tx-400) !important; }
.zf-tab-panel .rounded-xl, .zf-tab-panel .rounded-lg, .zf-tab-panel [class*="card"] {
  background: var(--bg-card) !important;
  border-color: var(--bd-100) !important;
}

/* ══════════════════════════════════════════════════
   RESPONSIVE
══════════════════════════════════════════════════ */
@media (max-width: 1100px) {
  .zf-mid-row { grid-template-columns: 1fr; }
  .zf-mid-row .zf-sector-side { display: none; }
}
@media (max-width: 900px) {
  .zf-kpi-row { grid-template-columns: repeat(2, 1fr); }
  .zf-bot-row { grid-template-columns: 1fr; }
  .zf-search { display: none; }
}
@media (max-width: 640px) {
  .zf-kpi-row { grid-template-columns: 1fr 1fr; }
  .zf-content { padding: 14px; gap: 14px; }
}

/* ── Spinner ── */
@keyframes zf-spin { to { transform: rotate(360deg); } }
.zf-spin { animation: zf-spin .9s linear infinite; }

/* ══════════════════════════════════════════════════
   DARK MODE — complete, white text everywhere
   Rule: --navy accent stays blue for UI elements
         ALL body text = white/light, NOT blue
══════════════════════════════════════════════════ */
.dark .zf {
  /* Backgrounds */
  --bg-app:      #0d1117;
  --bg-sidebar:  #161b22;
  --bg-card:     #1c2128;
  --bg-surface:  #1c2128;
  --bg-hover:    #21262d;
  --bg-input:    #0d1117;
  /* Accent — blue stays blue for buttons/icons only */
  --navy:        #58a6ff;
  --navy-700:    #79b8ff;
  --navy-600:    #9ecaff;
  --navy-100:    rgba(88,166,255,.18);
  --navy-50:     rgba(88,166,255,.10);
  /* Text — WHITE hierarchy, not blue */
  --tx-900:      #f0f6fc;
  --tx-700:      #c9d1d9;
  --tx-500:      #8b949e;
  --tx-400:      #6e7681;
  --tx-300:      #484f58;
  --tx-200:      #30363d;
  /* Borders */
  --bd-200:      #30363d;
  --bd-100:      #21262d;
  --bd-50:       #161b22;
  /* Semantic */
  --green:       #3fb950;
  --green-bg:    rgba(63,185,80,.12);
  --green-bd:    rgba(63,185,80,.3);
  --red:         #f85149;
  --red-bg:      rgba(248,81,73,.12);
  --red-bd:      rgba(248,81,73,.3);
  --amber:       #e3b341;
  --amber-bg:    rgba(227,179,65,.12);
  --amber-bd:    rgba(227,179,65,.3);
  /* Shadows */
  --sh-1: 0 1px 3px rgba(0,0,0,.5);
  --sh-2: 0 4px 12px rgba(0,0,0,.6);
  --sh-3: 0 8px 24px rgba(0,0,0,.7);
  color: #f0f6fc;
}

/* ── Sidebar ── */
.dark .zf-sidebar         { background: #161b22; border-right-color: #30363d; box-shadow: 1px 0 0 #30363d; }
.dark .zf-brand-name      { color: #f0f6fc; }
.dark .zf-brand-sub       { color: #6e7681; }
.dark .zf-nav-grp         { color: #484f58; }
.dark .zf-nav-item        { color: #8b949e; }
.dark .zf-nav-item:hover  { background: #21262d; color: #f0f6fc; }
.dark .zf-nav-item.active { background: rgba(88,166,255,.12); border-color: rgba(88,166,255,.2); color: #f0f6fc; font-weight: 600; }
.dark .zf-nav-item.active::before { background: #58a6ff; }
.dark .zf-nav-item.active svg { color: #58a6ff; }
.dark .zf-sidebar-foot    { border-top-color: #30363d; }
.dark .zf-user-row        { background: #0d1117; border-color: #30363d; }
.dark .zf-user-avatar     { background: #58a6ff; color: #fff; }
.dark .zf-user-name       { color: #c9d1d9; }
.dark .zf-user-role       { color: #6e7681; }
.dark .zf-collapse-btn    { background: #1c2128; border-color: #30363d; color: #6e7681; }
.dark .zf-collapse-btn:hover { background: #21262d; color: #f0f6fc; }

/* ── Header ── */
.dark .zf-header          { background: #161b22; border-bottom-color: #30363d; box-shadow: 0 1px 0 #30363d; }
.dark .zf-page-title      { color: #f0f6fc; }
.dark .zf-search          { background: #0d1117; border-color: #30363d; }
.dark .zf-search input    { color: #c9d1d9; }
.dark .zf-search input::placeholder { color: #484f58; }
.dark .zf-search:focus-within { border-color: #58a6ff; box-shadow: 0 0 0 3px rgba(88,166,255,.15); }
.dark .zf-hbtn            { background: #21262d; border-color: #30363d; color: #8b949e; }
.dark .zf-hbtn:hover      { background: #30363d; border-color: #484f58; color: #f0f6fc; }
.dark .zf-live            { background: rgba(63,185,80,.12); border-color: rgba(63,185,80,.3); color: #3fb950; }
.dark .zf-live.cached     { background: rgba(227,179,65,.12); border-color: rgba(227,179,65,.3); color: #e3b341; }
.dark .zf-umenu           { background: #1c2128; border-color: #30363d; }
.dark .zf-umenu-head      { background: #161b22; border-bottom-color: #30363d; }
.dark .zf-umenu-lbl       { color: #6e7681; }
.dark .zf-umenu-email     { color: #f0f6fc; }
.dark .zf-umenu-btn       { color: #c9d1d9; }
.dark .zf-umenu-btn:hover { background: #21262d; color: #f0f6fc; }
.dark .zf-umenu-btn.danger { color: #f85149; }
.dark .zf-umenu-btn.primary { color: #58a6ff; }

/* ── KPI cards ── */
.dark .zf-kpi             { background: #1c2128; border-color: #30363d; }
.dark .zf-kpi-lbl         { color: #6e7681; }
.dark .zf-kpi-val         { color: #f0f6fc; }
.dark .zf-kpi-sub         { color: #8b949e; }
.dark .zf-kpi-divider     { color: #484f58; border-top-color: #21262d; }
.dark .zf-kpi.kpi-navy    { background: rgba(88,166,255,.08); border-color: rgba(88,166,255,.18); }
.dark .zf-kpi.kpi-navy .zf-kpi-val  { color: #f0f6fc; }
.dark .zf-kpi.kpi-green   { background: rgba(63,185,80,.08); border-color: rgba(63,185,80,.2); }
.dark .zf-kpi.kpi-green .zf-kpi-val { color: #3fb950; }
.dark .zf-kpi.kpi-red     { background: rgba(248,81,73,.08); border-color: rgba(248,81,73,.2); }
.dark .zf-kpi.kpi-red .zf-kpi-val   { color: #f85149; }
.dark .zf-kpi-icon        { opacity: .9; }
.dark .zf-chip-green { background: rgba(63,185,80,.12) !important; color: #3fb950 !important; border-color: rgba(63,185,80,.3) !important; }
.dark .zf-chip-red   { background: rgba(248,81,73,.12) !important; color: #f85149 !important; border-color: rgba(248,81,73,.3) !important; }
.dark .zf-chip-navy  { background: rgba(88,166,255,.12) !important; color: #58a6ff !important; border-color: rgba(88,166,255,.25) !important; }

/* ── Cards ── */
.dark .zf-card            { background: #1c2128; border-color: #30363d; }
.dark .zf-card-head       { background: #161b22; border-bottom-color: #30363d; }
.dark .zf-card-title      { color: #f0f6fc; }
.dark .zf-card-badge      { background: rgba(88,166,255,.12); border-color: rgba(88,166,255,.2); color: #58a6ff; }
.dark .zf-card-link       { background: rgba(88,166,255,.10); border-color: rgba(88,166,255,.2); color: #58a6ff; }
.dark .zf-card-link:hover { background: #58a6ff; color: #fff; }

/* ── Holdings table ── */
.dark .zf-tbl-head        { background: #161b22; border-bottom-color: #30363d; }
.dark .zf-th              { color: #484f58; }
.dark .zf-trow            { border-bottom-color: #21262d; }
.dark .zf-trow:hover      { background: #21262d; }
.dark .zf-ticker-name     { color: #f0f6fc; }
.dark .zf-sector-tag      { background: #21262d; border-color: #30363d; color: #6e7681; }
.dark .zf-logo-wrap       { background: rgba(88,166,255,.1); border-color: rgba(88,166,255,.2); color: #58a6ff; }
.dark .zf-td              { color: #8b949e; }
.dark .zf-pl              { }
.dark .zf-pl-sub          { }

/* ── Watchlist ── */
.dark .zf-wl-head         { background: #161b22; border-bottom-color: #30363d; }
.dark .zf-wl-row          { border-bottom-color: #21262d; }
.dark .zf-wl-row:hover    { background: #21262d; }
.dark .zf-wl-name         { color: #f0f6fc; }
.dark .zf-wl-sub          { color: #6e7681; }
.dark .zf-wl-price        { color: #c9d1d9; }

/* ── Sector section ── */
.dark .zf-sector-name     { color: #c9d1d9; }
.dark .zf-sector-pct      { color: #58a6ff; }
.dark .zf-sector-bar      { background: #21262d; }

/* ── F&O inline table on overview ── */
.dark table th { background: #161b22 !important; color: #484f58 !important; border-bottom-color: #30363d !important; }
.dark table td { color: #8b949e !important; border-bottom-color: #21262d !important; }
.dark table tbody tr:hover td { background: #21262d !important; }
.dark table tbody td .zf-ticker-name,
.dark table tbody td div[style*="font-weight:700"],
.dark table tbody td div[style*="fontWeight:700"] { color: #f0f6fc !important; }

/* ── Tab panel — child components ── */
.dark .zf-tab-panel { background: #1c2128; border-color: #30363d; }
.dark .zf-tab-panel th { background: #161b22 !important; color: #484f58 !important; border-bottom-color: #30363d !important; }
.dark .zf-tab-panel td { color: #8b949e !important; border-bottom-color: #21262d !important; }
.dark .zf-tab-panel tr:hover td { background: #21262d !important; }
.dark .zf-tab-panel tbody tr:last-child td { border-bottom: none !important; }
/* Force white on bold/semibold text in tables */
.dark .zf-tab-panel .font-semibold,
.dark .zf-tab-panel .font-bold,
.dark .zf-tab-panel [class*="font-bold"],
.dark .zf-tab-panel [class*="font-semibold"] { color: #f0f6fc !important; }
.dark .zf-tab-panel h1,
.dark .zf-tab-panel h2,
.dark .zf-tab-panel h3,
.dark .zf-tab-panel h4 { color: #f0f6fc !important; }
.dark .zf-tab-panel p { color: #8b949e !important; }
.dark .zf-tab-panel [class*="text-muted"],
.dark .zf-tab-panel .text-muted-foreground { color: #6e7681 !important; }
.dark .zf-tab-panel [class*="text-foreground"],
.dark .zf-tab-panel .text-foreground { color: #f0f6fc !important; }
.dark .zf-tab-panel [class*="text-primary"] { color: #58a6ff !important; }
.dark .zf-tab-panel button.bg-primary,
.dark .zf-tab-panel [class*="bg-primary"] { background: #58a6ff !important; color: #fff !important; }
.dark .zf-tab-panel button[class*="outline"] { background: #1c2128 !important; border-color: #30363d !important; color: #c9d1d9 !important; }
.dark .zf-tab-panel button[class*="outline"]:hover { background: #21262d !important; color: #f0f6fc !important; }
.dark .zf-tab-panel button[class*="ghost"] { color: #8b949e !important; }
.dark .zf-tab-panel button[class*="ghost"]:hover { background: #21262d !important; color: #f0f6fc !important; }
.dark .zf-tab-panel input:not([type="checkbox"]),
.dark .zf-tab-panel select,
.dark .zf-tab-panel textarea { background: #0d1117 !important; border-color: #30363d !important; color: #f0f6fc !important; }
.dark .zf-tab-panel label { color: #c9d1d9 !important; }
.dark .zf-tab-panel input::placeholder,
.dark .zf-tab-panel textarea::placeholder { color: #484f58 !important; }
.dark .zf-tab-panel [role="tablist"] { background: #161b22 !important; border-color: #30363d !important; }
.dark .zf-tab-panel [role="tab"] { color: #6e7681 !important; }
.dark .zf-tab-panel [role="tab"][data-state="active"] { background: #1c2128 !important; color: #f0f6fc !important; }
.dark .zf-tab-panel .rounded-xl,
.dark .zf-tab-panel .rounded-lg,
.dark .zf-tab-panel [class*="card"],
.dark .zf-tab-panel [class*="Card"] { background: #1c2128 !important; border-color: #30363d !important; }
.dark .zf-tab-panel [class*="CardHeader"],
.dark .zf-tab-panel [class*="card-header"] { background: #161b22 !important; border-bottom-color: #30363d !important; }
/* Trades sub-tab bar */
.dark .zf-tab-panel > div > div[style*="background"] { background: #161b22 !important; border-bottom-color: #30363d !important; }
.dark .zf-tab-panel > div > div > button { color: #8b949e !important; }
/* Recharts */
.dark .zf-tab-panel .recharts-cartesian-axis-tick-value { fill: #484f58 !important; }
.dark .zf-tab-panel .recharts-text { fill: #484f58 !important; }
.dark .zf-tab-panel .recharts-default-tooltip { background: #1c2128 !important; border-color: #30363d !important; color: #f0f6fc !important; }
/* Progress bars, badges */
.dark .zf-tab-panel [class*="badge"],
.dark .zf-tab-panel [class*="Badge"] { background: rgba(88,166,255,.12) !important; color: #58a6ff !important; border-color: rgba(88,166,255,.2) !important; }
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
    try { return localStorage.getItem("zf-dark") === "1"; } catch { return false; }
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
  const [fnoTrades, setFnoTrades] = useState<FnOTrade[]>(() =>
    (() => { try { const d = localStorage.getItem("zf-fno-trades"); return d ? JSON.parse(d) : fnOTradesData; } catch { return fnOTradesData; } })()
  );
  const [tradesSubTab, setTradesSubTab] = useState<"equity"|"fno">("equity");

  // Persist F&O trades
  useEffect(() => {
    try { localStorage.setItem("zf-fno-trades", JSON.stringify(fnoTrades)); } catch {}
  }, [fnoTrades]);

  const { toast }         = useToast();
  const { user, signOut, loading: _authLoading } = useAuth();
  const tickers = stocks.map(s => s.ticker);
  const { prices, isLive, refresh } = useLivePrices(tickers);
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
  const fnoInvested     = fnoTrades.reduce((s, t) => s + calcFnOInvested(t), 0);        // all F&O premium/margin
  const fnoActiveCurr   = fnoOpen.reduce((s, t) => s + (t.ltp ?? t.entryPrice) * t.lots * t.lotSize, 0);
  const fnoUnrealised   = fnoOpen.reduce((s, t) => s + calcFnOPnL(t), 0);
  const fnoRealised     = fnoClosed.reduce((s, t) => s + calcFnOPnL(t), 0);

  // COMBINED dashboard metrics
  // "Total Invested" = everything ever put in (equity ALL trades + F&O ALL premium)
  const invested        = equityInvested + fnoInvested;
  // "Portfolio Value" = active equity CMP value + F&O open positions value
  const current         = activeCurr + fnoActiveCurr;
  // "Unrealised P&L" = equity open + F&O open
  const pnl             = unrealisedPnl + fnoUnrealised;
  const pnlPct          = invested > 0 ? pnl / invested * 100 : 0;
  // "Realised P&L" = equity closed + F&O closed
  const totalRealised   = realisedPnl + fnoRealised;

  const winners         = closedPos.filter(s => calcProfitLoss(s) > 0);
  const winRate         = closedPos.length > 0 ? winners.length / closedPos.length * 100 : 0;
  const todayPnl        = activePos.reduce((a, s) => a + (s.cmp - s.entryPrice) * s.quantity * 0.003, 0);
  const todayPct        = invested > 0 ? Math.abs(todayPnl) / invested * 100 : 0;

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
              title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{ fontSize:14 }}>
              {darkMode ? "☀️" : "🌙"}
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

          {/* Content */}
          <div className="zf-content">

            {/* ══════════ OVERVIEW — ByeWind reference layout ══════════ */}
            {tab === "overview" && (<>

              {/* ── ROW 1: 4 KPI stat cards ── */}
              <div className="zf-kpi-row">

                <div className="zf-kpi kpi-navy">
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div className="zf-kpi-icon" style={{ background:"var(--navy-100)", marginBottom:0 }}>
                      <Wallet size={17} color="var(--navy)" />
                    </div>
                    <span className="zf-kpi-chip zf-chip-navy" style={{ margin:0 }}>{activePos.length} active</span>
                  </div>
                  <div className="zf-kpi-lbl">Total Invested</div>
                  <div className="zf-kpi-val">{fmt(invested)}</div>
                  <div className="zf-kpi-sub" style={{ marginTop:6 }}>
                    {closedPos.length} closed · {live.length} total
                  </div>
                </div>

                <div className={`zf-kpi ${pnl>=0?"kpi-green":"kpi-red"}`}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div className="zf-kpi-icon" style={{ background: pnl>=0?"#d1fae5":"#fee2e2", marginBottom:0 }}>
                      {pnl>=0 ? <TrendingUp size={17} color="var(--green)" /> : <TrendingDown size={17} color="var(--red)" />}
                    </div>
                    <span className={`zf-kpi-chip ${pnl>=0?"zf-chip-green":"zf-chip-red"}`} style={{ margin:0 }}>
                      {sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%
                    </span>
                  </div>
                  <div className="zf-kpi-lbl">Portfolio Value</div>
                  <div className="zf-kpi-val">{fmt(current)}</div>
                  <div className="zf-kpi-sub" style={{ marginTop:6 }}>
                    P&L: {sign(pnl)}{fmt(Math.abs(pnl))} · F&O: {sign(fnoUnrealised)}{fmt(Math.abs(fnoUnrealised))}
                  </div>
                </div>

                <div className={`zf-kpi ${todayPnl>=0?"kpi-green":"kpi-red"}`}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div className="zf-kpi-icon" style={{ background: todayPnl>=0?"#d1fae5":"#fee2e2", marginBottom:0 }}>
                      <Activity size={17} color={todayPnl>=0?"var(--green)":"var(--red)"} />
                    </div>
                    <span className={`zf-kpi-chip ${todayPnl>=0?"zf-chip-green":"zf-chip-red"}`} style={{ margin:0 }}>
                      {sign(todayPnl)}{todayPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="zf-kpi-lbl">Today's P&L</div>
                  <div className="zf-kpi-val">{sign(todayPnl)}{fmt(Math.abs(todayPnl))}</div>
                  <div className="zf-kpi-sub" style={{ marginTop:6 }}>
                    {isLive ? "Live" : "Cached"} · {now} IST
                  </div>
                </div>

                <div className="zf-kpi" style={{ background:"var(--bg-card)" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div className="zf-kpi-icon" style={{ background:"#fff7ed", marginBottom:0 }}>
                      <Award size={17} color="#d97706" />
                    </div>
                    <span className={`zf-kpi-chip ${winRate>=50?"zf-chip-green":"zf-chip-navy"}`} style={{ margin:0 }}>
                      {winners.length}/{closedPos.length}
                    </span>
                  </div>
                  <div className="zf-kpi-lbl">Win Rate</div>
                  <div className="zf-kpi-val" style={{ color: winRate>=50?"var(--green)":winRate>0?"var(--amber)":"var(--tx-400)" }}>
                    {winRate.toFixed(0)}%
                  </div>
                  <div className="zf-kpi-sub" style={{ marginTop:6 }}>
                    Realised: {sign(totalRealised)}{fmt(Math.abs(totalRealised))}
                  </div>
                </div>
              </div>

              {/* ── ROW 2: Holdings + Watchlist (moved up) ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:16 }}>

                {/* Holdings table */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Holdings</span>
                    <div className="zf-card-meta">
                      <span className="zf-card-badge">{activePos.length} active</span>
                      <button className="zf-card-link" onClick={() => setTab("holdings")}>View all →</button>
                    </div>
                  </div>
                  <div className="zf-card-body">
                    <div className="zf-tbl-head">
                      <span className="zf-th">Stock</span>
                      <span className="zf-th r">Qty</span>
                      <span className="zf-th r">Avg</span>
                      <span className="zf-th r">CMP</span>
                      <span className="zf-th r">P&L</span>
                    </div>
                    {activePos.length === 0 ? (
                      <div style={{ padding:"28px 20px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>
                        No active holdings
                      </div>
                    ) : activePos.slice(0, 5).map(s => {
                      const pl    = s.entryPrice > 0 ? (s.cmp - s.entryPrice) / s.entryPrice * 100 : 0;
                      const plAmt = (s.cmp - s.entryPrice) * s.quantity;
                      const pos   = pl >= 0;
                      return (
                        <div key={s.ticker} className="zf-trow">
                          <div className="zf-stock-cell">
                            <div className="zf-logo-wrap">
                              <img src={`https://logo.clearbit.com/${(s.stockName??s.ticker).toLowerCase().replace(/\s+/g,"")}.com`} alt=""
                                onError={e => { (e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).parentElement!.textContent=s.ticker.slice(0,2); }} />
                            </div>
                            <div>
                              <div className="zf-ticker-name">{s.ticker}</div>
                              <span className="zf-sector-tag">{s.sector}</span>
                            </div>
                          </div>
                          <span className="zf-td r">{s.quantity}</span>
                          <span className="zf-td r">{fmtNum(s.entryPrice)}</span>
                          <span className="zf-td r">{fmtNum(s.cmp)}</span>
                          <div style={{ textAlign:"right" }}>
                            <div className="zf-pl" style={{ color: pos?"var(--green)":"var(--red)" }}>{sign(pl)}{Math.abs(pl).toFixed(1)}%</div>
                            <div className="zf-pl-sub" style={{ color: pos?"var(--green)":"var(--red)" }}>{sign(plAmt)}₹{Math.abs(plAmt).toLocaleString("en-IN",{maximumFractionDigits:0})}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Watchlist */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Watchlist</span>
                    <div className="zf-card-meta">
                      <span className="zf-card-badge">{watchlist.length}</span>
                      <button className="zf-card-link" onClick={() => setTab("watchlist")}>+ Add</button>
                    </div>
                  </div>
                  <div className="zf-card-body">
                    <div className="zf-wl-head">
                      <span className="zf-th">Stock</span>
                      <span className="zf-th" style={{ textAlign:"center" }}>Trend</span>
                      <span className="zf-th" style={{ textAlign:"right" }}>Price</span>
                    </div>
                    {watchlist.length === 0 ? (
                      <div style={{ padding:"28px 20px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>
                        No watchlist stocks yet
                      </div>
                    ) : watchlist.slice(0,6).map((w,wi) => {
                      const cmp=w.cmp??0; const t1=w.target1??cmp; const sl=w.stopLoss??cmp;
                      const pos=cmp>=(w.entryZoneLow??cmp); const seed=w.stockName.charCodeAt(0)+wi*7;
                      return (
                        <div key={w.stockName} className="zf-wl-row">
                          <div>
                            <div className="zf-wl-name">{w.stockName}</div>
                            <div className="zf-wl-sub">T1 ₹{t1.toLocaleString("en-IN")} · SL ₹{sl.toLocaleString("en-IN")}</div>
                          </div>
                          <svg className="zf-wl-spark" viewBox="0 0 56 26" fill="none">
                            <polyline points={Array.from({length:8},(_,i)=>{
                              const x=4+i*7; const y=13+Math.sin((i+seed)*1.1)*8*(pos?1:-1);
                              return `${x},${Math.max(2,Math.min(24,y))}`;
                            }).join(" ")} stroke={pos?"var(--green)":"var(--red)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <div>
                            <div className="zf-wl-price">₹{cmp.toLocaleString("en-IN")}</div>
                            <div className="zf-wl-chg" style={{ color:pos?"var(--green)":"var(--red)" }}>RSI {w.rsi?.toFixed(0)??"—"}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── ROW 3: F&O Positions mini-table ── */}
              <div className="zf-card">
                <div className="zf-card-head">
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span className="zf-card-title">F&O Positions</span>
                    <span className="zf-card-badge">{fnoOpen.length} open</span>
                    {fnoOpen.length > 0 && (
                      <span style={{
                        fontSize:9.5, fontWeight:700, padding:"2px 8px", borderRadius:20,
                        background: fnoUnrealised>=0 ? "var(--green-bg)" : "var(--red-bg)",
                        color: fnoUnrealised>=0 ? "var(--green)" : "var(--red)",
                        border: `1px solid ${fnoUnrealised>=0 ? "var(--green-bd)" : "var(--red-bd)"}`,
                      }}>
                        {sign(fnoUnrealised)}{fmt(Math.abs(fnoUnrealised))} unrealised
                      </span>
                    )}
                  </div>
                  <div className="zf-card-meta">
                    <button className="zf-card-link" onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}>
                      View all F&O →
                    </button>
                  </div>
                </div>
                <div className="zf-card-body">
                  {fnoTrades.filter(t => t.status === "Open").length === 0 ? (
                    <div style={{ padding:"28px 20px", textAlign:"center", color:"var(--tx-300)", fontSize:12 }}>
                      No open F&O positions · <button onClick={() => { setTab("trades"); setTradesSubTab("fno"); }}
                        style={{ background:"none", border:"none", color:"var(--navy)", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        Add one →
                      </button>
                    </div>
                  ) : (
                    <div style={{ overflowX:"auto" }}>
                      <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
                        <thead>
                          <tr>
                            {["Instrument","Type","Strike","Expiry","Lots×Size","Entry","LTP","P&L","Status"].map(h => (
                              <th key={h} style={{
                                padding:"10px 14px", fontSize:"9.5px", fontWeight:700,
                                textTransform:"uppercase", letterSpacing:".09em", color:"var(--tx-300)",
                                background:"var(--bg-surface)", borderBottom:"1.5px solid var(--bd-200)",
                                textAlign: ["Entry","LTP","P&L"].includes(h) ? "right" : ["Type","Status"].includes(h) ? "center" : "left",
                                whiteSpace:"nowrap",
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {fnoTrades.filter(t => t.status === "Open").slice(0,4).map(t => {
                            const ltp  = t.ltp ?? t.entryPrice;
                            const pnl  = t.instrumentType === "PE"
                              ? (t.entryPrice - ltp) * t.lots * t.lotSize
                              : (ltp - t.entryPrice) * t.lots * t.lotSize;
                            const pct  = t.entryPrice > 0 ? pnl / (t.entryPrice * t.lots * t.lotSize) * 100 : 0;
                            const pos  = pnl >= 0;
                            const typeCfgMap: Record<string, { bg:string; color:string; bd:string }> = {
                              CE:  { bg:"var(--green-bg)", color:"var(--green)",  bd:"var(--green-bd)" },
                              PE:  { bg:"var(--red-bg)",   color:"var(--red)",    bd:"var(--red-bd)"   },
                              FUT: { bg:"var(--navy-50)",  color:"var(--navy)",   bd:"var(--navy-100)" },
                            };
                            const typeCfg = typeCfgMap[t.instrumentType] ?? typeCfgMap["FUT"];
                            const expParts = t.expiry.split("-");
                            const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                            const expDisplay = expParts.length===3
                              ? `${parseInt(expParts[0])} ${months[parseInt(expParts[1])]} '${expParts[2].slice(-2)}`
                              : t.expiry;
                            return (
                              <tr key={t.id} style={{ transition:"background .12s" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="var(--bg-hover)"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background=""}>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)" }}>
                                  <div style={{ fontSize:13, fontWeight:700, color:"var(--tx-900)" }}>{t.symbol}</div>
                                  {t.notes && <div style={{ fontSize:10, color:"var(--tx-400)", marginTop:1, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes}</div>}
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"center" }}>
                                  <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:5, background:typeCfg.bg, color:typeCfg.color, border:`1px solid ${typeCfg.bd}`, letterSpacing:".04em" }}>
                                    {t.instrumentType}
                                  </span>
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>
                                  {t.strike ? `₹${t.strike.toLocaleString("en-IN")}` : "—"}
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontSize:12, fontWeight:600, color:"var(--tx-700)", whiteSpace:"nowrap" }}>
                                  {expDisplay}
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)" }}>
                                  {t.lots} × {t.lotSize.toLocaleString("en-IN")}
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", fontFamily:"var(--ff-mono)", fontSize:12, color:"var(--tx-500)", textAlign:"right" }}>
                                  ₹{t.entryPrice.toFixed(2)}
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"right" }}>
                                  <div style={{ fontFamily:"var(--ff-mono)", fontSize:12, fontWeight:600, color:"var(--navy)", display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4 }}>
                                    {t.ltp && <span style={{ width:5, height:5, borderRadius:"50%", background:"var(--green)", display:"inline-block" }} />}
                                    ₹{ltp.toFixed(2)}
                                  </div>
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"right" }}>
                                  <div style={{ fontFamily:"var(--ff-mono)", fontSize:12.5, fontWeight:700, color: pos?"var(--green)":"var(--red)" }}>
                                    {sign(pnl)}{fmt(Math.abs(pnl))}
                                  </div>
                                  <div style={{ fontFamily:"var(--ff-mono)", fontSize:10, color: pos?"var(--green)":"var(--red)" }}>
                                    {sign(pct)}{Math.abs(pct).toFixed(1)}%
                                  </div>
                                </td>
                                <td style={{ padding:"12px 14px", borderBottom:"1px solid var(--bd-50)", textAlign:"center" }}>
                                  <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10.5, fontWeight:700, padding:"3px 10px", borderRadius:20, background:"var(--navy-50)", color:"var(--navy)", border:"1px solid var(--navy-100)" }}>
                                    Open
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* ── ROW 4: Charts moved to bottom ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 340px", gap:16 }}>

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
                  <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#fff" }}>
                    {/* Sub-tab bar */}
                    <div style={{ display:"flex", alignItems:"center", gap:2, padding:"14px 20px 0", borderBottom:"1.5px solid #e5e7eb", background:"#f8f9fc", flexShrink:0 }}>
                      {([
                        { id:"equity", label:"Equity Trades", count: live.length },
                        { id:"fno",    label:"F&O Positions", count: fnoTrades.length },
                      ] as const).map(st => (
                        <button key={st.id}
                          onClick={() => setTradesSubTab(st.id)}
                          style={{
                            fontSize:13, fontWeight: tradesSubTab === st.id ? 700 : 500,
                            color: tradesSubTab === st.id ? "#1c3557" : "#6b7280",
                            padding:"9px 18px 10px", borderRadius:"8px 8px 0 0",
                            border: tradesSubTab === st.id ? "1px solid #e5e7eb" : "1px solid transparent",
                            borderBottom: tradesSubTab === st.id ? "1.5px solid #fff" : "1px solid transparent",
                            background: tradesSubTab === st.id ? "#fff" : "transparent",
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