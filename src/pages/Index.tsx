import { useState, useEffect } from "react";
import {
  LayoutDashboard, TrendingUp, ScrollText, Eye,
  Brain, History, BarChart3, Bell,
  RefreshCw, Sun, Moon, LogOut, Settings,
  PieChart, Zap
} from "lucide-react";
import {
  portfolioData as initialData, PortfolioStock,
  tradeStrategies as initialTrades, TradeStrategy,
  watchlistData as initialWatchlist, WatchlistStock,
  PriceAlert, TradeJournalEntry,
  calcInvestedValue, calcFinalValue, calcProfitLoss, getTradeAnalytics
} from "@/data/sampleData";
import PortfolioTable from "@/components/PortfolioTable";
import TradeStrategyTable from "@/components/TradeStrategyTable";
import WatchlistTable from "@/components/WatchlistTable";
import PortfolioCharts from "@/components/PortfolioCharts";
import RiskAnalysis from "@/components/RiskAnalysis";
import TradeAnalytics from "@/components/TradeAnalytics";
import TradeHistory from "@/components/TradeHistory";
import TradeJournal from "@/components/TradeJournal";
import SectorDiversification from "@/components/SectorDiversification";
import PriceAlerts from "@/components/PriceAlerts";
import AIInsights from "@/components/AIInsights";
import ExportPortfolio from "@/components/ExportPortfolio";
import AuthModal from "@/components/AuthModal";
import { useToast } from "@/hooks/use-toast";
import { useLivePrices } from "@/hooks/useLivePrices";
import { usePortfolioSync, loadFromLocal } from "@/hooks/usePortfolioSync";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────
type Theme = "light" | "dark";
type ActiveTab =
  | "overview" | "holdings" | "trades" | "watchlist" | "ai"
  | "charts" | "risk" | "analytics" | "history" | "journal"
  | "sector" | "alerts" | "export";

// ─── Nav config ──────────────────────────────────────────────────────────
const NAV = [
  { id: "overview",   label: "Overview",    icon: LayoutDashboard, group: "PORTFOLIO" },
  { id: "holdings",   label: "Holdings",    icon: TrendingUp,       group: "PORTFOLIO" },
  { id: "trades",     label: "Trades",      icon: ScrollText,       group: "PORTFOLIO" },
  { id: "history",    label: "History",     icon: History,          group: "PORTFOLIO" },
  { id: "watchlist",  label: "Watchlist",   icon: Eye,              group: "RESEARCH"  },
  { id: "charts",     label: "Analytics",   icon: BarChart3,        group: "RESEARCH"  },
  { id: "sector",     label: "Sectors",     icon: PieChart,         group: "RESEARCH"  },
  { id: "ai",         label: "AI Insights", icon: Brain,            group: "TOOLS"     },
  { id: "alerts",     label: "Alerts",      icon: Bell,             group: "TOOLS"     },
  { id: "export",     label: "Export",      icon: Zap,              group: "TOOLS"     },
];

