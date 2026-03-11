import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Crosshair, Eye, LayoutDashboard, Shield,
  RefreshCw, History, BookOpen, Bell, Brain, PieChart,
  Save, X, IndianRupee, Briefcase, TrendingUp,
  Target, Activity, Percent, Sun, Moon, Waves,
  ChevronDown, LogOut, Settings, FlaskConical,
  CreditCard, ScrollText, Zap, Menu
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
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";


// ── Constants ──────────────────────────────────────────────────────────────────
const BLUE_GRAD = "linear-gradient(135deg, hsl(222,65%,14%), hsl(215,65%,42%), hsl(212,80%,56%))";
const BLUE_MID  = "linear-gradient(135deg, hsl(217,55%,28%), hsl(215,65%,46%))";

const CARD_COLORS_LIGHT = [
  "hsl(222,60%,26%)", "hsl(220,58%,32%)", "hsl(218,58%,38%)",
  "hsl(216,60%,44%)", "hsl(214,65%,50%)", "hsl(211,75%,54%)", "hsl(207,85%,58%)"
];
const CARD_COLORS_DARK = [
  "hsl(220,70%,68%)", "hsl(218,70%,71%)", "hsl(216,72%,74%)",
  "hsl(214,74%,76%)", "hsl(212,76%,78%)", "hsl(209,80%,80%)", "hsl(205,85%,82%)"
];

const CARDS = [
  { cls: "stat-card-1", iconBg: "card-icon-bg-1", icon: IndianRupee, label: "Total Invested"  },
  { cls: "stat-card-2", iconBg: "card-icon-bg-2", icon: Briefcase,   label: "Current Value"  },
  { cls: "stat-card-3", iconBg: "card-icon-bg-3", icon: TrendingUp,  label: "Total P&L"      },
  { cls: "stat-card-4", iconBg: "card-icon-bg-4", icon: Target,      label: "Win Rate"       },
  { cls: "stat-card-5", iconBg: "card-icon-bg-5", icon: Activity,    label: "Open Positions" },
  { cls: "stat-card-6", iconBg: "card-icon-bg-6", icon: BarChart3,   label: "Closed Trades"  },
  { cls: "stat-card-7", iconBg: "card-icon-bg-7", icon: Percent,     label: "Risk/Reward"    },
];

