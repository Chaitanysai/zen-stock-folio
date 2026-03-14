import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, TrendingUp, ScrollText, Eye,
  Brain, History, BarChart3, Bell, RefreshCw,
  LogOut, Settings, PieChart, Zap, ChevronLeft,
  ChevronRight, Search, Menu, X, TrendingDown,
  Activity, Wallet, Target, Award
} from "lucide-react";
import {
  portfolioData as initialData, PortfolioStock,
  tradeStrategies as initialTrades, TradeStrategy,
  watchlistData as initialWatchlist, WatchlistStock,
  PriceAlert, TradeJournalEntry,
  calcInvestedValue, calcFinalValue, calcProfitLoss,
} from "@/data/sampleData";
import PortfolioTable        from "@/components/PortfolioTable";
import TradeStrategyTable    from "@/components/TradeStrategyTable";
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

// ─── Sector mini-bar ──────────────────────────────────────────────────────────
function SectorBar({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  const total  = active.reduce((s, x) => s + calcInvestedValue(x), 0);
  const map    = new Map<string, number>();
  active.forEach(s => {
    const sec = s.sector ?? "Other";
    map.set(sec, (map.get(sec) ?? 0) + calcInvestedValue(s));
  });
  const COLORS = ["#1c3557","#2a5f9e","#3b7cc9","#6ba3d6","#9dc0e3","#c4d9ef"];
  const entries = [...map.entries()].sort((a,b) => b[1]-a[1]);
  return (
    <div>
      <div style={{ display:"flex", height:8, borderRadius:4, overflow:"hidden", gap:1 }}>
        {entries.map(([sec, val], i) => (
          <div key={sec} style={{ flex: val/total, background: COLORS[i % COLORS.length], minWidth: 2 }} />
        ))}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 14px", marginTop:8 }}>
        {entries.slice(0,4).map(([sec, val], i) => (
          <div key={sec} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:2, background: COLORS[i % COLORS.length], flexShrink:0 }} />
            <span style={{ fontSize:10, color:"var(--tx-lo)", fontWeight:500 }}>
              {sec} {total > 0 ? (val/total*100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500;600&display=swap');

/* ══════════════════════════════════════════════════
   DESIGN TOKENS
══════════════════════════════════════════════════ */
.zf {
  /* Backgrounds */
  --bg-app:       #f0ebe0;
  --bg-sidebar:   #fdfaf5;
  --bg-card:      #fdfaf5;
  --bg-surface:   #f7f2e8;
  --bg-hover:     #f2ece0;
  --bg-input:     #f7f2e8;

  /* Navy brand */
  --navy:         #1c3557;
  --navy-700:     #224168;
  --navy-600:     #2a5080;
  --navy-100:     #ddeaf8;
  --navy-50:      #eef4fc;

  /* Text */
  --tx-900:       #0f1925;
  --tx-700:       #2c3e55;
  --tx-500:       #5c7080;
  --tx-400:       #7a8fa3;
  --tx-300:       #a8bcce;
  --tx-200:       #cddae6;

  /* Borders */
  --bd-200:       #e2d8c8;
  --bd-100:       #ede8de;
  --bd-50:        #f4f0e8;

  /* Semantic */
  --green:        #14854f;
  --green-bg:     #edfaf4;
  --green-bd:     #a7e8c8;
  --red:          #c0392b;
  --red-bg:       #fdf2f0;
  --red-bd:       #f5c6c0;
  --amber:        #b45309;
  --amber-bg:     #fffbeb;
  --amber-bd:     #fcd34d;

  /* Shadows */
  --sh-1: 0 1px 3px rgba(28,53,87,.07), 0 1px 2px rgba(28,53,87,.04);
  --sh-2: 0 4px 12px rgba(28,53,87,.08), 0 2px 4px rgba(28,53,87,.05);
  --sh-3: 0 8px 24px rgba(28,53,87,.10), 0 3px 8px rgba(28,53,87,.06);

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
`;

// ─── Mini area chart component ──────────────────────────────────────────────
function MiniAreaChart({ stocks }: { stocks: PortfolioStock[] }) {
  const active = stocks.filter(s => s.status === "Active");
  if (active.length === 0) return (
    <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--tx-300)", fontSize: 12 }}>
      No active positions to chart
    </div>
  );

  // Generate synthetic monthly P&L curve from stock data
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const now = new Date();
  const pts = months.slice(0, now.getMonth() + 1).map((m, i) => {
    const progress = (i + 1) / (now.getMonth() + 1);
    const val = active.reduce((sum, s) => {
      const pnl = (s.cmp - s.entryPrice) * s.quantity * (progress * 0.7 + 0.3 + Math.sin(i + s.ticker.charCodeAt(0)) * 0.1);
      return sum + pnl;
    }, 0);
    return { m, val };
  });

  const minVal = Math.min(...pts.map(p => p.val), 0);
  const maxVal = Math.max(...pts.map(p => p.val), 1000);
  const range  = maxVal - minVal || 1;
  const W = 500, H = 120, pad = { l: 8, r: 8, t: 10, b: 20 };
  const xStep = (W - pad.l - pad.r) / Math.max(pts.length - 1, 1);
  const yOf   = (v: number) => pad.t + (1 - (v - minVal) / range) * (H - pad.t - pad.b);
  const xOf   = (i: number) => pad.l + i * xStep;

  const linePts  = pts.map((p, i) => `${xOf(i)},${yOf(p.val)}`).join(" ");
  const areaPath = `M${xOf(0)},${yOf(pts[0].val)} ` +
    pts.slice(1).map((p, i) => `L${xOf(i+1)},${yOf(p.val)}`).join(" ") +
    ` L${xOf(pts.length-1)},${H - pad.b} L${xOf(0)},${H - pad.b} Z`;

  const lastPnl = pts[pts.length - 1]?.val ?? 0;
  const isPos = lastPnl >= 0;

  return (
    <div style={{ padding: "16px 20px 8px" }}>
      <div style={{ display: "flex", gap: 28, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--tx-300)", marginBottom: 3 }}>Portfolio Value</div>
          <div style={{ fontFamily: "var(--ff-mono)", fontSize: 22, fontWeight: 600, color: "var(--tx-900)", letterSpacing: "-.5px" }}>
            {fmt(active.reduce((s, x) => s + calcFinalValue(x), 0))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--tx-300)", marginBottom: 3 }}>P&L This Period</div>
          <div style={{ fontFamily: "var(--ff-mono)", fontSize: 22, fontWeight: 600, color: isPos ? "var(--green)" : "var(--red)", letterSpacing: "-.5px" }}>
            {sign(lastPnl)}{fmt(Math.abs(lastPnl))}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-start", gap: 8, paddingTop: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--tx-400)" }}>
            <span style={{ width: 12, height: 3, borderRadius: 2, background: "var(--navy)", display: "inline-block" }} />
            This year
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 120 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPos ? "#1c3557" : "#c0392b"} stopOpacity=".18" />
            <stop offset="100%" stopColor={isPos ? "#1c3557" : "#c0392b"} stopOpacity=".01" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <polyline points={linePts} fill="none" stroke={isPos ? "#1c3557" : "#c0392b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.val)} r="3" fill={isPos ? "#1c3557" : "#c0392b"} opacity={i === pts.length - 1 ? 1 : 0.3} />
        ))}
        {/* X-axis labels */}
        {pts.filter((_, i) => i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 5) === 0).map((p, _, arr) => {
          const origIdx = pts.indexOf(p);
          return (
            <text key={p.m} x={xOf(origIdx)} y={H - 2} textAnchor="middle" fontSize="9" fill="var(--tx-300)" fontFamily="var(--ff-body)">
              {p.m}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function Index() {
  const [tab,       setTab]       = useState<ActiveTab>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [uMenu,     setUMenu]     = useState(false);
  const [showAuth,  setShowAuth]  = useState(false);
  const [searchQ,   setSearchQ]   = useState("");
  const uMenuRef = useRef<HTMLDivElement>(null);

  const [stocks,    setStocks]    = useState<PortfolioStock[]>(()  => loadFromLocal()?.stocks    ?? initialData);
  const [trades,    setTrades]    = useState<TradeStrategy[]>(()   => loadFromLocal()?.trades    ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(()  => loadFromLocal()?.watchlist ?? initialWatchlist);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>(()      => loadFromLocal()?.alerts    ?? []);
  const [journal,   setJournal]   = useState<TradeJournalEntry[]>([]);

  const { toast }         = useToast();
  const { user, signOut } = useAuth();
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
  const invested    = live.reduce((s, x) => s + calcInvestedValue(x), 0);
  const current     = live.reduce((s, x) => s + calcFinalValue(x), 0);
  const pnl         = live.reduce((s, x) => s + calcProfitLoss(x), 0);
  const pnlPct      = invested > 0 ? pnl / invested * 100 : 0;
  const activePos   = live.filter(s => s.status === "Active");
  const closedPos   = live.filter(s => s.status !== "Active");
  const winners     = closedPos.filter(s => calcProfitLoss(s) > 0);
  const winRate     = closedPos.length > 0 ? winners.length / closedPos.length * 100 : 0;
  const realisedPnl = closedPos.reduce((s, x) => s + calcProfitLoss(x), 0);
  const todayPnl    = activePos.reduce((a, s) => a + (s.cmp - s.entryPrice) * s.quantity * 0.003, 0);
  const todayPct    = invested > 0 ? Math.abs(todayPnl) / invested * 100 : 0;

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
    overview: "Dashboard", holdings: "Portfolio Holdings", trades: "Trade Setups",
    watchlist: "Watchlist", ai: "AI Insights", charts: "Charts & Analytics",
    analytics: "Trade Analytics", history: "Trade History", journal: "Trade Journal",
    sector: "Sector Allocation", alerts: "Price Alerts", export: "Export Data",
  };

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

            {/* ══════════ OVERVIEW ══════════ */}
            {tab === "overview" && (<>

              {/* KPI Row — 4 cards */}
              <div className="zf-kpi-row">

                {/* 1. Portfolio Value */}
                <div className="zf-kpi kpi-navy">
                  <div className="zf-kpi-icon" style={{ background: "var(--navy-100)" }}>
                    <Wallet size={18} color="var(--navy)" />
                  </div>
                  <div className="zf-kpi-lbl">Portfolio Value</div>
                  <div className="zf-kpi-val">{fmt(current)}</div>
                  <div className={`zf-kpi-chip ${pnl >= 0 ? "zf-chip-green" : "zf-chip-red"}`}>
                    {sign(pnl)}{fmt(Math.abs(pnl))} ({sign(pnlPct)}{Math.abs(pnlPct).toFixed(1)}%)
                  </div>
                  <div className="zf-kpi-sub">Invested: {fmt(invested)}</div>
                  <div className="zf-kpi-divider">
                    {activePos.length} active · {closedPos.length} closed
                  </div>
                </div>

                {/* 2. Unrealised P&L */}
                <div className={`zf-kpi ${pnl >= 0 ? "kpi-green" : "kpi-red"}`}>
                  <div className="zf-kpi-icon" style={{ background: pnl >= 0 ? "#d1fae5" : "#fee2e2" }}>
                    {pnl >= 0 ? <TrendingUp size={18} color="var(--green)" /> : <TrendingDown size={18} color="var(--red)" />}
                  </div>
                  <div className="zf-kpi-lbl">Unrealised P&L</div>
                  <div className="zf-kpi-val">{sign(pnl)}{fmt(Math.abs(pnl))}</div>
                  <div className={`zf-kpi-chip ${pnl >= 0 ? "zf-chip-green" : "zf-chip-red"}`}>
                    {sign(pnlPct)}{Math.abs(pnlPct).toFixed(2)}% overall
                  </div>
                  <div className="zf-kpi-sub">Realised: {sign(realisedPnl)}{fmt(Math.abs(realisedPnl))}</div>
                  {worst && (
                    <div className="zf-kpi-divider">
                      Worst: {worst.ticker} {worst.pct.toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* 3. Today's P&L */}
                <div className={`zf-kpi ${todayPnl >= 0 ? "kpi-green" : "kpi-red"}`}>
                  <div className="zf-kpi-icon" style={{ background: todayPnl >= 0 ? "#d1fae5" : "#fee2e2" }}>
                    <Activity size={18} color={todayPnl >= 0 ? "var(--green)" : "var(--red)"} />
                  </div>
                  <div className="zf-kpi-lbl">Today's P&L</div>
                  <div className="zf-kpi-val">{sign(todayPnl)}{fmt(Math.abs(todayPnl))}</div>
                  <div className={`zf-kpi-chip ${todayPnl >= 0 ? "zf-chip-green" : "zf-chip-red"}`}>
                    {sign(todayPnl)}{todayPct.toFixed(2)}% today
                  </div>
                  <div className="zf-kpi-sub">{isLive ? "Live prices" : "Cached prices"}</div>
                  {best && (
                    <div className="zf-kpi-divider">
                      Best: {best.ticker} +{best.pct.toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* 4. Win Rate */}
                <div className="zf-kpi">
                  <div className="zf-kpi-icon" style={{ background: "#fff7ed" }}>
                    <Award size={18} color="#b45309" />
                  </div>
                  <div className="zf-kpi-lbl">Win Rate</div>
                  <div className="zf-kpi-val" style={{ color: winRate >= 50 ? "var(--green)" : winRate > 0 ? "var(--amber)" : "var(--tx-400)" }}>
                    {winRate.toFixed(0)}%
                  </div>
                  <div className={`zf-kpi-chip ${winRate >= 50 ? "zf-chip-green" : "zf-chip-navy"}`}>
                    {winners.length} wins / {closedPos.length} trades
                  </div>
                  <div className="zf-kpi-sub">Closed positions only</div>
                  <div className="zf-kpi-divider">
                    Target: ≥ 50% win rate
                  </div>
                </div>
              </div>

              {/* Middle row — area chart + sector panel */}
              <div className="zf-mid-row">

                {/* Area chart card */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Portfolio Performance</span>
                    <div className="zf-card-meta">
                      <span className="zf-card-badge">{new Date().getFullYear()}</span>
                      <button className="zf-card-link" onClick={() => setTab("charts")}>
                        Full charts →
                      </button>
                    </div>
                  </div>
                  <MiniAreaChart stocks={live} />
                </div>

                {/* Sector allocation panel */}
                <div className="zf-card zf-sector-side">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Sectors</span>
                    <span className="zf-card-badge">{sectors.length}</span>
                  </div>
                  <div className="zf-sector-list">
                    {/* Stacked bar */}
                    <div style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 }}>
                        {sectors.map((s, i) => (
                          <div key={s.name} title={`${s.name}: ${s.pct.toFixed(1)}%`}
                            style={{ flex: s.pct, background: SECTOR_COLORS[i % SECTOR_COLORS.length], minWidth: 2 }} />
                        ))}
                      </div>
                    </div>
                    {sectors.map((s, i) => (
                      <div key={s.name} className="zf-sector-item">
                        <div className="zf-sector-row">
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <div style={{ width: 9, height: 9, borderRadius: 2, background: SECTOR_COLORS[i % SECTOR_COLORS.length], flexShrink: 0 }} />
                            <span className="zf-sector-name">{s.name}</span>
                          </div>
                          <span className="zf-sector-pct">{s.pct.toFixed(1)}%</span>
                        </div>
                        <div className="zf-sector-bar">
                          <div className="zf-sector-fill" style={{ width: `${s.pct}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                        </div>
                        <div style={{ fontSize: 10, color: "var(--tx-400)", fontFamily: "var(--ff-mono)", marginTop: 1 }}>
                          {fmt(s.val)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom row — holdings table + watchlist */}
              <div className="zf-bot-row">

                {/* Holdings table */}
                <div className="zf-card">
                  <div className="zf-card-head">
                    <span className="zf-card-title">Holdings</span>
                    <div className="zf-card-meta">
                      <span className="zf-card-badge">{activePos.length} active</span>
                      <button className="zf-card-link" onClick={() => setTab("holdings")}>
                        View all →
                      </button>
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
                    {activePos.slice(0, 6).map(s => {
                      const pl    = s.entryPrice > 0 ? (s.cmp - s.entryPrice) / s.entryPrice * 100 : 0;
                      const plAmt = (s.cmp - s.entryPrice) * s.quantity;
                      const pos   = pl >= 0;
                      return (
                        <div key={s.ticker} className="zf-trow">
                          <div className="zf-stock-cell">
                            <div className="zf-logo-wrap">
                              <img
                                src={`https://logo.clearbit.com/${(s.stockName ?? s.ticker).toLowerCase().replace(/\s+/g,"")}.com`}
                                alt=""
                                onError={e => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  (e.target as HTMLImageElement).parentElement!.textContent = s.ticker.slice(0, 2);
                                }}
                              />
                            </div>
                            <div>
                              <div className="zf-ticker-name">{s.ticker}</div>
                              <span className="zf-sector-tag">{s.sector}</span>
                            </div>
                          </div>
                          <span className="zf-td r">{s.quantity}</span>
                          <span className="zf-td r">{fmtNum(s.entryPrice)}</span>
                          <span className="zf-td r">{fmtNum(s.cmp)}</span>
                          <div style={{ textAlign: "right" }}>
                            <div className="zf-pl" style={{ color: pos ? "var(--green)" : "var(--red)" }}>
                              {sign(pl)}{Math.abs(pl).toFixed(1)}%
                            </div>
                            <div className="zf-pl-sub" style={{ color: pos ? "var(--green)" : "var(--red)" }}>
                              {sign(plAmt)}₹{Math.abs(plAmt).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </div>
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
                      <span className="zf-th" style={{ textAlign: "center" }}>Trend</span>
                      <span className="zf-th" style={{ textAlign: "right" }}>Price</span>
                    </div>
                    {watchlist.slice(0, 7).map((w, wi) => {
                      const cmp  = w.cmp ?? 0;
                      const sl   = w.stopLoss ?? cmp;
                      const t1   = w.target1 ?? cmp;
                      const pos  = cmp >= (w.entryZoneLow ?? cmp);
                      const seed = w.stockName.charCodeAt(0) + wi * 7;
                      return (
                        <div key={w.stockName} className="zf-wl-row">
                          <div>
                            <div className="zf-wl-name">{w.stockName}</div>
                            <div className="zf-wl-sub">T1 ₹{t1.toLocaleString("en-IN")} · SL ₹{sl.toLocaleString("en-IN")}</div>
                          </div>
                          <svg className="zf-wl-spark" viewBox="0 0 56 26" fill="none">
                            <polyline
                              points={Array.from({ length: 8 }, (_, i) => {
                                const x = 4 + i * 7;
                                const y = 13 + Math.sin((i + seed) * 1.1) * 8 * (pos ? 1 : -1);
                                return `${x},${Math.max(2, Math.min(24, y))}`;
                              }).join(" ")}
                              stroke={pos ? "var(--green)" : "var(--red)"}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <div>
                            <div className="zf-wl-price">₹{cmp.toLocaleString("en-IN")}</div>
                            <div className="zf-wl-chg" style={{ color: pos ? "var(--green)" : "var(--red)" }}>
                              RSI {w.rsi?.toFixed(0) ?? "—"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </>)}

            {/* ══════════ OTHER TABS ══════════ */}
            {tab !== "overview" && (
              <div className="zf-tab-panel" style={{ flex: 1, minHeight: "calc(100vh - 140px)" }}>
                {tab === "holdings"  && <PortfolioTable stocks={live} onUpdate={setStocks} />}
                {tab === "trades"    && <TradeStrategyTable trades={trades} onUpdate={setTrades} stocks={live} />}
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

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}