function fmt(n: number) {
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
const CSS = `
/* ─── CSS Variables by theme ─────────────────────────────────────── */
.zf[data-theme="light"] {
  --bg: linear-gradient(145deg,#fef3c7 0%,#fde68a 15%,#fbcfe8 45%,#c4b5fd 72%,#a5f3fc 100%);
  --orb-1: rgba(251,207,232,.7);
  --orb-2: rgba(196,181,253,.55);
  --orb-3: rgba(165,243,252,.5);
  --glass-top:     rgba(255,255,255,.32);
  --glass-side:    rgba(255,255,255,.26);
  --glass-card:    rgba(255,255,255,.44);
  --glass-panel:   rgba(255,255,255,.36);
  --glass-nav-act: rgba(255,255,255,.62);
  --glass-tab-act: rgba(255,255,255,.7);
  --glass-tabs-bg: rgba(0,0,0,.06);
  --border:        rgba(255,255,255,.65);
  --border-sub:    rgba(255,255,255,.4);
  --border-row:    rgba(180,140,255,.12);
  --shine:         linear-gradient(90deg,transparent 10%,rgba(255,255,255,.65) 50%,transparent 90%);
  --text-hi:    #1e1b4b;
  --text-med:   rgba(79,51,140,.58);
  --text-lo:    rgba(79,51,140,.38);
  --text-label: rgba(79,51,140,.48);
  --text-accent:#4c1d95;
  --nav-hi:    rgba(79,51,140,.4);
  --nav-sec:   rgba(99,76,150,.4);
  --tab-hi:    rgba(30,27,75,.4);
  --shadow-top:   0 2px 24px rgba(0,0,0,.07),inset 0 1px 0 rgba(255,255,255,.85);
  --shadow-card:  0 4px 20px rgba(0,0,0,.08),inset 0 1px 0 rgba(255,255,255,.9);
  --shadow-panel: 0 8px 36px rgba(0,0,0,.09),inset 0 1px 0 rgba(255,255,255,.8);
}
.zf[data-theme="dark"] {
  --bg: linear-gradient(145deg,#07050f 0%,#0c0520 22%,#050d1e 52%,#090020 78%,#030a15 100%);
  --orb-1: rgba(139,92,246,.22);
  --orb-2: rgba(6,182,212,.17);
  --orb-3: rgba(236,72,153,.11);
  --glass-top:     rgba(255,255,255,.06);
  --glass-side:    rgba(255,255,255,.045);
  --glass-card:    rgba(255,255,255,.058);
  --glass-panel:   rgba(255,255,255,.05);
  --glass-nav-act: rgba(139,92,246,.2);
  --glass-tab-act: rgba(255,255,255,.13);
  --glass-tabs-bg: rgba(255,255,255,.06);
  --border:        rgba(255,255,255,.1);
  --border-sub:    rgba(255,255,255,.07);
  --border-row:    rgba(139,92,246,.08);
  --shine:         linear-gradient(90deg,transparent 10%,rgba(255,255,255,.1) 50%,transparent 90%);
  --text-hi:    #ede9fe;
  --text-med:   rgba(196,181,253,.6);
  --text-lo:    rgba(167,139,250,.35);
  --text-label: rgba(167,139,250,.42);
  --text-accent:#a78bfa;
  --nav-hi:    rgba(167,139,250,.34);
  --nav-sec:   rgba(139,92,246,.3);
  --tab-hi:    rgba(200,185,255,.32);
  --shadow-top:   0 2px 24px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.07);
  --shadow-card:  0 4px 24px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.055);
  --shadow-panel: 0 8px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.055);
}

/* ─── Root ─────────────────────────────────────────────────────────── */
.zf {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
  min-height: 100vh;
  position: relative;
  overflow: hidden;
}
.zf-bg {
  position: absolute; inset: 0;
  background: var(--bg); z-index: 0;
}
.zf-orb {
  position: absolute; border-radius: 50%;
  pointer-events: none; z-index: 1;
}
.zf-shell {
  position: relative; z-index: 10;
  display: flex; flex-direction: column;
  height: 100vh; padding: 10px; gap: 10px;
}

/* ─── Glass base ───────────────────────────────────────────────────── */
.glass {
  backdrop-filter: blur(28px) saturate(175%);
  -webkit-backdrop-filter: blur(28px) saturate(175%);
}
.glass-shine::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 1px;
  background: var(--shine); pointer-events: none;
}

/* ─── Topbar ───────────────────────────────────────────────────────── */
.zf-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 18px; border-radius: 16px; flex-shrink: 0;
  background: var(--glass-top); border: 1px solid var(--border);
  box-shadow: var(--shadow-top); position: relative; overflow: hidden;
}
.zf-brand { display: flex; align-items: center; gap: 10px; }
.zf-logo {
  width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg,#7c3aed,#2563eb);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 12px rgba(124,58,237,.45);
}
.zf-name { font-size: 15px; font-weight: 700; color: var(--text-hi); letter-spacing: -.3px; }
.zf-tabs {
  display: flex; gap: 1px; padding: 3px; border-radius: 10px;
  background: var(--glass-tabs-bg);
}
.zf-tab {
  font-size: 11px; padding: 5px 14px; border-radius: 7px; cursor: pointer;
  color: var(--tab-hi); font-weight: 400; transition: all .15s;
  background: transparent; border: none; white-space: nowrap;
}
.zf-tab:hover { color: var(--text-hi); }
.zf-tab.on {
  background: var(--glass-tab-act); color: var(--text-accent); font-weight: 600;
  border: .5px solid var(--border); box-shadow: 0 1px 6px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.5);
}
.zf[data-theme="dark"] .zf-tab.on {
  box-shadow: 0 1px 6px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08);
}
.zf-ctrl { display: flex; align-items: center; gap: 8px; }
.zf-pill {
  display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 500;
  padding: 5px 12px; border-radius: 20px; white-space: nowrap;
  background: rgba(220,252,231,.65); border: 1px solid rgba(134,239,172,.5); color: #15803d;
}
.zf[data-theme="dark"] .zf-pill {
  background: rgba(21,128,61,.2); border-color: rgba(74,222,128,.25); color: #4ade80;
}
.zf-dot {
  width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
  animation: zf-pulse 2s infinite;
}
@keyframes zf-pulse {
  0%,100% { box-shadow: 0 0 4px #22c55e; }
  50%      { box-shadow: 0 0 10px #22c55e; }
}
.zf-ibtn {
  width: 32px; height: 32px; border-radius: 8px;
  background: var(--glass-card); border: 1px solid var(--border-sub);
  color: var(--text-med); display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all .15s;
}
.zf-ibtn:hover { background: var(--glass-tab-act); color: var(--text-hi); }

/* ─── Body ─────────────────────────────────────────────────────────── */
.zf-body { display: flex; gap: 10px; flex: 1; overflow: hidden; min-height: 0; }

/* ─── Sidebar ──────────────────────────────────────────────────────── */
.zf-side {
  width: 172px; flex-shrink: 0; border-radius: 16px; overflow-y: auto;
  background: var(--glass-side); border: 1px solid var(--border);
  box-shadow: var(--shadow-panel); padding: 10px 8px;
  display: flex; flex-direction: column; gap: 1px; position: relative;
}
.zf-side::-webkit-scrollbar { width: 3px; }
.zf-side::-webkit-scrollbar-thumb { background: rgba(139,92,246,.2); border-radius: 3px; }
.zf-nav-sec {
  font-size: 9px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .08em; color: var(--nav-sec); padding: 10px 9px 3px;
}
.zf-nav {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px;
  border-radius: 9px; font-size: 11.5px; cursor: pointer;
  color: var(--nav-hi); transition: all .15s; border: .5px solid transparent;
}
.zf-nav svg { width: 13px; height: 13px; flex-shrink: 0; }
.zf-nav:hover { background: rgba(255,255,255,.2); color: var(--text-hi); }
.zf[data-theme="dark"] .zf-nav:hover { background: rgba(255,255,255,.08); }
.zf-nav.on {
  background: var(--glass-nav-act); color: var(--text-accent); font-weight: 600;
  border-color: var(--border-sub);
  box-shadow: 0 1px 6px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.6);
}
.zf[data-theme="dark"] .zf-nav.on {
  box-shadow: 0 1px 8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.07);
  border-color: rgba(167,139,250,.22);
}

/* ─── Main ─────────────────────────────────────────────────────────── */
.zf-main {
  flex: 1; display: flex; flex-direction: column; gap: 10px;
  overflow-y: auto; min-width: 0;
}
.zf-main::-webkit-scrollbar { width: 4px; }
.zf-main::-webkit-scrollbar-thumb { background: rgba(139,92,246,.25); border-radius: 4px; }

/* ─── Stat cards ───────────────────────────────────────────────────── */
.zf-stats {
  display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; flex-shrink: 0;
}
.zf-sc {
  border-radius: 14px; padding: 14px 15px; position: relative; overflow: hidden;
  transition: transform .18s ease;
}
.zf-sc:hover { transform: translateY(-2px); }
.zf-sc::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg,transparent 10%,rgba(255,255,255,.7) 50%,transparent 90%);
}
.zf-sc-base {
  background: var(--glass-card); border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}
.zf-sc-invest {
  background: var(--glass-card); border: 1px solid var(--border);
  border-left: 2.5px solid rgba(124,58,237,.55);
  box-shadow: var(--shadow-card);
}
.zf[data-theme="dark"] .zf-sc-invest { border-left-color: rgba(139,92,246,.6); }
.zf-sc-label {
  font-size: 9px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--text-label); margin-bottom: 6px; font-weight: 600;
}
.zf-sc-val {
  font-size: 24px; font-weight: 700; color: var(--text-hi);
  font-family: 'SF Mono','Fira Code',monospace; line-height: 1; letter-spacing: -.5px;
}
.zf-sc-sub { font-size: 10px; margin-top: 5px; font-weight: 600; }

/* ─── Panels ───────────────────────────────────────────────────────── */
.zf-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; flex: 1; min-height: 0; }
.zf-panel {
  border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; position: relative;
  background: var(--glass-panel); border: 1px solid var(--border); box-shadow: var(--shadow-panel);
}
.zf-panel::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; z-index: 2;
  background: var(--shine);
}
.zf-ph {
  padding: 11px 16px; display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border-sub); flex-shrink: 0;
}
.zf-pt { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--text-accent); }
.zf-pa { font-size: 9.5px; color: var(--text-lo); cursor: pointer; font-weight: 500; }
.zf-pb { padding: 8px 16px 12px; overflow-y: auto; flex: 1; }

/* ─── Table ────────────────────────────────────────────────────────── */
.zf-tr {
  display: grid; grid-template-columns: 1.7fr .5fr 1fr 1fr .75fr;
  gap: 6px; padding: 7px 0; align-items: center;
}
.zf-tr + .zf-tr { border-top: .5px solid var(--border-row); }
.zf-th { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-lo); font-weight: 600; }
.zf-td { font-size: 11px; font-family: 'SF Mono','Fira Code',monospace; color: var(--text-med); }
.zf-tk { font-size: 12px; font-weight: 700; color: var(--text-hi); }
.zf-se { font-size: 9px; margin-top: 1px; color: var(--text-lo); }

/* ─── Watchlist ────────────────────────────────────────────────────── */
.zf-wr { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
.zf-wr + .zf-wr { border-top: .5px solid var(--border-row); }
.zf-wn { font-size: 12px; font-weight: 700; color: var(--text-hi); }
.zf-ws { font-size: 9px; color: var(--text-lo); margin-top: 1px; }
.zf-wp { font-size: 12px; font-family: 'SF Mono','Fira Code',monospace; font-weight: 600; color: var(--text-hi); text-align: right; }
.zf-wc { font-size: 10px; font-weight: 600; text-align: right; margin-top: 2px; }

/* ─── Content panel (non-overview) ─────────────────────────────────── */
.zf-ctnr {
  flex: 1; border-radius: 14px; position: relative; overflow: auto; padding: 18px;
  background: var(--glass-panel); border: 1px solid var(--border); box-shadow: var(--shadow-panel);
}
.zf-ctnr::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: var(--shine);
}

/* ─── User menu ────────────────────────────────────────────────────── */
.zf-umenu {
  position: absolute; right: 0; top: calc(100% + 6px);
  border-radius: 10px; padding: 4px; min-width: 148px; z-index: 50;
  backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--border); box-shadow: 0 8px 32px rgba(0,0,0,.2);
}
.zf[data-theme="light"] .zf-umenu { background: rgba(255,252,248,.88); }
.zf[data-theme="dark"]  .zf-umenu { background: rgba(18,10,36,.88); }

/* ─── Responsive ───────────────────────────────────────────────────── */
@media (max-width: 780px) {
  .zf-stats  { grid-template-columns: repeat(2,1fr); }
  .zf-panels { grid-template-columns: 1fr; }
  .zf-side   { display: none; }
  .zf-tabs   { display: none; }
}
@keyframes zf-spin { to { transform: rotate(360deg); } }
.zf-spinning { animation: zf-spin 1s linear infinite; }
`;

// ═══════════════════════════════════════════════════════════════════════════
export default function Index() {
  const [theme, setTheme] = useState<Theme>("light");
  const [tab, setTab]     = useState<ActiveTab>("overview");
  const [uMenu, setUMenu] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const [stocks,    setStocks]    = useState<PortfolioStock[]>(()  => loadFromLocal()?.stocks    ?? initialData);
  const [trades,    setTrades]    = useState<TradeStrategy[]>(()   => loadFromLocal()?.trades    ?? initialTrades);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>(()  => loadFromLocal()?.watchlist ?? initialWatchlist);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>(()      => loadFromLocal()?.alerts    ?? []);
  const [journal,   setJournal]   = useState<TradeJournalEntry[]>([]);

  const { toast }  = useToast();
  const { user, signOut } = useAuth();
  const { prices, isLive, refresh } = useLivePrices(stocks);
  usePortfolioSync({ stocks, trades, watchlist, alerts, setStocks, setTrades, setWatchlist, setAlerts });

  const live = stocks.map(s => prices[s.ticker] ? { ...s, cmp: prices[s.ticker] } : s);
  const D = theme === "dark";

  const invested = calcInvestedValue(live);
  const current  = calcFinalValue(live);
  const pnl      = calcProfitLoss(live);
  const pnlPct   = invested > 0 ? pnl / invested * 100 : 0;
  const todayPnl = live.reduce((a, s) => s.status === "Active" ? a + (s.cmp - s.entryPrice) * s.quantity * 0.003 : a, 0);

  // Colour helpers
  const profit  = D ? "#4ade80" : "#16a34a";
  const loss    = D ? "#f87171" : "#dc2626";
  const pnlC    = pnl    >= 0 ? profit : loss;
  const todayC  = todayPnl >= 0 ? profit : loss;

  const cards = [
    { label: "INVESTED",      val: fmt(invested),              sub: `${live.filter(s=>s.status==="Active").length} positions`, subC: "var(--text-med)", cls: "zf-sc-invest" },
    { label: "CURRENT VALUE", val: fmt(current),               sub: `+${fmt(current - invested)}`,                             subC: profit,           cls: "zf-sc-base"   },
    { label: "UNREALISED P&L",val: (pnl>=0?"+":"")+fmt(pnl),   sub: `${pnl>=0?"+":""}${pnlPct.toFixed(1)}%`,                  subC: pnlC,             cls: "zf-sc-base",
      bg:  pnl>=0 ? (D?"rgba(5,46,22,.32)":"rgba(220,252,231,.55)") : (D?"rgba(69,10,10,.32)":"rgba(254,242,242,.55)"),
      bdr: pnl>=0 ? (D?"rgba(74,222,128,.13)":"rgba(187,247,208,.7)") : (D?"rgba(248,113,113,.13)":"rgba(254,202,202,.7)"),
    },
    { label: "TODAY'S P&L",   val: (todayPnl>=0?"+":"")+fmt(todayPnl), sub: `${todayPnl>=0?"+":""}${(Math.abs(todayPnl)/invested*100).toFixed(2)}%`, subC: todayC, cls: "zf-sc-base",
      bg:  todayPnl>=0 ? (D?"rgba(5,46,22,.32)":"rgba(220,252,231,.55)") : (D?"rgba(69,10,10,.32)":"rgba(254,242,242,.55)"),
      bdr: todayPnl>=0 ? (D?"rgba(74,222,128,.13)":"rgba(187,247,208,.7)") : (D?"rgba(248,113,113,.13)":"rgba(254,202,202,.7)"),
    },
  ];

  return (
    <>
      <style>{CSS}</style>

      <div className="zf" data-theme={theme}>
        {/* BG */}
        <div className="zf-bg" />
        <div className="zf-orb" style={{ width:440,height:440, background:`radial-gradient(circle,var(--orb-1),transparent 70%)`, top:-130, right:-90, filter:"blur(90px)" }} />
        <div className="zf-orb" style={{ width:320,height:320, background:`radial-gradient(circle,var(--orb-2),transparent 70%)`, bottom:-70, left:-70,  filter:"blur(85px)" }} />
        <div className="zf-orb" style={{ width:220,height:220, background:`radial-gradient(circle,var(--orb-3),transparent 70%)`, top:"42%", left:"40%", filter:"blur(70px)" }} />

        <div className="zf-shell">
          {/* ── Topbar ── */}
          <nav className="zf-top glass glass-shine">
            {/* Brand */}
            <div className="zf-brand">
              <div className="zf-logo">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 12L5.5 4.5L10 9.5L12 7L14 12H2Z" fill="white" />
                </svg>
              </div>
              <span className="zf-name">ZenFolio</span>
            </div>

            {/* Primary tabs */}
            <div className="zf-tabs">
              {(["overview","holdings","trades","watchlist","ai"] as ActiveTab[]).map(t => (
                <button key={t} className={`zf-tab${tab===t?" on":""}`} onClick={()=>setTab(t)}>
                  {t === "ai" ? "AI" : t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="zf-ctrl">
              <div className="zf-pill">
                <div className="zf-dot" />
                NSE {isLive?"Live":"Cached"} · {new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})} IST
              </div>
              <button className="zf-ibtn" onClick={refresh} title="Refresh">
                <RefreshCw size={13} className={!isLive ? "zf-spinning" : ""} />
              </button>
              <button className="zf-ibtn" onClick={()=>setTheme(D?"light":"dark")} title="Toggle theme">
                {D ? <Sun size={13}/> : <Moon size={13}/>}
              </button>
              <div style={{position:"relative"}}>
                <button className="zf-ibtn" onClick={()=>setUMenu(p=>!p)}>
                  <Settings size={13}/>
                </button>
                {uMenu && (
                  <div className="zf-umenu">
                    <div style={{padding:"6px 10px 8px",borderBottom:"1px solid var(--border-sub)"}}>
                      <div style={{fontSize:9,color:"var(--text-lo)",fontWeight:600,textTransform:"uppercase",letterSpacing:".05em"}}>Signed in as</div>
                      <div style={{fontSize:11,color:"var(--text-hi)",marginTop:2,fontWeight:600}}>{user?.email ?? "Guest"}</div>
                    </div>
                    {user ? (
                      <button onClick={()=>{signOut();setUMenu(false);}} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 10px",borderRadius:7,fontSize:11,color:D?"#f87171":"#dc2626",background:"transparent",border:"none",cursor:"pointer",fontWeight:600}}>
                        <LogOut size={11}/> Sign out
                      </button>
                    ) : (
                      <button onClick={()=>{setShowAuth(true);setUMenu(false);}} style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"7px 10px",borderRadius:7,fontSize:11,color:"var(--text-accent)",background:"transparent",border:"none",cursor:"pointer",fontWeight:600}}>
                        <LogOut size={11}/> Sign in
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* ── Body ── */}
          <div className="zf-body">
            {/* Sidebar */}
            <aside className="zf-side glass glass-shine">
              {Array.from(new Set(NAV.map(n=>n.group))).map(group=>(
                <div key={group}>
                  <div className="zf-nav-sec">{group}</div>
                  {NAV.filter(n=>n.group===group).map(({id,label,icon:Icon})=>(
                    <div key={id} className={`zf-nav${tab===id?" on":""}`} onClick={()=>setTab(id as ActiveTab)}>
                      <Icon strokeWidth={1.8}/>{label}
                    </div>
                  ))}
                </div>
              ))}
            </aside>

            {/* Main */}
            <main className="zf-main">
              {/* ── OVERVIEW ── */}
              {tab === "overview" && (<>
                <div className="zf-stats">
                  {cards.map((c,i)=>(
                    <div key={i} className={`zf-sc glass ${c.cls}`}
                      style={c.bg ? {background:c.bg,borderColor:c.bdr} : {}}>
                      <div className="zf-sc-label">{c.label}</div>
                      <div className="zf-sc-val" style={(c.label.includes("P&L")||c.label.includes("TODAY")) ? {color:c.subC} : {}}>{c.val}</div>
                      <div className="zf-sc-sub" style={{color:c.subC}}>{c.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="zf-panels">
                  {/* Holdings */}
                  <div className="zf-panel glass">
                    <div className="zf-ph">
                      <span className="zf-pt">Holdings</span>
                      <span className="zf-pa" onClick={()=>setTab("holdings")}>View all →</span>
                    </div>
                    <div className="zf-pb">
                      <div className="zf-tr">
                        {["TICKER","QTY","AVG","CMP","P&L"].map(h=>(
                          <span key={h} className="zf-th">{h}</span>
                        ))}
                      </div>
                      {live.filter(s=>s.status==="Active").slice(0,6).map(s=>{
                        const pl = (s.cmp - s.entryPrice) / s.entryPrice * 100;
                        return (
                          <div key={s.ticker} className="zf-tr">
                            <div><div className="zf-tk">{s.ticker}</div><div className="zf-se">{s.sector}</div></div>
                            <span className="zf-td">{s.quantity}</span>
                            <span className="zf-td">{s.entryPrice.toLocaleString("en-IN")}</span>
                            <span className="zf-td">{s.cmp.toLocaleString("en-IN")}</span>
                            <span className="zf-td" style={{color:pl>=0?profit:loss,fontWeight:700}}>
                              {pl>=0?"+":""}{pl.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Watchlist */}
                  <div className="zf-panel glass">
                    <div className="zf-ph">
                      <span className="zf-pt">Watchlist</span>
                      <span className="zf-pa" onClick={()=>setTab("watchlist")}>+ Add</span>
                    </div>
                    <div className="zf-pb">
                      {watchlist.slice(0,6).map(w=>{
                        const pos = (w.change ?? 0) >= 0;
                        return (
                          <div key={w.ticker} className="zf-wr">
                            <div><div className="zf-wn">{w.ticker}</div><div className="zf-ws">{w.sector}</div></div>
                            <div>
                              <div className="zf-wp">₹{(w.cmp ?? w.targetPrice ?? 0).toLocaleString("en-IN")}</div>
                              <div className="zf-wc" style={{color:pos?profit:loss}}>{pos?"+":""}{(w.change??0).toFixed(1)}%</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>)}

              {/* ── OTHER TABS ── */}
              {tab !== "overview" && (
                <div className="zf-ctnr glass">
                  {tab==="holdings"  && <PortfolioTable stocks={live} onUpdate={setStocks}/>}
                  {tab==="trades"    && <TradeStrategyTable trades={trades} onUpdate={setTrades} stocks={live}/>}
                  {tab==="watchlist" && <WatchlistTable watchlist={watchlist} onUpdate={setWatchlist}/>}
                  {tab==="charts"    && <PortfolioCharts stocks={live}/>}
                  {tab==="risk"      && <RiskAnalysis stocks={live}/>}
                  {tab==="analytics" && <TradeAnalytics stocks={live}/>}
                  {tab==="history"   && <TradeHistory stocks={live}/>}
                  {tab==="journal"   && <TradeJournal entries={journal} onUpdate={setJournal}/>}
                  {tab==="sector"    && <SectorDiversification stocks={live}/>}
                  {tab==="alerts"    && <PriceAlerts alerts={alerts} onUpdate={setAlerts} stocks={live}/>}
                  {tab==="ai"        && <AIInsights stocks={live}/>}
                  {tab==="export"    && <ExportPortfolio stocks={live} trades={trades}/>}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>

      {showAuth && <AuthModal onClose={()=>setShowAuth(false)}/>}
    </>
  );
}