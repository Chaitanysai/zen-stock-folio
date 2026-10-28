import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";
import "@/styles/dashboard.css";
import {
  portfolioData as initialData,
  tradeStrategies as initialTrades,
  watchlistData as initialWatchlist,
  PortfolioStock, TradeStrategy, WatchlistStock, PriceAlert, TradeJournalEntry,
  FnOTrade, fnOTradesData, getSectorAllocation,
} from "@/data/sampleData";
import PortfolioTable        from "@/components/PortfolioTable";
import TradeStrategyTable    from "@/components/TradeStrategyTable";
import FnOTable             from "@/components/FnOTable";
import WatchlistTable        from "@/components/WatchlistTable";
import PortfolioCharts       from "@/components/PortfolioCharts";
import TradeAnalytics        from "@/components/TradeAnalytics";
import TradeHistory          from "@/components/TradeHistory";
import TradeJournal          from "@/components/TradeJournal";
import SectorDiversification from "@/components/SectorDiversification";
import PriceAlerts           from "@/components/PriceAlerts";
import AIInsights            from "@/components/AIInsights";
import StockNewsFeed         from "@/components/StockNewsFeed";
import ExportPortfolio       from "@/components/ExportPortfolio";
import MarketIndexStrip      from "@/components/MarketIndexStrip";
import HealthPanel           from "@/components/HealthPanel";
import SymbolSearch          from "@/components/SymbolSearch";
import AuthModal             from "@/components/AuthModal";
import LogoMark              from "@/components/LogoMark";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast }          from "@/hooks/use-toast";
import { useLivePrices }     from "@/hooks/useLivePrices";
import { useMarketStatus }   from "@/hooks/useMarketStatus";
import {
  usePortfolioSync, displayNameKeyFor, loadDisplayNameFromServer, saveDisplayNameToServer, PortfolioSnapshot,
} from "@/hooks/usePortfolioSync";
import { useAuth }           from "@/contexts/AuthContext";
import { journalNotesPatch } from "@/lib/portfolio/snapshotUpdates";
import { evaluateAlerts } from "@/lib/portfolio/priceAlerts";
import { bestPerformer, describeAiTeaser } from "@/lib/dashboard/presentation";
import { dataModeLabel } from "@/lib/market-data/freshness.ts";
import { computeMetrics, realisedByMonth, toHoldingRow } from "@/lib/dashboard/overview";
import { greeting, signedPct, stagger } from "@/lib/dashboard/format";
import { MobileMenu, Rail, TopBar } from "@/components/dashboard/Shell";
import { useThemeReveal } from "@/hooks/useThemeReveal";
import { BalanceCard, PnlCard, StatGrid } from "@/components/dashboard/Summary";
import { HoldingsCard } from "@/components/dashboard/Holdings";
import { FnoCard, InsightCard, PriceChartCard, SectorCard, WatchlistCard } from "@/components/dashboard/Sections";
import { NAV_ITEMS, PAGE_TITLES, navItem, type ActiveTab } from "@/components/dashboard/nav";

// Timing mirrors --dur-section-out / --dur-section-in in index.css.
const SECTION_OUT_MS = 170;
const SECTION_IN_MS = 350;

function sectionMotionEnabled() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
}

type SectionPhase = "idle" | "leaving" | "entering";

