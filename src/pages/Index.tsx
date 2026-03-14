import { useState } from "react";
import {
  LayoutDashboard, TrendingUp, ScrollText, Eye,
  Brain, History, BarChart3, Bell,
  RefreshCw, LogOut, Settings,
  PieChart, Zap, Search
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

// ─── Types ───────────────────────────────────────────────────────────────────
type ActiveTab =
  | "overview" | "holdings" | "trades" | "watchlist" | "ai"
  | "charts" | "risk" | "analytics" | "history" | "journal"
  | "sector" | "alerts" | "export";

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",   label: "Overview",    icon: LayoutDashboard, group: "PORTFOLIO" },
  { id: "holdings",   label: "Holdings",    icon: TrendingUp,      group: "PORTFOLIO" },
  { id: "trades",     label: "Trades",      icon: ScrollText,      group: "PORTFOLIO" },
  { id: "history",    label: "History",     icon: History,         group: "PORTFOLIO" },
  { id: "watchlist",  label: "Watchlist",   icon: Eye,             group: "RESEARCH"  },
  { id: "charts",     label: "Analytics",   icon: BarChart3,       group: "RESEARCH"  },
  { id: "sector",     label: "Sectors",     icon: PieChart,        group: "RESEARCH"  },
  { id: "ai",         label: "AI Insights", icon: Brain,           group: "TOOLS"     },
  { id: "alerts",     label: "Alerts",      icon: Bell,            group: "TOOLS"     },
  { id: "export",     label: "Export",      icon: Zap,             group: "TOOLS"     },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.abs(n).toFixed(0)}`;
}

// ─── All CSS in one string ────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  /* ── Reset scoped to .wc ── */
  .wc *, .wc *::before, .wc *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ════════════════════════════════════════════════════
     DESIGN TOKENS — Warm Cream + Deep Navy
  ════════════════════════════════════════════════════ */
  .wc {
    /* Backgrounds */
    --bg-page:      #f5efe4;
    --bg-canvas:    #ede5d6;
    --bg-surface:   #faf6ef;
    --bg-card:      #fdfaf4;
    --bg-hover:     #f7f1e6;

    /* Navy accent */
    --navy:         #1c3557;
    --navy-mid:     #2a4a70;
    --navy-soft:    #3b5f88;
    --navy-pale:    #e8f0f8;
    --navy-tint:    rgba(28,53,87,.08);

    /* Text */
    --tx-hi:        #111827;
    --tx-med:       #5c4f3a;
    --tx-lo:        #9c8f7a;
    --tx-ghost:     #c4b49a;
    --tx-navy:      #1c3557;
    --tx-navy-dim:  rgba(28,53,87,.55);

    /* Borders */
    --bd-strong:    #ddd4c0;
    --bd-mid:       #e8e0d0;
    --bd-soft:      #f0e8dc;
    --bd-navy:      rgba(28,53,87,.15);

    /* Profit / Loss */
    --profit:       #166534;
    --profit-bg:    #f0fdf4;
    --profit-bd:    #bbf7d0;
    --loss:         #991b1b;
    --loss-bg:      #fff1f2;
    --loss-bd:      #fecdd3;

    /* Shadows */
    --sh-sm:   0 1px 3px rgba(120,80,20,.08), 0 1px 2px rgba(120,80,20,.05);
    --sh-md:   0 4px 12px rgba(120,80,20,.10), 0 2px 6px rgba(120,80,20,.06);
    --sh-lg:   0 8px 24px rgba(120,80,20,.12), 0 4px 10px rgba(120,80,20,.07);
    --sh-navy: 0 2px 10px rgba(28,53,87,.18);

    /* Type */
    --ff-body: 'DM Sans', -apple-system, sans-serif;
    --ff-mono: 'DM Mono', 'SF Mono', monospace;
    --ff-disp: 'DM Serif Display', Georgia, serif;

    font-family: var(--ff-body);
    background: var(--bg-canvas);
    min-height: 100vh;
    color: var(--tx-hi);
    display: flex;
    overflow: hidden;
  }

  /* ════════════════════════════════════════════════════
     SIDEBAR
  ════════════════════════════════════════════════════ */
  .wc-side {
    width: 220px;
    flex-shrink: 0;
    background: var(--bg-card);
    border-right: 1px solid var(--bd-strong);
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-shadow: 2px 0 12px rgba(120,80,20,.06);
    z-index: 20;
  }

  /* Brand */
  .wc-brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 22px 20px 20px;
    border-bottom: 1px solid var(--bd-mid);
  }
  .wc-logo {
    width: 34px; height: 34px;
    border-radius: 10px;
    background: var(--navy);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    box-shadow: var(--sh-navy);
  }
  .wc-brandname {
    font-family: var(--ff-disp);
    font-size: 18px;
    color: var(--navy);
    letter-spacing: -.2px;
    line-height: 1;
  }
  .wc-brandsub {
    font-size: 10px;
    color: var(--tx-lo);
    margin-top: 2px;
    font-weight: 500;
    letter-spacing: .03em;
  }

  /* Nav groups */
  .wc-nav-wrap {
    flex: 1;
    overflow-y: auto;
    padding: 12px 10px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .wc-nav-wrap::-webkit-scrollbar { width: 3px; }
  .wc-nav-wrap::-webkit-scrollbar-thumb { background: var(--bd-strong); border-radius: 3px; }

  .wc-nav-grp {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--tx-ghost);
    padding: 12px 10px 4px;
  }
  .wc-nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 9px;
    font-size: 12.5px;
    font-weight: 400;
    color: var(--tx-med);
    cursor: pointer;
    transition: all .14s ease;
    border: 1px solid transparent;
    position: relative;
  }
  .wc-nav-item svg { width: 14px; height: 14px; flex-shrink: 0; opacity: .75; }
  .wc-nav-item:hover {
    background: var(--bg-hover);
    color: var(--tx-navy);
    border-color: var(--bd-soft);
  }
  .wc-nav-item:hover svg { opacity: 1; }
  .wc-nav-item.on {
    background: var(--navy-pale);
    color: var(--navy);
    font-weight: 600;
    border-color: var(--bd-navy);
    box-shadow: var(--sh-sm);
  }
  .wc-nav-item.on svg { opacity: 1; }
  .wc-nav-item.on::before {
    content: '';
    position: absolute;
    left: 0; top: 20%; bottom: 20%;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--navy);
  }

  /* Sidebar footer */
  .wc-side-foot {
    padding: 14px 16px;
    border-top: 1px solid var(--bd-mid);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wc-user-info { display: flex; flex-direction: column; gap: 1px; }
  .wc-user-name { font-size: 12px; font-weight: 600; color: var(--tx-hi); }
  .wc-user-role { font-size: 10px; color: var(--tx-lo); }

  /* ════════════════════════════════════════════════════
     MAIN AREA
  ════════════════════════════════════════════════════ */
  .wc-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    min-width: 0;
  }

  /* ── Top bar ── */
  .wc-top {
    background: var(--bg-card);
    border-bottom: 1px solid var(--bd-strong);
    padding: 0 24px;
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    box-shadow: 0 1px 6px rgba(120,80,20,.06);
  }

  /* Breadcrumb + tabs */
  .wc-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--bg-canvas);
    border-radius: 10px;
    padding: 3px;
    border: 1px solid var(--bd-mid);
  }
  .wc-tab {
    font-size: 12px;
    padding: 5px 16px;
    border-radius: 7px;
    cursor: pointer;
    color: var(--tx-lo);
    font-weight: 500;
    transition: all .14s;
    background: transparent;
    border: none;
    white-space: nowrap;
  }
  .wc-tab:hover { color: var(--tx-navy); background: var(--bg-hover); }
  .wc-tab.on {
    background: var(--bg-card);
    color: var(--navy);
    font-weight: 600;
    box-shadow: var(--sh-sm);
    border: 1px solid var(--bd-mid);
  }

  /* Right controls */
  .wc-ctrl {
    display: flex; align-items: center; gap: 10px;
  }
  .wc-live {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600;
    padding: 5px 13px;
    border-radius: 20px;
    background: var(--profit-bg);
    border: 1px solid var(--profit-bd);
    color: var(--profit);
    letter-spacing: .01em;
  }
  .wc-ldot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 2px rgba(34,197,94,.2);
    animation: wc-pulse 2.2s ease infinite;
  }
  @keyframes wc-pulse {
    0%,100% { box-shadow: 0 0 0 2px rgba(34,197,94,.2); }
    50%      { box-shadow: 0 0 0 5px rgba(34,197,94,.08); }
  }
  .wc-ibtn {
    width: 34px; height: 34px;
    border-radius: 9px;
    background: var(--bg-canvas);
    border: 1px solid var(--bd-strong);
    color: var(--tx-lo);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: all .14s;
  }
  .wc-ibtn:hover {
    background: var(--navy-pale);
    border-color: var(--bd-navy);
    color: var(--navy);
  }
  .wc-time {
    font-size: 11px;
    font-family: var(--ff-mono);
    color: var(--tx-lo);
    font-weight: 500;
  }

  /* ── Content area ── */
  .wc-content {
    flex: 1;
    overflow-y: auto;
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    background: var(--bg-page);
    min-height: 0;
  }
  .wc-content::-webkit-scrollbar { width: 5px; }
  .wc-content::-webkit-scrollbar-track { background: transparent; }
  .wc-content::-webkit-scrollbar-thumb { background: var(--bd-strong); border-radius: 5px; }

  /* ── Section heading ── */
  .wc-sec-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 2px;
  }
  .wc-sec-title {
    font-family: var(--ff-disp);
    font-size: 15px;
    color: var(--navy);
    letter-spacing: -.1px;
  }
  .wc-sec-sub {
    font-size: 11px;
    color: var(--tx-lo);
    font-weight: 500;
  }

  /* ════════════════════════════════════════════════════
     STAT CARDS — top row
  ════════════════════════════════════════════════════ */
  .wc-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }
  .wc-sc {
    background: var(--bg-card);
    border: 1px solid var(--bd-mid);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: var(--sh-md);
    transition: transform .18s ease, box-shadow .18s ease;
    position: relative;
    overflow: hidden;
  }
  .wc-sc:hover {
    transform: translateY(-2px);
    box-shadow: var(--sh-lg);
  }
  /* Subtle top stripe */
  .wc-sc::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 14px 14px 0 0;
    background: linear-gradient(90deg, transparent 15%, rgba(28,53,87,.12) 50%, transparent 85%);
  }
  .wc-sc-invest { border-top: 3px solid var(--navy); }
  .wc-sc-invest::after { display: none; }
  .wc-sc-profit {
    background: var(--profit-bg);
    border-color: var(--profit-bd);
  }
  .wc-sc-profit::after {
    background: linear-gradient(90deg, transparent 15%, rgba(22,101,52,.2) 50%, transparent 85%);
  }
  .wc-sc-loss {
    background: var(--loss-bg);
    border-color: var(--loss-bd);
  }
  .wc-sc-loss::after {
    background: linear-gradient(90deg, transparent 15%, rgba(153,27,27,.2) 50%, transparent 85%);
  }
  .wc-sc-lbl {
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--tx-lo);
    margin-bottom: 8px;
  }
  .wc-sc-val {
    font-family: var(--ff-mono);
    font-size: 26px;
    font-weight: 500;
    color: var(--tx-hi);
    line-height: 1;
    letter-spacing: -.5px;
  }
  .wc-sc-sub {
    font-size: 11px;
    font-weight: 600;
    margin-top: 6px;
  }
  .wc-sc-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    margin-top: 7px;
  }
  .wc-chip-profit { background: var(--profit-bg); color: var(--profit); border: 1px solid var(--profit-bd); }
  .wc-chip-loss   { background: var(--loss-bg);   color: var(--loss);   border: 1px solid var(--loss-bd);   }
  .wc-chip-neutral{ background: var(--navy-pale);  color: var(--navy);   border: 1px solid var(--bd-navy);   }

  /* ════════════════════════════════════════════════════
     PANELS — Holdings + Watchlist
  ════════════════════════════════════════════════════ */
  .wc-panels {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }
  .wc-panel {
    background: var(--bg-card);
    border: 1px solid var(--bd-mid);
    border-radius: 14px;
    box-shadow: var(--sh-md);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }
  .wc-panel-head {
    padding: 14px 20px;
    border-bottom: 1px solid var(--bd-soft);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    background: var(--bg-surface);
  }
  .wc-panel-title {
    font-family: var(--ff-disp);
    font-size: 14px;
    color: var(--navy);
    letter-spacing: -.1px;
  }
  .wc-panel-badge {
    font-size: 9.5px;
    font-weight: 700;
    color: var(--tx-navy-dim);
    background: var(--navy-pale);
    border: 1px solid var(--bd-navy);
    border-radius: 20px;
    padding: 2px 8px;
  }
  .wc-panel-act {
    font-size: 11px;
    font-weight: 600;
    color: var(--navy);
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 7px;
    background: var(--navy-pale);
    border: 1px solid var(--bd-navy);
    transition: all .13s;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .wc-panel-act:hover {
    background: var(--navy);
    color: white;
  }
  .wc-panel-body {
    padding: 0 20px 14px;
    overflow-y: auto;
    flex: 1;
  }
  .wc-panel-body::-webkit-scrollbar { width: 3px; }
  .wc-panel-body::-webkit-scrollbar-thumb { background: var(--bd-strong); border-radius: 3px; }

  /* ── Holdings table ── */
  .wc-tbl-head {
    display: grid;
    grid-template-columns: 1.8fr .6fr 1fr 1fr .85fr;
    gap: 8px;
    padding: 10px 0 6px;
    border-bottom: 1px solid var(--bd-mid);
    position: sticky;
    top: 0;
    background: var(--bg-card);
    z-index: 1;
  }
  .wc-th {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--tx-ghost);
  }
  .wc-tr {
    display: grid;
    grid-template-columns: 1.8fr .6fr 1fr 1fr .85fr;
    gap: 8px;
    padding: 10px 0;
    align-items: center;
    border-bottom: 1px solid var(--bd-soft);
    transition: background .12s;
    margin: 0 -20px;
    padding-left: 20px;
    padding-right: 20px;
  }
  .wc-tr:hover { background: var(--bg-hover); }
  .wc-tr:last-child { border-bottom: none; }
  .wc-ticker { font-size: 13px; font-weight: 700; color: var(--tx-hi); }
  .wc-sector { font-size: 10px; color: var(--tx-lo); margin-top: 2px; font-weight: 500; }
  .wc-td {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--tx-med);
    font-weight: 500;
  }
  .wc-pl {
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 700;
  }

  /* ── Sector chip badges ── */
  .wc-sect-tag {
    display: inline-block;
    font-size: 9px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-canvas);
    border: 1px solid var(--bd-mid);
    color: var(--tx-lo);
    margin-top: 3px;
  }

  /* ── Watchlist rows ── */
  .wc-wr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--bd-soft);
    transition: background .12s;
    margin: 0 -20px;
    padding-left: 20px;
    padding-right: 20px;
  }
  .wc-wr:hover { background: var(--bg-hover); }
  .wc-wr:last-child { border-bottom: none; }
  .wc-wname { font-size: 13px; font-weight: 700; color: var(--tx-hi); }
  .wc-wsect { font-size: 10px; color: var(--tx-lo); margin-top: 2px; font-weight: 500; }
  .wc-wprice {
    font-family: var(--ff-mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--tx-hi);
    text-align: right;
  }
  .wc-wchg { font-size: 11px; font-weight: 700; text-align: right; margin-top: 2px; }

  /* ── Mini sparkline placeholder ── */
  .wc-spark {
    width: 52px; height: 24px;
    flex-shrink: 0;
    margin: 0 12px;
    opacity: .6;
  }

  /* ════════════════════════════════════════════════════
     CONTENT PANEL — non-overview tabs
  ════════════════════════════════════════════════════ */
  .wc-ctnr {
    background: var(--bg-card);
    border: 1px solid var(--bd-mid);
    border-radius: 14px;
    box-shadow: var(--sh-md);
    flex: 1;
    overflow: auto;
    padding: 22px;
    min-height: 0;
  }

  /* ════════════════════════════════════════════════════
     USER MENU DROPDOWN
  ════════════════════════════════════════════════════ */
  .wc-umenu {
    position: absolute;
    right: 0; top: calc(100% + 8px);
    background: var(--bg-card);
    border: 1px solid var(--bd-strong);
    border-radius: 12px;
    box-shadow: var(--sh-lg);
    min-width: 180px;
    z-index: 100;
    overflow: hidden;
  }
  .wc-umenu-head {
    padding: 12px 14px;
    border-bottom: 1px solid var(--bd-soft);
    background: var(--bg-surface);
  }
  .wc-umenu-email {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--tx-hi);
  }
  .wc-umenu-label {
    font-size: 9.5px;
    color: var(--tx-lo);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .05em;
    margin-bottom: 2px;
  }
  .wc-umenu-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: transparent;
    transition: background .12s;
  }
  .wc-umenu-btn:hover { background: var(--bg-hover); }
  .wc-umenu-btn.danger { color: var(--loss); }
  .wc-umenu-btn.primary { color: var(--navy); }

  /* ════════════════════════════════════════════════════
     RESPONSIVE
  ════════════════════════════════════════════════════ */
  @media (max-width: 900px) {
    .wc-side { width: 64px; }
    .wc-brandname, .wc-brandsub, .wc-nav-grp, .wc-nav-item span,
    .wc-user-info { display: none; }
    .wc-nav-item { justify-content: center; padding: 10px; }
    .wc-nav-item::before { display: none; }
    .wc-stats { grid-template-columns: repeat(2,1fr); }
    .wc-panels { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .wc-tabs { display: none; }
    .wc-stats { grid-template-columns: 1fr 1fr; }
  }

  @keyframes wc-spin { to { transform: rotate(360deg); } }
  .wc-spin { animation: wc-spin .9s linear infinite; }
`;