const NAV_TABS = [
  { value: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { value: "portfolio", label: "Portfolio",   icon: BarChart3 },
  { value: "trades",    label: "Trades",      icon: Crosshair },
  { value: "history",   label: "History",     icon: History },
  { value: "watchlist", label: "Watchlist",   icon: Eye },
  { value: "analytics", label: "Analytics",   icon: PieChart },
  { value: "journal",   label: "Journal",     icon: BookOpen },
  { value: "alerts",    label: "Alerts",      icon: Bell },
  { value: "risk",      label: "Risk",        icon: Shield },
  { value: "ai",        label: "AI Insights", icon: Brain },
];

const BOTTOM_NAV = [
  { value: "dashboard", label: "Home",      icon: LayoutDashboard },
  { value: "portfolio", label: "Portfolio", icon: BarChart3 },
  { value: "trades",    label: "Trades",    icon: Crosshair },
  { value: "watchlist", label: "Watch",     icon: Eye },
  { value: "alerts",    label: "Alerts",    icon: Bell },
];

// ── Stats panel ───────────────────────────────────────────────────────────────
const StatsPanel = ({ stocks }: { stocks: PortfolioStock[] }) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const activeStocks  = stocks.filter(s => s.status === "Active");
  const closedStocks  = stocks.filter(s => s.status !== "Active");
  const activeInvested     = activeStocks.reduce((s, x) => s + calcInvestedValue(x), 0);
  const activeCurrentValue = activeStocks.reduce((s, x) => s + calcFinalValue(x), 0);
  const activePL           = activeStocks.reduce((s, x) => s + calcProfitLoss(x), 0);
  const activePLPct        = activeInvested > 0 ? (activePL / activeInvested) * 100 : 0;
  const isProfit           = activePL >= 0;
  const closedPL           = closedStocks.reduce((s, x) => s + calcProfitLoss(x), 0);
  const analytics          = getTradeAnalytics(stocks);
  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  const values = [
    fmt(activeInvested),
    fmt(activeCurrentValue),
    `${isProfit ? "+" : "-"}${fmt(activePL)}`,
    `${analytics.winRate.toFixed(1)}%`,
    `${activeStocks.length}`,
    `${closedStocks.length}`,
    analytics.riskRewardRatio > 0 ? `1:${analytics.riskRewardRatio.toFixed(1)}` : "N/A",
  ];
  const subs = [
    `Excl. ₹${Math.abs(closedPL).toLocaleString("en-IN", { maximumFractionDigits: 0 })} realised`,
    `Active positions only`,
    `${isProfit ? "+" : ""}${activePLPct.toFixed(1)}% on active`,
    null,
    `₹${activeInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })} deployed`,
    `${closedPL >= 0 ? "+" : "-"}₹${Math.abs(closedPL).toLocaleString("en-IN", { maximumFractionDigits: 0 })} realised P&L`,
    null,
  ];

  return (
    <div className="relative">
      {/* Desktop grid */}
      <div className="hidden sm:grid grid-cols-4 lg:grid-cols-7 gap-3 stagger">
        {CARDS.map((c, i) => {
          const Icon = c.icon;
          const color = isDark ? CARD_COLORS_DARK[i] : CARD_COLORS_LIGHT[i];
          return (
            <div key={c.label} className={`stat-card ${c.cls} animate-fade-up shimmer-hover`}>
              <div className="relative z-10">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center mb-3 ${c.iconBg}`}>
                  <Icon className="h-3.5 w-3.5" style={{ color }} />
                </div>
                <p className="text-[9.5px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 leading-none">{c.label}</p>
                <p className="text-lg font-bold ticker leading-none" style={{ color }}>{values[i]}</p>
                {subs[i] && <p className="text-[10px] ticker mt-1 font-medium opacity-70" style={{ color }}>{subs[i]}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile: 2 hero + scroll chips */}
      <div className="sm:hidden space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 2].map(i => {
            const c = CARDS[i]; const Icon = c.icon;
            const color = isDark ? CARD_COLORS_DARK[i] : CARD_COLORS_LIGHT[i];
            return (
              <div key={c.label} className={`stat-card ${c.cls}`} style={{ padding: "0.875rem" }}>
                <div className="relative z-10">
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center mb-2 ${c.iconBg}`}>
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1 leading-none">{c.label}</p>
                  <p className="text-base font-bold ticker leading-none" style={{ color }}>{values[i]}</p>
                  {subs[i] && <p className="text-[10px] ticker mt-0.5 opacity-70" style={{ color }}>{subs[i]}</p>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 pb-1" style={{ width: "max-content" }}>
            {[1, 3, 4, 5, 6].map(i => {
              const c = CARDS[i]; const Icon = c.icon;
              const color = isDark ? CARD_COLORS_DARK[i] : CARD_COLORS_LIGHT[i];
              return (
                <div key={c.label} className={`stat-card ${c.cls} shrink-0`}
                     style={{ padding: "0.625rem 0.875rem", minWidth: 122 }}>
                  <div className="relative z-10 flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${c.iconBg}`}>
                      <Icon className="h-3 w-3" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground leading-none mb-0.5">{c.label}</p>
                      <p className="text-[13px] font-bold ticker leading-none" style={{ color }}>{values[i]}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Mobile Sidebar ────────────────────────────────────────────────────────────
const MobileSidebar = ({ open, onClose, activeTab, setActiveTab, triggeredAlerts, stocks, onSave, syncing, user }: {
  open: boolean; onClose: () => void;
  activeTab: string; setActiveTab: (v: string) => void;
  triggeredAlerts: number; stocks: PortfolioStock[];
  onSave: () => void; syncing: boolean; user: any;
}) => (
  <>
    <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={onClose} />
    <aside className={`sidebar-tray ${open ? "open" : ""}`}>
      <div className="absolute inset-x-0 top-0 h-[2.5px]"
           style={{ background: "linear-gradient(90deg, hsl(222,65%,20%), hsl(215,65%,42%), hsl(212,80%,56%), hsl(207,88%,64%))" }} />

      <div className="flex items-center justify-between px-5 pt-6 pb-4"
           style={{ borderBottom: "1px solid hsl(215 45% 28% / 0.20)" }}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center"
               style={{ background: BLUE_GRAD, boxShadow: "0 4px 16px hsl(215,65%,46%,0.40)" }}>
            <Waves style={{ color: "white", width: 15, height: 15 }} />
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-none text-white tracking-tight">Smart Stock</p>
            <p className="text-[10px] mt-0.5 tracking-wide" style={{ color: "hsl(215,55%,58%)" }}>Portfolio Tracker</p>
          </div>
        </div>
        <button onClick={onClose}
          className="h-7 w-7 rounded-md flex items-center justify-center"
          style={{ background: "hsl(215 45% 22% / 0.60)", color: "hsl(215,55%,58%)" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        <p className="text-[9px] font-bold uppercase tracking-widest px-3 mb-2 mt-1"
           style={{ color: "hsl(215,40%,42%)" }}>Navigation</p>
        {NAV_TABS.map(({ value, label, icon: Icon }) => {
          const isActive = activeTab === value;
          return (
            <button key={value}
              onClick={() => { setActiveTab(value); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 text-left"
              style={isActive ? {
                background: BLUE_MID, color: "white",
                boxShadow: "0 3px 12px hsl(215,65%,46%,0.32)"
              } : { color: "hsl(215,50%,62%)" }}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {value === "alerts" && triggeredAlerts > 0 && (
                <span className="h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">{triggeredAlerts}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 space-y-2" style={{ borderTop: "1px solid hsl(215 45% 22% / 0.18)" }}>
        <button onClick={onSave} disabled={syncing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
          style={{ background: BLUE_MID, color: "white", opacity: syncing ? 0.7 : 1 }}>
          <Save className="h-4 w-4" />
          {syncing ? "Saving…" : user ? "Save & Sync" : "Save Locally"}
        </button>
        <div className="flex gap-2"><div className="flex-1"><ExportPortfolio stocks={stocks} /></div></div>
        <p className="text-[9.5px] text-center mt-1" style={{ color: "hsl(215,35%,40%)" }}>Portfolio & Trade Dashboard · ₹ INR</p>
      </div>
    </aside>
  </>
);

// ── Sign in button (shown in dropdown when not logged in) ──────────────────
const SignInButton = () => {
  const [authOpen, setAuthOpen] = useState(false);
  return (
    <>
      <button onClick={() => setAuthOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
        style={{ background: BLUE_MID, color: "white" }}>
        Sign In / Create Account
      </button>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

// ── Hover user dropdown ───────────────────────────────────────────────────────
const UserDropdown = ({
  user, activeTab, setActiveTab, triggeredAlerts,
  stocks, onSave, syncing, theme, setTheme, refresh, loading, lastUpdated
}: {
  user: any; activeTab: string; setActiveTab: (v: string) => void;
  triggeredAlerts: number; stocks: PortfolioStock[];
  onSave: () => void; syncing: boolean;
  theme: string | undefined; setTheme: (t: string) => void;
  refresh: () => void; loading: boolean; lastUpdated: string | null;
}) => {
  const { signOut } = useAuth();
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : "?";
  const email = user?.email ?? "Not signed in";

  const navItems = [
    { value: "dashboard",  label: "Dashboard",   icon: LayoutDashboard },
    { value: "portfolio",  label: "Portfolio",    icon: BarChart3 },
    { value: "trades",     label: "Trades",       icon: Crosshair },
    { value: "history",    label: "History",      icon: History },
    { value: "watchlist",  label: "Watchlist",    icon: Eye },
    { value: "analytics",  label: "Analytics",    icon: PieChart },
    { value: "journal",    label: "Journal",      icon: BookOpen },
    { value: "alerts",     label: "Alerts",       icon: Bell },
    { value: "risk",       label: "Risk",         icon: Shield },
    { value: "ai",         label: "AI Insights",  icon: Brain },
  ];

  const formatTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="relative group">
      {/* Trigger */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer select-none transition-all duration-200"
           style={{ background: "hsl(215 50% 46% / 0.08)", border: "1px solid hsl(215 50% 46% / 0.18)" }}>
        <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
             style={{ background: BLUE_MID }}>
          {initials}
        </div>
        <span className="hidden sm:block text-[12px] font-medium max-w-[110px] truncate"
              style={{ color: "hsl(222,60%,22%)" }}>
          {email.split("@")[0]}
        </span>
        <ChevronDown className="h-3 w-3 transition-transform duration-300 group-hover:rotate-180"
                     style={{ color: "hsl(215,55%,48%)" }} />
      </div>

      {/* Dropdown panel — shown on hover via CSS group */}
      <div className="absolute right-0 top-full pt-2 z-[200] pointer-events-none opacity-0 translate-y-1
                      group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0
                      transition-all duration-200 ease-out"
           style={{ minWidth: 260 }}>
        <div className="rounded-xl overflow-hidden"
             style={{
               background: "hsl(0 0% 100% / 0.97)",
               border: "1px solid hsl(218 35% 85% / 0.70)",
               boxShadow: "0 16px 48px hsl(215 65% 46% / 0.16), 0 4px 12px hsl(0 0% 0% / 0.08)",
               backdropFilter: "blur(20px)"
             }}>

          {/* User info header */}
          <div className="px-4 py-3.5" style={{ borderBottom: "1px solid hsl(218 30% 90%)" }}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                   style={{ background: BLUE_GRAD }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-none truncate" style={{ color: "hsl(222,60%,14%)" }}>
                  {email.split("@")[0]}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "hsl(218,20%,52%)" }}>{email}</p>
              </div>
            </div>

            {/* Live status */}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-warning" : "bg-profit"} animate-pulse-glow`} />
                <span className="text-[11px] font-medium" style={{ color: "hsl(215,55%,46%)" }}>
                  {loading ? "Fetching prices…" : lastUpdated ? `Updated ${formatTime(lastUpdated)}` : "Live"}
                </span>
              </div>
              <button onClick={refresh} disabled={loading}
                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-all"
                style={{ color: "hsl(215,60%,46%)", background: "hsl(215 55% 46% / 0.08)" }}>
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Navigation section */}
          <div className="py-1.5 px-2">
            <p className="text-[9px] font-bold uppercase tracking-widest px-2 py-1.5"
               style={{ color: "hsl(218,20%,56%)" }}>Navigation</p>
            <div className="grid grid-cols-2 gap-0.5">
              {navItems.map(({ value, label, icon: Icon }) => {
                const isActive = activeTab === value;
                return (
                  <button key={value}
                    onClick={() => setActiveTab(value)}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all duration-150 text-left"
                    style={isActive ? {
                      background: "hsl(215 65% 46% / 0.10)",
                      color: "hsl(215,65%,38%)",
                    } : {
                      color: "hsl(222,40%,30%)",
                    }}>
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: isActive ? "hsl(215,65%,44%)" : "hsl(218,30%,52%)" }} />
                    <span className="truncate">{label}</span>
                    {value === "alerts" && triggeredAlerts > 0 && (
                      <span className="ml-auto h-4 w-4 rounded-full bg-loss text-[8px] font-bold flex items-center justify-center text-white">{triggeredAlerts}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="py-1.5 px-2" style={{ borderTop: "1px solid hsl(218 30% 90%)" }}>
            <p className="text-[9px] font-bold uppercase tracking-widest px-2 py-1.5"
               style={{ color: "hsl(218,20%,56%)" }}>Actions</p>

            <button onClick={onSave} disabled={syncing}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all"
              style={{ color: "hsl(215,60%,36%)" }}>
              <Save className="h-3.5 w-3.5" style={{ color: "hsl(215,60%,48%)" }} />
              {syncing ? "Saving…" : user ? "Save & Sync" : "Save Locally"}
            </button>

            <div className="px-1">
              <ExportPortfolio stocks={stocks} />
            </div>

            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-medium transition-all"
              style={{ color: "hsl(215,60%,36%)" }}>
              {theme === "dark"
                ? <Sun className="h-3.5 w-3.5" style={{ color: "hsl(215,60%,48%)" }} />
                : <Moon className="h-3.5 w-3.5" style={{ color: "hsl(215,60%,48%)" }} />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          </div>

          {/* Sign out */}
          {user && (
            <div className="px-2 pb-2" style={{ borderTop: "1px solid hsl(218 30% 90%)" }}>
              <button onClick={() => signOut()}
                className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[12px] font-medium transition-all mt-1"
                style={{ color: "hsl(2,70%,42%)" }}>
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          )}
          {!user && (
            <div className="px-3 pb-3 pt-1">
              <SignInButton />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Index = () => {
  const { user }            = useAuth();
  const { load, save }      = usePortfolioSync(user?.id);
  const { toast }           = useToast();
  const { theme, setTheme } = useTheme();

  const local = loadFromLocal();
  const [stocks,      setStocks]      = useState<PortfolioStock[]>(() => local?.stocks    ?? initialData);
  const [trades,      setTrades]      = useState<TradeStrategy[]>(() => local?.trades    ?? initialTrades);
  const [watchlist,   setWatchlist]   = useState<WatchlistStock[]>(() => local?.watchlist ?? initialWatchlist);
  const [alerts,      setAlerts]      = useState<PriceAlert[]>(() => local?.alerts    ?? []);
  const [activeTab,   setActiveTab]   = useState("dashboard");
  const [syncing,     setSyncing]     = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadedUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (loadedUserRef.current === user?.id) return;
    loadedUserRef.current = user?.id;
    load().then(snapshot => {
      if (!snapshot) return;
      setStocks(snapshot.stocks); setTrades(snapshot.trades);
      setWatchlist(snapshot.watchlist); setAlerts(snapshot.alerts);
      if (user) toast({ title: "Portfolio synced ☁️", description: "Latest data loaded from cloud." });
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePortfolio = async () => {
    setSyncing(true);
    const err = await save({ stocks, trades, watchlist, alerts });
    setSyncing(false);
    if (err) toast({ title: "Save failed", description: err, variant: "destructive" });
    else toast({ title: user ? "Saved to cloud ☁️" : "Saved locally", description: user ? "Synced across all your devices." : "Sign in to sync across devices." });
  };

  const allTickers = [
    ...stocks.filter(s => s.status === "Active").map(s => s.ticker),
    ...trades.map(t => t.ticker),
    ...watchlist.map(w => w.stockName),
  ];

  const { prices, loading, lastUpdated, error, refresh } = useLivePrices(allTickers);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setStocks(prev => prev.map(s => { const l = prices[s.ticker]; if (!l || s.status !== "Active") return s; return { ...s, cmp: l.price, weekHigh52: l.weekHigh52 || s.weekHigh52, weekLow52: l.weekLow52 || s.weekLow52, dailyChange: l.change }; }));
    setTrades(prev => prev.map(t => { const l = prices[t.ticker]; return l ? { ...t, livePrice: l.price } : t; }));
    setWatchlist(prev => prev.map(w => { const l = prices[w.stockName]; return l ? { ...w, cmp: l.price } : w; }));
  }, [prices]);

  useEffect(() => {
    if (Object.keys(prices).length === 0) return;
    setAlerts(prev => prev.map(a => {
      if (a.triggered) return a;
      const l = prices[a.ticker]; if (!l) return a;
      const hit = (a.direction === "above" && l.price >= a.targetPrice) || (a.direction === "below" && l.price <= a.targetPrice);
      if (hit) toast({ title: `🔔 Alert: ${a.ticker}`, description: `${a.type === "target_hit" ? "Target hit" : a.type === "sl_hit" ? "SL hit" : "Entry zone"} at ₹${l.price.toFixed(2)}` });
      return hit ? { ...a, triggered: true } : a;
    }));
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (error) toast({ title: "Price fetch issue", description: error, variant: "destructive" }); }, [error]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddStock        = (s: PortfolioStock)            => setStocks(p => [...p, s]);
  const handleImportStocks    = (imp: PortfolioStock[])        => setStocks(p => [...p, ...imp]);
  const handleEditStock       = (o: string, u: PortfolioStock) => { setStocks(p => p.map(s => s.ticker === o ? u : s)); toast({ title: "Transaction updated" }); };
  const handleDeleteStock     = (t: string)                    => { setStocks(p => p.filter(s => s.ticker !== t)); toast({ title: "Transaction deleted" }); };
  const handleEditTrade       = (o: string, u: TradeStrategy)  => { setTrades(p => p.map(t => t.ticker === o ? u : t)); toast({ title: "Trade updated" }); };
  const handleDeleteTrade     = (t: string)                    => { setTrades(p => p.filter(x => x.ticker !== t)); toast({ title: "Trade deleted" }); };
  const handleEditWatchlist   = (o: string, u: WatchlistStock) => { setWatchlist(p => p.map(w => w.stockName === o ? u : w)); toast({ title: "Watchlist updated" }); };
  const handleDeleteWatchlist = (n: string)                    => { setWatchlist(p => p.filter(w => w.stockName !== n)); toast({ title: "Removed from watchlist" }); };
  const handleUpdateNotes     = (t: string, n: TradeJournalEntry) => { setStocks(p => p.map(s => s.ticker === t ? { ...s, notes: n } : s)); toast({ title: "Journal updated" }); };
  const handleAddAlert        = (a: PriceAlert)                => setAlerts(p => [...p, a]);
  const handleDeleteAlert     = (id: string)                   => setAlerts(p => p.filter(a => a.id !== id));
  const handleDismissAlert    = (id: string)                   => setAlerts(p => p.filter(a => a.id !== id));

  const triggeredAlerts = alerts.filter(a => a.triggered).length;

  return (
    <div className="min-h-screen mesh-bg pb-20 sm:pb-0 relative overflow-x-hidden">

      {/* Mobile sidebar only */}
      <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}
        activeTab={activeTab} setActiveTab={setActiveTab}
        triggeredAlerts={triggeredAlerts} stocks={stocks}
        onSave={handleSavePortfolio} syncing={syncing} user={user} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 relative header-glass">
        <div className="absolute inset-x-0 top-0 h-[2.5px]"
             style={{ background: "linear-gradient(90deg, hsl(222,65%,16%), hsl(217,55%,30%), hsl(215,65%,44%), hsl(212,80%,56%), hsl(207,88%,64%))" }} />

        <div className="flex items-center justify-between h-14 sm:h-16 px-4">

          {/* Left — logo only, no hamburger on desktop */}
          <div className="flex items-center gap-2.5">
            {/* Hamburger mobile only */}
            <button onClick={() => setSidebarOpen(true)}
              className="sm:hidden h-8 w-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: "hsl(215 50% 46% / 0.08)", border: "1px solid hsl(215 50% 46% / 0.20)", color: "hsl(215,60%,42%)" }}>
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg flex items-center justify-center relative overflow-hidden shrink-0"
                   style={{ background: BLUE_GRAD, boxShadow: "0 3px 14px hsl(215,65%,46%,0.38)" }}>
                <Waves className="h-4 w-4 text-white" style={{ width: 15, height: 15 }} />
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 55%)" }} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[13px] sm:text-[15px] font-semibold leading-none truncate tracking-tight"
                    style={{ color: "hsl(222,65%,14%)" }}>
                  Smart Stock Tracker
                </h1>
                <p className="text-[9px] sm:text-[10px] mt-0.5 tracking-wide font-medium hidden sm:block"
                   style={{ color: "hsl(215,55%,48%)" }}>
                  Portfolio · ₹ INR
                </p>
              </div>
            </div>
          </div>

          {/* Right — hover dropdown user menu */}
          <div className="flex items-center gap-2">
            <UserDropdown
              user={user}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              triggeredAlerts={triggeredAlerts}
              stocks={stocks}
              onSave={handleSavePortfolio}
              syncing={syncing}
              theme={theme}
              setTheme={setTheme}
              refresh={refresh}
              loading={loading}
              lastUpdated={lastUpdated}
            />
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 max-w-screen-xl mx-auto">
        <StatsPanel stocks={stocks} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="hidden sm:block overflow-x-auto pb-1">
            <TabsList className="inline-flex w-auto min-w-full h-11 p-1.5 gap-0.5 rounded-xl tab-bar-glass">
              {NAV_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value}
                  className={`relative flex items-center gap-1.5 rounded-lg px-3 h-full font-medium transition-all duration-200 whitespace-nowrap text-[11.5px] border-0 outline-none shimmer-hover ${activeTab === value ? "tab-active-pill text-white" : ""}`}
                  style={activeTab === value ? {} : {
                    color: "hsl(218,45%,50%)", background: "transparent",
                  }}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                  {value === "alerts" && triggeredAlerts > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">{triggeredAlerts}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="dashboard"  className="mt-4 sm:mt-5 space-y-4 sm:space-y-5 animate-fade-up"><PortfolioCharts stocks={stocks} /><TradeAnalytics stocks={stocks} /><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></TabsContent>
          <TabsContent value="portfolio"  className="mt-4 sm:mt-5 animate-fade-up"><PortfolioTable stocks={stocks} onAdd={handleAddStock} onImport={handleImportStocks} onEdit={handleEditStock} onDelete={handleDeleteStock} /></TabsContent>
          <TabsContent value="trades"     className="mt-4 sm:mt-5 animate-fade-up"><TradeStrategyTable trades={trades} onEdit={handleEditTrade} onDelete={handleDeleteTrade} /></TabsContent>
          <TabsContent value="history"    className="mt-4 sm:mt-5 animate-fade-up"><TradeHistory stocks={stocks} /></TabsContent>
          <TabsContent value="watchlist"  className="mt-4 sm:mt-5 animate-fade-up"><WatchlistTable watchlist={watchlist} onEdit={handleEditWatchlist} onDelete={handleDeleteWatchlist} /></TabsContent>
          <TabsContent value="analytics"  className="mt-4 sm:mt-5 space-y-4 sm:space-y-5 animate-fade-up"><TradeAnalytics stocks={stocks} /><SectorDiversification stocks={stocks} /><PortfolioCharts stocks={stocks} /></TabsContent>
          <TabsContent value="journal"    className="mt-4 sm:mt-5 animate-fade-up"><TradeJournal stocks={stocks} onUpdateNotes={handleUpdateNotes} /></TabsContent>
          <TabsContent value="alerts"     className="mt-4 sm:mt-5 animate-fade-up"><PriceAlerts alerts={alerts} onAddAlert={handleAddAlert} onDeleteAlert={handleDeleteAlert} onDismissAlert={handleDismissAlert} /></TabsContent>
          <TabsContent value="risk"       className="mt-4 sm:mt-5 animate-fade-up"><RiskAnalysis stocks={stocks} trades={trades} onEditTrade={handleEditTrade} /></TabsContent>
          <TabsContent value="ai"         className="mt-4 sm:mt-5 animate-fade-up"><AIInsights stocks={stocks} trades={trades} /></TabsContent>
        </Tabs>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bottom-nav-glass"
           style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div className="flex items-center justify-around px-2 h-16">
          {BOTTOM_NAV.map(({ value, label, icon: Icon }) => {
            const isActive = activeTab === value;
            return (
              <button key={value} onClick={() => setActiveTab(value)}
                className="flex flex-col items-center gap-1 flex-1 py-2 transition-all duration-200 relative"
                style={{ color: isActive ? "hsl(215,65%,44%)" : "hsl(218,20%,52%)" }}>
                {isActive && (
                  <div className="absolute inset-x-3 top-0 h-[2px] rounded-full"
                       style={{ background: BLUE_GRAD }} />
                )}
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${isActive ? "scale-110" : ""}`}
                     style={isActive ? { background: "hsl(215 65% 46% / 0.10)" } : {}}>
                  <Icon style={{ width: 17, height: 17 }} />
                </div>
                <span className="text-[10px] font-semibold leading-none">{label}</span>
                {value === "alerts" && triggeredAlerts > 0 && (
                  <span className="absolute top-1 right-3 h-4 w-4 rounded-full bg-loss text-[9px] font-bold flex items-center justify-center text-white">{triggeredAlerts}</span>
                )}
              </button>
            );
          })}
          <button onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-1 flex-1 py-2"
            style={{ color: "hsl(218,20%,52%)" }}>
            <div className="h-8 w-8 rounded-lg flex items-center justify-center">
              <Menu style={{ width: 17, height: 17 }} />
            </div>
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Index;