// ════════════════════════════════════════════════════════════════════════════
export default function Index() {
  const [tab,       setTab]       = useState<ActiveTab>("overview");
  const [renderedTab, setRenderedTab] = useState<ActiveTab>("overview");
  const [phase, setPhase] = useState<SectionPhase>("idle");
  const renderedTabRef = useRef<ActiveTab>("overview");
  const sectionTimers = useRef<number[]>([]);
  const [chartScrollSignal, setChartScrollSignal] = useState(0);
  const [mobileNav, setMobileNav] = useState(false);

  // One theme source: next-themes (App.tsx), persisted under localStorage "theme".
  // The old dashboard-only "zf-dark" flag is migrated once so a previous
  // light/dark choice is preserved.
  const { resolvedTheme, setTheme } = useTheme();
  const switchTheme = useThemeReveal();
  const theme = resolvedTheme === "light" ? "light" : "dark";
  useEffect(() => {
    try {
      const legacy = localStorage.getItem("zf-dark");
      if (legacy === null) return;
      if (localStorage.getItem("theme") === null) setTheme(legacy === "1" ? "dark" : "light");
      localStorage.removeItem("zf-dark");
    } catch { /* storage unavailable: keep the provider default */ }
  }, [setTheme]);

  const clearSectionTimers = useCallback(() => {
    sectionTimers.current.forEach((id) => window.clearTimeout(id));
    sectionTimers.current = [];
  }, []);

  // `tab` drives the rail and the sliding pill immediately; the body keeps the
  // outgoing section until it has faded, then swaps and settles the new one.
  const goTo = useCallback((id: ActiveTab) => {
    setTab(id);
    setMobileNav(false);
    if (id === renderedTabRef.current) return;

    clearSectionTimers();
    if (!sectionMotionEnabled()) {
      renderedTabRef.current = id;
      setRenderedTab(id);
      setPhase("idle");
      return;
    }

    setPhase("leaving");
    sectionTimers.current.push(window.setTimeout(() => {
      renderedTabRef.current = id;
      setRenderedTab(id);
      setPhase("entering");
      sectionTimers.current.push(window.setTimeout(() => setPhase("idle"), SECTION_IN_MS));
    }, SECTION_OUT_MS));
  }, [clearSectionTimers]);

  useEffect(() => clearSectionTimers, [clearSectionTimers]);

  const { user, signOut, loading: authLoading } = useAuth();
  const [showAuth,   setShowAuth]   = useState(false);
  const [helpOpen,   setHelpOpen]   = useState(false);
  const [infoOpen,   setInfoOpen]   = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [nameOpen,   setNameOpen]   = useState(false);
  const [displayName,  setDisplayName]  = useState("");
  const [nameInput,    setNameInput]    = useState("");
  const [nameSaving,   setNameSaving]   = useState(false);

  const { toast } = useToast();

  const handleSaveDisplayName = async () => {
    const name = nameInput.trim();
    if (!name) return;
    setNameSaving(true);
    try {
      // Save to this account's own scope (never a shared global key) first so
      // the change survives a failed cloud write.
      localStorage.setItem(displayNameKeyFor(user?.id), name);
      setDisplayName(name);
      // Persist through the neutral data-store abstraction (users/{uid}).
      if (user?.id) {
        const error = await saveDisplayNameToServer(user.id, name);
        if (error) {
          toast({
            title: "Name saved on this device",
            description: "Profile sync could not be completed.",
            variant: "destructive",
          });
        }
      }
      setNameOpen(false);
      setNameInput("");
    } finally {
      setNameSaving(false);
    }
  };

  // Load display name for the current account only.
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;

    try {
      setDisplayName(localStorage.getItem(displayNameKeyFor(userId)) ?? "");
    } catch {
      setDisplayName("");
    }
    if (!userId) return;

    loadDisplayNameFromServer(userId)
      .then((remoteName) => {
        // An empty/missing cloud value never erases a valid local name, and a
        // reply for a previous account is dropped.
        if (cancelled || !remoteName) return;
        setDisplayName(remoteName);
        try {
          localStorage.setItem(displayNameKeyFor(userId), remoteName);
        } catch {
          // storage disabled - the in-memory name is still correct
        }
      })
      .catch(() => {
        // Offline or provider unavailable: the locally cached name stands.
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  // Per-account data is never seeded from a shared/global cache. State starts
  // empty and is filled by the scoped loader effect below once the session is
  // known, so one account can never render another's rows.
  const [stocks,    setStocks]    = useState<PortfolioStock[]>([]);
  const [trades,    setTrades]    = useState<TradeStrategy[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [alerts,    setAlerts]    = useState<PriceAlert[]>([]);
  const [fnoTrades, setFnoTrades] = useState<FnOTrade[]>([]);
  const [selectedChartTicker, setSelectedChartTicker] = useState<string | null>(null);
  const [searchedSymbol, setSearchedSymbol] = useState<string | null>(null);
  const [tradesSubTab, setTradesSubTab] = useState<"equity"|"fno">("equity");
  const [chartRange, setChartRange] = useState<"1d"|"5d"|"1mo">("1d");
  const [ready, setReady] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const { load, save }    = usePortfolioSync(user?.id);
  const tickers = useMemo(
    () => Array.from(new Set([
      ...stocks.map((s) => s.ticker),
      ...alerts.filter((a) => !a.triggered && !a.dismissedAt).map((a) => a.ticker),
    ])),
    [stocks, alerts],
  );
  const { prices, dataMode, refresh, error: priceError, loading: pricesLoading, lastUpdated } = useLivePrices(tickers);
  // Exchange status: clock + NSE calendar only (Asia/Kolkata). Data/API
  // availability is a separate signal: a successful price response must never
  // make the exchange look live after 15:30 IST.
  const market = useMarketStatus();
  const snapshotRef = useRef<PortfolioSnapshot>({ stocks, trades, watchlist, alerts, fnoTrades });

  useEffect(() => {
    snapshotRef.current = { stocks, trades, watchlist, alerts, fnoTrades };
  }, [alerts, fnoTrades, stocks, trades, watchlist]);

  useEffect(() => {
    // Wait until the session is resolved so we never load the wrong scope.
    if (authLoading) return;

    let cancelled = false;
    const userId = user?.id;
    const empty: PortfolioSnapshot = { stocks: [], trades: [], watchlist: [], alerts: [], fnoTrades: [] };

    // Hard reset first: on sign-out or account switch the previous account's
    // rows must disappear even when the new scope has nothing to load.
    setReady(false);
    setSyncNotice(null);
    setStocks([]);
    setTrades([]);
    setWatchlist([]);
    setAlerts([]);
    setFnoTrades([]);
    setSelectedChartTicker(null);
    setSearchedSymbol(null);
    snapshotRef.current = empty;

    load().then((result) => {
      if (cancelled) return;
      const snapshot = result.snapshot;
      if (result.status === "degraded") {
        setSyncNotice(result.error ?? "Cloud sync is unavailable right now. Showing and saving on this device only.");
      }

      if (snapshot) {
        setStocks(snapshot.stocks);
        setTrades(snapshot.trades);
        setWatchlist(snapshot.watchlist);
        setAlerts(snapshot.alerts);
        setFnoTrades(snapshot.fnoTrades);
        setSelectedChartTicker(snapshot.stocks.find((stock) => stock.status === "Active")?.ticker ?? null);
      } else if (!userId) {
        // Signed-out demo only. Sample data is never seeded into an account.
        setStocks(initialData);
        setTrades(initialTrades);
        setWatchlist(initialWatchlist);
        setFnoTrades(fnOTradesData);
        setSelectedChartTicker(initialData.find((stock) => stock.status === "Active")?.ticker ?? null);
      }
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      setSyncNotice("Your saved portfolio could not be loaded. Check your connection and reload.");
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [load, authLoading, user?.id]);

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
  const handleWatchlistAdd    = useCallback((stock: WatchlistStock) => { void applySnapshot({ watchlist: [...snapshotRef.current.watchlist, stock] }, "Watchlist update"); }, [applySnapshot]);
  const handleWatchlistEdit   = useCallback((originalName: string, updatedStock: WatchlistStock) => { void applySnapshot({ watchlist: snapshotRef.current.watchlist.map((s) => s.stockName === originalName ? updatedStock : s) }, "Watchlist update"); }, [applySnapshot]);
  const handleWatchlistDelete = useCallback((stockName: string) => { void applySnapshot({ watchlist: snapshotRef.current.watchlist.filter((s) => s.stockName !== stockName) }, "Watchlist deletion"); }, [applySnapshot]);
  const handleJournalNotesUpdate = useCallback((ticker: string, notes: TradeJournalEntry) => {
    void applySnapshot(journalNotesPatch(snapshotRef.current, ticker, notes), "Journal update");
  }, [applySnapshot]);
  const handleAlertAdd        = useCallback((alert: PriceAlert) => { void applySnapshot({ alerts: [...snapshotRef.current.alerts, alert] }, "Alert update"); }, [applySnapshot]);
  const handleAlertDelete     = useCallback((id: string) => { void applySnapshot({ alerts: snapshotRef.current.alerts.filter((a) => a.id !== id) }, "Alert update"); }, [applySnapshot]);
  const handleAlertDismiss    = useCallback((id: string) => {
    const dismissedAt = new Date().toISOString();
    void applySnapshot({ alerts: snapshotRef.current.alerts.map((a) => a.id === id ? { ...a, dismissedAt } : a) }, "Alert update");
  }, [applySnapshot]);
  const handleFnoTradesUpdate = useCallback((nextTrades: FnOTrade[]) => {
    const sanitize = (t: FnOTrade) => { const { ltp, dayChange, iv, delta, ...rest } = t; return rest; };
    const prev = JSON.stringify(snapshotRef.current.fnoTrades.map(sanitize));
    const next = JSON.stringify(nextTrades.map(sanitize));
    if (prev === next) { snapshotRef.current = { ...snapshotRef.current, fnoTrades: nextTrades }; setFnoTrades(nextTrades); return; }
    void applySnapshot({ fnoTrades: nextTrades }, "F&O update");
  }, [applySnapshot]);

  // Alerts are evaluated only while this app is open, against quotes the
  // dashboard already polls. A quote must be a recent, timestamped observation
  // of a still-tracked symbol that postdates the alert; a failed refresh
  // invalidates the whole pass. Triggered and dismissed alerts are terminal,
  // so a repeated price refresh cannot notify twice.
  useEffect(() => {
    const { alerts: nextAlerts, newlyTriggered } = evaluateAlerts(
      snapshotRef.current.alerts,
      prices,
      {
        refreshFailed: priceError !== null,
        activeTickers: new Set(tickers),
      },
    );
    if (newlyTriggered.length === 0) return;

    void applySnapshot({ alerts: nextAlerts }, "Alert trigger");
    toast({
      title: newlyTriggered.length === 1 ? "Price alert triggered" : `${newlyTriggered.length} price alerts triggered`,
      description: newlyTriggered
        .map((a) => `${a.ticker} ${a.direction === "above" ? "≥" : "≤"} ₹${a.targetPrice}`)
        .join(" · "),
    });
  }, [prices, alerts, applySnapshot, toast, priceError, tickers]);

  // ── Derived, display-only values ──────────────────────────────────────────
  const m = useMemo(() => computeMetrics(live, fnoTrades, prices), [live, fnoTrades, prices]);
  const monthly = useMemo(() => realisedByMonth(live, fnoTrades), [live, fnoTrades]);
  const holdingRows = useMemo(() => m.active.map(toHoldingRow), [m.active]);
  const sectors = useMemo(() => getSectorAllocation(live), [live]);
  const activeTickers = useMemo(() => m.active.map((s) => s.ticker), [m.active]);

  // Keep the chart on a held symbol when the held set changes.
  useEffect(() => {
    const next = selectedChartTicker && activeTickers.includes(selectedChartTicker) ? selectedChartTicker : activeTickers[0] ?? null;
    if (next !== selectedChartTicker) setSelectedChartTicker(next);
  }, [activeTickers, selectedChartTicker]);

  const chartSymbol = searchedSymbol ?? selectedChartTicker;
  const chartHeld = !searchedSymbol ? m.active.find((s) => s.ticker === selectedChartTicker) ?? null : null;
  const chartQuote = chartHeld
    ? { price: chartHeld.cmp, pct: prices[chartHeld.ticker]?.changePercent ?? null }
    : null;

  const userEmail = user?.email ?? "";
  const userName = displayName || userEmail.split("@")[0] || "Trader";
  const openFno = useCallback(() => { setTradesSubTab("fno"); goTo("trades"); }, [goTo]);
  const triggeredAlerts = useMemo(() => alerts.filter((a) => a.triggered && !a.dismissedAt), [alerts]);

  const handleSearchSelect = useCallback((hit: { symbol: string }) => {
    setSearchedSymbol(hit.symbol.replace(/\.(NS|BO)$/i, "").toUpperCase());
    setSearchOpen(false);
    setChartScrollSignal((n) => n + 1);
    goTo("overview");
  }, [goTo]);

  // The chart only exists once the overview has settled (the swap may be delayed
  // by the section transition), so scroll after the entering phase ends.
  useEffect(() => {
    if (chartScrollSignal === 0 || phase !== "idle" || renderedTab !== "overview") return;
    const raf = requestAnimationFrame(() =>
      document.getElementById("zf-chart-title")?.scrollIntoView?.({ block: "center" }),
    );
    return () => cancelAnimationFrame(raf);
  }, [chartScrollSignal, phase, renderedTab]);

  const refreshStatus = priceError ? "Price refresh failed" : pricesLoading ? "Refreshing prices" : lastUpdated ? "Prices updated" : "";

  if (authLoading) return (
    <div className="zf" style={{ alignItems: "center", justifyContent: "center" }} role="status" aria-live="polite">
      <div className="zf-empty-state">
        <Loader2 className="zf-spin" size={26} aria-hidden="true" />
        <p className="zf-empty-body">Loading your portfolio…</p>
      </div>
    </div>
  );

  if (!user) return (
    <>
      <div className="zf" style={{ alignItems: "center", justifyContent: "center" }}>
        <main className="zf-card" style={{ maxWidth: 440, padding: 12 }}>
          <div className="zf-empty-state">
            <LogoMark size={44} />
            <h1 className="zf-card-title" style={{ fontSize: 22, marginTop: 8 }}>Sign in to ZenFolio</h1>
            <p className="zf-empty-body">Your portfolio, trades and watchlist are private to your account.</p>
            <div className="zf-empty-actions">
              <button type="button" className="zf-btn zf-btn-primary" onClick={() => setShowAuth(true)}>Sign in</button>
            </div>
          </div>
        </main>
      </div>
      <AuthModal open={showAuth} onOpenChange={setShowAuth} />
    </>
  );

  const loading = !ready;
  const pnlSentence = m.active.length > 0 || m.fnoOpen.length > 0
    ? <>Open positions are <strong>{m.pnl >= 0 ? "up" : "down"} {signedPct(m.pnlPct)}</strong> against cost.</>
    : "Add your first trade to start tracking performance.";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="zf">
        <a className="zf-skip" href="#zf-main">Skip to content</a>

        <Rail
          tab={tab}
          onSelect={goTo}
          theme={theme}
          onTheme={switchTheme}
          onHelp={() => setHelpOpen(true)}
          onSignOut={() => { void signOut(); }}
        />

        <div className="zf-stage">
          <TopBar
            tab={tab}
            onSelect={goTo}
            onMenu={() => setMobileNav(true)}
            market={{ isOpen: market.isOpen, label: market.label, description: market.description, istTime: market.istTime }}
            onRefresh={refresh}
            refreshing={Boolean(pricesLoading)}
            refreshStatus={refreshStatus}
            onSearch={() => setSearchOpen(true)}
            triggeredAlerts={triggeredAlerts}
            onDismissAlert={handleAlertDismiss}
            onManageAlerts={() => goTo("alerts")}
            onInfo={() => setInfoOpen(true)}
            userName={userName}
            userEmail={userEmail}
            onDisplayName={() => { setNameInput(displayName); setNameOpen(true); }}
            onSignOut={() => { void signOut(); }}
          />

          <main id="zf-main" className="zf-main" tabIndex={-1}>
          <div className="zf-section-body" data-phase={phase}>
            <div className="zf-page-head">
              <div>
                {renderedTab === "overview" ? (
                  <h1 className="zf-h1">{greeting()}, <em>{userName}</em></h1>
                ) : (
                  <h1 className="zf-h1 zf-h1-plain">{PAGE_TITLES[renderedTab]}</h1>
                )}
                <p className="zf-sub">{renderedTab === "overview" ? pnlSentence : navItem(renderedTab).hint}</p>
              </div>
            </div>

            {syncNotice && (
              <div className="zf-notice" role="status">
                <AlertTriangle aria-hidden="true" />
                <span>{syncNotice}</span>
              </div>
            )}
            {priceError && (
              <div className="zf-notice" role="alert">
                <AlertTriangle aria-hidden="true" />
                <span>Live prices could not be refreshed. Values may be out of date.</span>
                <button type="button" className="zf-btn zf-btn-outline zf-btn-sm" onClick={refresh}>Try again</button>
              </div>
            )}

            {renderedTab === "overview" && (
              <div className="zf-section-overview">
                <div className="zf-row1">
                  <BalanceCard
                    loading={loading} m={m} watchCount={watchlist.length}
                    onAdd={handlePortfolioAdd} onImport={handlePortfolioImport}
                    goTo={goTo} openFno={openFno}
                  />
                  <StatGrid loading={loading} m={m} />
                  <PnlCard
                    loading={loading} months={monthly.months} undated={monthly.undated}
                    onAdd={handlePortfolioAdd} onImport={handlePortfolioImport}
                  />
                </div>

                <div className="zf-row2">
                  <SectorCard sectors={sectors} loading={loading} goTo={goTo} />
                  <HoldingsCard
                    rows={holdingRows} loading={loading}
                    selected={chartHeld?.ticker ?? null}
                    onSelect={(t) => { setSearchedSymbol(null); setSelectedChartTicker(t); }}
                    openPortfolio={() => goTo("holdings")}
                    onAdd={handlePortfolioAdd} onImport={handlePortfolioImport}
                  />
                </div>

                <div className="zf-row3">
                  <div className="zf-stack">
                    <PriceChartCard
                      tickers={activeTickers}
                      selected={chartSymbol}
                      onSelect={(t) => { setSearchedSymbol(null); setSelectedChartTicker(t); }}
                      range={chartRange}
                      onRange={setChartRange}
                      quote={chartQuote}
                    />
                    <WatchlistCard watchlist={watchlist} loading={loading} onRemove={handleWatchlistDelete} goTo={goTo} />
                  </div>
                  <div className="zf-stack">
                    <InsightCard text={describeAiTeaser(m.active.length, bestPerformer(live))} goTo={goTo} />
                    <FnoCard m={m} loading={loading} openFno={openFno} />
                    <section className="zf-card zf-strip zf-pulse zf-in" style={stagger(10)} aria-labelledby="zf-pulse-title">
                      <div className="zf-card-head">
                        <h2 className="zf-card-title" id="zf-pulse-title">Market pulse</h2>
                        <span className="zf-chip-ico" aria-hidden="true"><Activity /></span>
                      </div>
                      <div className="zf-card-body">
                        <MarketIndexStrip />
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {renderedTab !== "overview" && (
              <div key={renderedTab} className="zf-tab-panel" style={{ minHeight: "calc(100dvh - 240px)" }}>
                {renderedTab === "holdings"  && <PortfolioTable stocks={live} onAdd={handlePortfolioAdd} onImport={handlePortfolioImport} onEdit={handlePortfolioEdit} onDelete={handlePortfolioDelete} />}
                {renderedTab === "trades" && (
                  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <div className="zf-subtabs" role="tablist" aria-label="Trade type">
                      {([
                        { id: "equity", label: "Equity trades", count: live.length },
                        { id: "fno",    label: "F&O positions", count: fnoTrades.length },
                      ] as const).map(st => (
                        <button key={st.id} type="button" role="tab" id={`zf-subtab-${st.id}`}
                          className="zf-subtab"
                          aria-selected={tradesSubTab === st.id}
                          aria-controls="zf-trades-panel"
                          tabIndex={tradesSubTab === st.id ? 0 : -1}
                          onClick={() => setTradesSubTab(st.id)}
                          onKeyDown={e => {
                            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                              e.preventDefault();
                              const next = st.id === "equity" ? "fno" : "equity";
                              setTradesSubTab(next);
                              document.getElementById(`zf-subtab-${next}`)?.focus();
                            }
                          }}>
                          {st.label}
                          <span className="zf-subtab-count">{st.count}</span>
                        </button>
                      ))}
                    </div>
                    <div id="zf-trades-panel" role="tabpanel" aria-labelledby={`zf-subtab-${tradesSubTab}`} style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                      {tradesSubTab === "equity" && <TradeStrategyTable trades={trades} onEdit={handleTradeEdit} onDelete={handleTradeDelete} />}
                      {tradesSubTab === "fno"    && <FnOTable trades={fnoTrades} onUpdate={handleFnoTradesUpdate} />}
                    </div>
                  </div>
                )}
                {renderedTab === "watchlist" && <WatchlistTable watchlist={watchlist} onAdd={handleWatchlistAdd} onEdit={handleWatchlistEdit} onDelete={handleWatchlistDelete} />}
                {renderedTab === "news"      && <StockNewsFeed stocks={live} />}
                {renderedTab === "charts"    && <PortfolioCharts stocks={live} />}
                {renderedTab === "analytics" && <TradeAnalytics stocks={live} />}
                {renderedTab === "history"   && <TradeHistory stocks={live} />}
                {renderedTab === "journal"   && <TradeJournal stocks={stocks} onUpdateNotes={handleJournalNotesUpdate} />}
                {renderedTab === "sector"    && <SectorDiversification stocks={live} />}
                {renderedTab === "alerts"    && <PriceAlerts alerts={alerts} onAddAlert={handleAlertAdd} onDeleteAlert={handleAlertDelete} onDismissAlert={handleAlertDismiss} />}
                {renderedTab === "ai"        && <AIInsights stocks={live} />}
                {renderedTab === "export"    && <ExportPortfolio stocks={live} />}
              </div>
            )}
          </div>
          </main>
        </div>
      </div>

      <MobileMenu
        open={mobileNav}
        onOpenChange={setMobileNav}
        tab={tab}
        onSelect={goTo}
        theme={theme}
        onTheme={switchTheme}
        userName={userName}
        userEmail={userEmail}
        onDisplayName={() => { setNameInput(displayName); setNameOpen(true); }}
        onHelp={() => setHelpOpen(true)}
        onInfo={() => setInfoOpen(true)}
        onSignOut={() => { void signOut(); }}
      />

      {/* Symbol search */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Search symbols</DialogTitle>
            <DialogDescription>Pick a symbol to see its price chart on the overview.</DialogDescription>
          </DialogHeader>
          <div style={{ minHeight: 320 }}>
            <SymbolSearch onSelect={handleSearchSelect} placeholder="Search by name or ticker" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Display name */}
      <Dialog open={nameOpen} onOpenChange={setNameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Display name</DialogTitle>
            <DialogDescription>Shown in your greeting and account menu.</DialogDescription>
          </DialogHeader>
          <form
            className="zf-form-row"
            onSubmit={(e) => { e.preventDefault(); void handleSaveDisplayName(); }}
          >
            <label className="zf-label" htmlFor="zf-name-input">Name</label>
            <input
              id="zf-name-input" className="zf-input" value={nameInput} maxLength={40} autoFocus
              onChange={(e) => setNameInput(e.target.value)} placeholder={userEmail.split("@")[0] || "Your name"}
            />
            <button type="submit" className="zf-btn zf-btn-primary" disabled={nameSaving || !nameInput.trim()}>
              {nameSaving ? "Saving…" : "Save name"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Where things are</DialogTitle>
            <DialogDescription>Every section is in the left rail. Hover an icon to see its name.</DialogDescription>
          </DialogHeader>
          <ul className="zf-guide">
            {NAV_ITEMS.map(({ id, label, icon: Icon, hint }) => (
              <li key={id}>
                <Icon aria-hidden="true" />
                <div><b>{label}</b><span>{hint}</span></div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Data + integrations */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Data and integrations</DialogTitle>
            <DialogDescription>How fresh your prices are and which providers are connected.</DialogDescription>
          </DialogHeader>
          <dl className="zf-status-list">
            <div><dt>Exchange</dt><dd>NSE {market.label} · {market.istTime} IST</dd></div>
            <div><dt>Price data</dt><dd>{dataMode === "unknown" ? "Not verified yet" : dataModeLabel(dataMode)}</dd></div>
            <div><dt>Symbols tracked</dt><dd>{tickers.length}</dd></div>
          </dl>
          <HealthPanel />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