// ═════════════════════════════════════════════════════════════════════════════
export default function Index() {
  const [tab, setTab]     = useState<ActiveTab>("overview");
  const [uMenu, setUMenu] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [stocks,    setStocks]    = useState<PortfolioStock[]>(()  => loadFromLocal()?.stocks    ?? initialData);
  const [trades,    setTrades]    = useState<TradeStrategy[]>(()   => loadFromLocal()?.trades    ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(()  => loadFromLocal()?.watchlist ?? initialWatchlist);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>(()      => loadFromLocal()?.alerts    ?? []);
  const [journal,   setJournal]   = useState<TradeJournalEntry[]>([]);

  const { toast }         = useToast();
  const { user, signOut } = useAuth();
  const { prices, isLive, refresh } = useLivePrices(stocks);
  usePortfolioSync({ stocks, trades, watchlist, alerts, setStocks, setTrades, setWatchlist, setAlerts });

  // Merge live prices
  const live = stocks.map(s => prices[s.ticker] ? { ...s, cmp: prices[s.ticker] } : s);

  // Metrics
  const invested  = calcInvestedValue(live);
  const current   = calcFinalValue(live);
  const pnl       = calcProfitLoss(live);
  const pnlPct    = invested > 0 ? (pnl / invested * 100) : 0;
  const activePos = live.filter(s => s.status === "Active");
  const todayPnl  = activePos.reduce((a, s) => a + (s.cmp - s.entryPrice) * s.quantity * 0.003, 0);
  const todayPct  = invested > 0 ? (Math.abs(todayPnl) / invested * 100) : 0;

  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // Stat cards config
  const cards = [
    {
      lbl: "INVESTED",
      val: fmt(invested),
      sub: `${activePos.length} active positions`,
      subC: "var(--tx-lo)",
      chip: null,
      cls: "wc-sc wc-sc-invest",
    },
    {
      lbl: "CURRENT VALUE",
      val: fmt(current),
      sub: `+${fmt(current - invested)} unrealised`,
      subC: "var(--profit)",
      chip: null,
      cls: "wc-sc",
    },
    {
      lbl: "UNREALISED P&L",
      val: (pnl >= 0 ? "+" : "−") + fmt(Math.abs(pnl)),
      sub: `${pnl >= 0 ? "+" : "−"}${Math.abs(pnlPct).toFixed(1)}% overall`,
      subC: pnl >= 0 ? "var(--profit)" : "var(--loss)",
      chip: { label: pnl >= 0 ? `+${pnlPct.toFixed(1)}%` : `${pnlPct.toFixed(1)}%`, type: pnl >= 0 ? "profit" : "loss" },
      cls: `wc-sc ${pnl >= 0 ? "wc-sc-profit" : "wc-sc-loss"}`,
    },
    {
      lbl: "TODAY'S P&L",
      val: (todayPnl >= 0 ? "+" : "−") + fmt(Math.abs(todayPnl)),
      sub: `${todayPnl >= 0 ? "+" : "−"}${todayPct.toFixed(2)}% today`,
      subC: todayPnl >= 0 ? "var(--profit)" : "var(--loss)",
      chip: { label: todayPnl >= 0 ? `+${todayPct.toFixed(2)}%` : `−${todayPct.toFixed(2)}%`, type: todayPnl >= 0 ? "profit" : "loss" },
      cls: `wc-sc ${todayPnl >= 0 ? "wc-sc-profit" : "wc-sc-loss"}`,
    },
  ];

  return (
    <>
      <style>{CSS}</style>

      <div className="wc">
        {/* ── SIDEBAR ── */}
        <aside className="wc-side">
          {/* Brand */}
          <div className="wc-brand">
            <div className="wc-logo">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M2 14L6 5L11 11L13.5 8L16 14H2Z" fill="white" />
              </svg>
            </div>
            <div>
              <div className="wc-brandname">ZenFolio</div>
              <div className="wc-brandsub">Portfolio Tracker</div>
            </div>
          </div>

          {/* Nav */}
          <div className="wc-nav-wrap">
            {Array.from(new Set(NAV.map(n => n.group))).map(grp => (
              <div key={grp}>
                <div className="wc-nav-grp">{grp}</div>
                {NAV.filter(n => n.group === grp).map(({ id, label, icon: Icon }) => (
                  <div
                    key={id}
                    className={`wc-nav-item${tab === id ? " on" : ""}`}
                    onClick={() => setTab(id as ActiveTab)}
                  >
                    <Icon strokeWidth={1.8} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="wc-side-foot">
            <div className="wc-user-info">
              <div className="wc-user-name">{user?.email?.split("@")[0] ?? "Guest"}</div>
              <div className="wc-user-role">Portfolio Owner</div>
            </div>
            <button className="wc-ibtn" onClick={() => user ? signOut() : setShowAuth(true)} title={user ? "Sign out" : "Sign in"}>
              <LogOut size={14} />
            </button>
          </div>
        </aside>

        {/* ── MAIN ── */}
        <div className="wc-main">
          {/* Topbar */}
          <header className="wc-top">
            {/* Tab switcher */}
            <div className="wc-tabs">
              {(["overview","holdings","trades","watchlist","ai"] as ActiveTab[]).map(t => (
                <button
                  key={t}
                  className={`wc-tab${tab === t ? " on" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t === "ai" ? "AI" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="wc-ctrl">
              <span className="wc-time">{now} IST</span>
              <div className="wc-live">
                <div className="wc-ldot" />
                NSE {isLive ? "Live" : "Cached"}
              </div>
              <button className="wc-ibtn" onClick={refresh} title="Refresh prices">
                <RefreshCw size={14} className={!isLive ? "wc-spin" : ""} />
              </button>
              <div style={{ position: "relative" }}>
                <button className="wc-ibtn" onClick={() => setUMenu(p => !p)} title="Account">
                  <Settings size={14} />
                </button>
                {uMenu && (
                  <div className="wc-umenu">
                    <div className="wc-umenu-head">
                      <div className="wc-umenu-label">Signed in as</div>
                      <div className="wc-umenu-email">{user?.email ?? "Not signed in"}</div>
                    </div>
                    {user ? (
                      <button className="wc-umenu-btn danger" onClick={() => { signOut(); setUMenu(false); }}>
                        <LogOut size={13} /> Sign out
                      </button>
                    ) : (
                      <button className="wc-umenu-btn primary" onClick={() => { setShowAuth(true); setUMenu(false); }}>
                        <LogOut size={13} /> Sign in
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="wc-content">

            {/* ── OVERVIEW ── */}
            {tab === "overview" && (
              <>
                {/* Stat cards */}
                <div>
                  <div className="wc-sec-head">
                    <span className="wc-sec-title">Portfolio Summary</span>
                    <span className="wc-sec-sub">as of {now} IST</span>
                  </div>
                  <div className="wc-stats">
                    {cards.map((c, i) => (
                      <div key={i} className={c.cls}>
                        <div className="wc-sc-lbl">{c.lbl}</div>
                        <div className="wc-sc-val" style={{ color: i >= 2 ? c.subC : undefined }}>
                          {c.val}
                        </div>
                        {c.chip ? (
                          <span className={`wc-sc-chip wc-chip-${c.chip.type}`}>
                            {c.chip.label}
                          </span>
                        ) : (
                          <div className="wc-sc-sub" style={{ color: c.subC }}>{c.sub}</div>
                        )}
                        {c.chip && (
                          <div style={{ fontSize: 10, color: "var(--tx-lo)", marginTop: 3, fontWeight: 500 }}>{c.sub}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Holdings + Watchlist */}
                <div className="wc-panels" style={{ flex: 1 }}>
                  {/* Holdings */}
                  <div className="wc-panel">
                    <div className="wc-panel-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="wc-panel-title">Holdings</span>
                        <span className="wc-panel-badge">{activePos.length} active</span>
                      </div>
                      <button className="wc-panel-act" onClick={() => setTab("holdings")}>
                        View all →
                      </button>
                    </div>
                    <div className="wc-panel-body">
                      <div className="wc-tbl-head">
                        {["TICKER", "QTY", "AVG", "CMP", "P&L"].map(h => (
                          <span key={h} className="wc-th">{h}</span>
                        ))}
                      </div>
                      {activePos.slice(0, 7).map(s => {
                        const pl  = (s.cmp - s.entryPrice) / s.entryPrice * 100;
                        const pos = pl >= 0;
                        return (
                          <div key={s.ticker} className="wc-tr">
                            <div>
                              <div className="wc-ticker">{s.ticker}</div>
                              <span className="wc-sect-tag">{s.sector}</span>
                            </div>
                            <span className="wc-td">{s.quantity}</span>
                            <span className="wc-td">{s.entryPrice.toLocaleString("en-IN")}</span>
                            <span className="wc-td">{s.cmp.toLocaleString("en-IN")}</span>
                            <span className="wc-pl" style={{ color: pos ? "var(--profit)" : "var(--loss)" }}>
                              {pos ? "+" : "−"}{Math.abs(pl).toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Watchlist */}
                  <div className="wc-panel">
                    <div className="wc-panel-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="wc-panel-title">Watchlist</span>
                        <span className="wc-panel-badge">{watchlist.length} stocks</span>
                      </div>
                      <button className="wc-panel-act" onClick={() => setTab("watchlist")}>
                        + Add
                      </button>
                    </div>
                    <div className="wc-panel-body">
                      {watchlist.slice(0, 8).map(w => {
                        const chg = w.change ?? 0;
                        const pos = chg >= 0;
                        return (
                          <div key={w.ticker} className="wc-wr">
                            <div>
                              <div className="wc-wname">{w.ticker}</div>
                              <div className="wc-wsect">{w.sector}</div>
                            </div>
                            {/* Mini sparkline SVG */}
                            <svg className="wc-spark" viewBox="0 0 52 24" fill="none">
                              <polyline
                                points={Array.from({ length: 8 }, (_, i) => {
                                  const x = i * 7.5;
                                  const y = 12 + Math.sin((i + w.ticker.charCodeAt(0)) * 0.8) * 8 * (pos ? 1 : -1);
                                  return `${x},${y}`;
                                }).join(" ")}
                                stroke={pos ? "#16a34a" : "#991b1b"}
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <div style={{ textAlign: "right" }}>
                              <div className="wc-wprice">₹{(w.cmp ?? w.targetPrice ?? 0).toLocaleString("en-IN")}</div>
                              <div className="wc-wchg" style={{ color: pos ? "var(--profit)" : "var(--loss)" }}>
                                {pos ? "+" : "−"}{Math.abs(chg).toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── OTHER TABS ── */}
            {tab !== "overview" && (
              <div className="wc-ctnr">
                {tab === "holdings"  && <PortfolioTable stocks={live} onUpdate={setStocks} />}
                {tab === "trades"    && <TradeStrategyTable trades={trades} onUpdate={setTrades} stocks={live} />}
                {tab === "watchlist" && <WatchlistTable watchlist={watchlist} onUpdate={setWatchlist} />}
                {tab === "charts"    && <PortfolioCharts stocks={live} />}
                {tab === "risk"      && <RiskAnalysis stocks={live} />}
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