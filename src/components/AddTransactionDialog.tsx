import { useState, useRef, useEffect, type ReactNode } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/ui/date-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchQuotes } from "@/lib/market-data/client";
import { instrumentKey } from "@/lib/market-data/symbols";
import { buildManualPosition } from "@/lib/portfolio/manual";
import { useFxRate } from "@/hooks/useFxRate";
import { currencySymbol, formatNative } from "@/lib/portfolio/display";

interface AddTransactionDialogProps {
  onAdd: (stock: PortfolioStock) => void;
  /** Custom opener (rendered inside `DialogTrigger asChild`). Defaults to the standard button. */
  trigger?: ReactNode;
}

export const EMPTY_FORM = {
  market: "NSE" as "NSE" | "US",
  ticker: "",
  stockName: "",
  entryDate: "",
  entryPrice: "",
  quantity: "",
  exitPrice: "",
  exitDate: "",
  status: "Active" as PortfolioStock["status"],
};

export type TransactionForm = typeof EMPTY_FORM;

export interface QuoteSnapshot {
  cmp: number | null;
  high: number | null;
  low: number | null;
  change: number | null;
}

/** Identity of the instrument a quote was requested for. */
export const quoteRequestKey = (market: "NSE" | "US", ticker: string): string =>
  `${market}:${ticker.trim().toUpperCase()}`;

/**
 * True only when a quote response still belongs to the current form. A response
 * for the previous market or ticker must be dropped, not saved as the CMP.
 */
export const isCurrentQuote = (
  requestedKey: string,
  form: Pick<TransactionForm, "market" | "ticker">,
): boolean => requestedKey === quoteRequestKey(form.market, form.ticker);

const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** A blank entry date means "today" to `buildManualPosition`. */
export const isEntryTodayOrBlank = (entryDate: string, now: Date = new Date()): boolean => {
  const value = entryDate.trim();
  return value === "" || value === localDateKey(now);
};

/**
 * The FX rate at cost is only knowable for a lot opened today. A back-dated
 * entry gets no rate rather than today's rate mislabelled as the historical
 * one; the UI then says FX P&L is unavailable.
 */
export const fxAtCostAt = (
  market: "NSE" | "US",
  entryDate: string,
  rate: number | null,
  now: Date = new Date(),
): number | undefined =>
  market === "US" && rate !== null && Number.isFinite(rate) && rate > 0 && isEntryTodayOrBlank(entryDate, now)
    ? rate
    : undefined;

export function buildDialogPosition(
  form: TransactionForm,
  quote: QuoteSnapshot,
  fxRate: number | null,
  now: Date = new Date(),
): PortfolioStock | null {
  return buildManualPosition({
    market: form.market,
    ticker: form.ticker,
    stockName: form.stockName,
    entryDate: form.entryDate || undefined,
    entryPrice: parseFloat(form.entryPrice),
    // Number, not parseInt: "1.5" must reach buildManualPosition's integer guard
    // instead of being silently truncated to 1.
    quantity: Number(form.quantity),
    cmp: quote.cmp ?? undefined,
    weekHigh52: quote.high ?? undefined,
    weekLow52: quote.low ?? undefined,
    dailyChange: quote.change ?? undefined,
    status: form.status,
    fxAtCost: fxAtCostAt(form.market, form.entryDate, fxRate, now),
    ...(form.exitPrice ? { exitPrice: parseFloat(form.exitPrice) } : {}),
    ...(form.exitDate ? { exitDate: form.exitDate } : {}),
  });
}

const AddTransactionDialog = ({ onAdd, trigger }: AddTransactionDialogProps) => {
  const [open, setOpen]     = useState(false);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [fetchedCmp, setFetchedCmp]         = useState<number | null>(null);
  const [fetchedHigh, setFetchedHigh]       = useState<number | null>(null);
  const [fetchedLow, setFetchedLow]         = useState<number | null>(null);
  const [fetchedChange, setFetchedChange]   = useState<number | null>(null);
  const [priceStatus, setPriceStatus]       = useState<"idle" | "loading" | "success" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const quoteKeyRef = useRef<string | null>(null);
  const formRef = useRef(form);
  const { toast } = useToast();

  const { rate: usdInr, loading: fxLoading, error: fxError } = useFxRate({ enabled: form.market === "US" });
  const symbol = currencySymbol(form.market === "US" ? "USD" : "INR");

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const f = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  /** Drop the pending timer and any in-flight quote for the old instrument. */
  const cancelQuoteRequest = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    quoteAbortRef.current?.abort();
    quoteAbortRef.current = null;
    quoteKeyRef.current = null;
  };

  // Cancel on unmount too: a late response must not write into a gone form.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    quoteAbortRef.current?.abort();
  }, []);

  // Auto-fetch CMP when ticker is typed (debounced 800ms)
  const handleTickerChange = (raw: string) => {
    const val = raw.toUpperCase().trim();
    f("ticker", val);
    cancelQuoteRequest();
    setFetchedCmp(null);
    setFetchedHigh(null);
    setFetchedLow(null);
    setFetchedChange(null);
    setPriceStatus("idle");

    if (val.length < 2) return;

    // Capture the instrument at schedule time; the response is applied only if
    // this key still matches the form (market and ticker can both change first).
    const key = quoteRequestKey(form.market, val);
    const market = form.market;
    const controller = new AbortController();
    quoteKeyRef.current = key;

    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      quoteAbortRef.current = controller;
      setPriceStatus("loading");
      const instrument = { market, ticker: val } as const;
      try {
        // fetchQuotes goes through apiFetch, so the Firebase bearer token is
        // attached; the old raw fetch("/api/prices") always answered 401.
        const response = await fetchQuotes([instrument], { signal: controller.signal });
        if (!isCurrentQuote(key, formRef.current)) return;
        const quote = response.quotes[instrumentKey(instrument)]?.quote;
        if (quote?.price && quote.price > 0) {
          setFetchedCmp(quote.price);
          setFetchedHigh(quote.weekHigh52 ?? null);
          setFetchedLow(quote.weekLow52 ?? null);
          setFetchedChange(quote.changePercent ?? null);
          setPriceStatus("success");
        } else {
          setPriceStatus("error");
        }
      } catch {
        // An abort is a supersede, not a provider failure.
        if (controller.signal.aborted || !isCurrentQuote(key, formRef.current)) return;
        setPriceStatus("error");
      }
    }, 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.stockName || !form.entryPrice || !form.quantity) {
      toast({ title: "Missing fields", description: "Ticker, stock name, entry price and quantity are required.", variant: "destructive" });
      return;
    }

    const stock = buildDialogPosition(
      form,
      { cmp: fetchedCmp, high: fetchedHigh, low: fetchedLow, change: fetchedChange },
      usdInr,
    );

    if (!stock) {
      toast({
        title: "Invalid trade",
        description: "Check the ticker symbol, entry price, and whole-number quantity.",
        variant: "destructive",
      });
      return;
    }

    onAdd(stock);
    toast({ title: "Trade added", description: `${stock.ticker} added to your portfolio.` });
    cancelQuoteRequest();
    setForm(EMPTY_FORM);
    setFetchedCmp(null);
    setFetchedHigh(null);
    setFetchedLow(null);
    setFetchedChange(null);
    setPriceStatus("idle");
    setOpen(false);
  };

  const isPositive = (fetchedChange ?? 0) >= 0;
  // FX P&L needs a rate at cost. A back-dated lot gets no rate (today's would
  // be wrong), and an unavailable rate is disclosed only after it has settled.
  const entryBackDated = form.market === "US" && !isEntryTodayOrBlank(form.entryDate);
  const fxUnavailable = form.market === "US" && !fxLoading && usdInr === null && fxError !== null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-1.5 text-xs gradient-primary border-0 text-white font-semibold">
            <Plus className="h-3.5 w-3.5" /> Add Trade
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <TrendingUp className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
            Add New Trade
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">

          {/* Market */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Market
            </Label>
            <Select
              value={form.market}
              onValueChange={(value) => {
                // The old market's quote must not survive the switch: cancel
                // both the pending debounce and an in-flight fetch.
                cancelQuoteRequest();
                f("market", value);
                setFetchedCmp(null);
                setFetchedHigh(null);
                setFetchedLow(null);
                setFetchedChange(null);
                setPriceStatus("idle");
              }}
            >
              <SelectTrigger className="bg-secondary border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="NSE">NSE · India (₹)</SelectItem>
                <SelectItem value="US">US · United States ($)</SelectItem>
              </SelectContent>
            </Select>
            {(entryBackDated || fxUnavailable) && (
              <p className="text-xs text-muted-foreground" role="status">
                {entryBackDated
                  ? "Entry is back-dated — today's USD→INR rate is not the rate at cost, so FX P&L will be unavailable for this trade."
                  : "USD→INR rate unavailable — FX P&L will be unavailable for this trade."}
              </p>
            )}
          </div>

          {/* Ticker + live price fetch */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ticker Symbol *
              </Label>
              <div className="relative">
                <Input
                  placeholder="e.g. RELIANCE"
                  value={form.ticker}
                  onChange={e => handleTickerChange(e.target.value)}
                  className="bg-secondary border-border text-sm font-mono pr-8 uppercase"
                />
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {priceStatus === "loading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {priceStatus === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-profit" />}
                  {priceStatus === "error"   && <AlertCircle  className="h-3.5 w-3.5 text-loss" />}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Stock Name *
              </Label>
              <Input
                placeholder="e.g. Reliance Industries"
                value={form.stockName}
                onChange={e => f("stockName", e.target.value)}
                className="bg-secondary border-border text-sm"
              />
            </div>
          </div>

          {/* Live CMP banner — shows after fetch */}
          {priceStatus === "loading" && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                 style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Fetching live price for <strong>{form.ticker}</strong>…
            </div>
          )}

          {priceStatus === "success" && fetchedCmp && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium"
                 style={{ background: "hsl(var(--profit) / 0.08)", border: "1px solid hsl(var(--profit) / 0.25)" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-profit shrink-0" />
                <span className="text-muted-foreground">Live CMP fetched:</span>
                <span className="font-bold ticker text-sm" style={{ color: "hsl(var(--profit))" }}>
                  {formatNative(fetchedCmp, form.market === "US" ? "USD" : "INR", 2)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                {fetchedChange !== null && (
                  <span className={`font-semibold ticker ${isPositive ? "text-profit" : "text-loss"}`}>
                    {isPositive ? "▲" : "▼"} {Math.abs(fetchedChange).toFixed(2)}%
                  </span>
                )}
                {fetchedHigh && <span>52W H: <span className="ticker">{formatNative(fetchedHigh, form.market === "US" ? "USD" : "INR", 0)}</span></span>}
                {fetchedLow  && <span>52W L: <span className="ticker">{formatNative(fetchedLow, form.market === "US" ? "USD" : "INR", 0)}</span></span>}
              </div>
            </div>
          )}

          {priceStatus === "error" && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                 style={{ background: "hsl(var(--loss) / 0.08)", border: "1px solid hsl(var(--loss) / 0.2)", color: "hsl(var(--loss))" }}>
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Could not fetch price for <strong>{form.ticker}</strong> — check the ticker symbol. CMP will use entry price.
            </div>
          )}

          {/* Entry Price + Qty + Date */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Entry Price ({symbol}) *
              </Label>
              <Input
                type="number" step="0.01" placeholder={`${symbol}0.00`}
                value={form.entryPrice}
                onChange={e => f("entryPrice", e.target.value)}
                className="bg-secondary border-border text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Quantity *
              </Label>
              <Input
                type="number" placeholder="0"
                value={form.quantity}
                onChange={e => f("quantity", e.target.value)}
                className="bg-secondary border-border text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Entry Date
              </Label>
              <DateField
                value={form.entryDate}
                onChange={(value) => f("entryDate", value)}
                placeholder="Today"
                toDate={new Date()}
                aria-label="Entry date"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trade Status
            </Label>
            <Select value={form.status} onValueChange={v => f("status", v)}>
              <SelectTrigger className="bg-secondary border-border text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">🟢 Active — Position Open</SelectItem>
                <SelectItem value="Sold Profit">✅ Closed — Profit</SelectItem>
                <SelectItem value="Sold Loss">❌ Closed — Loss</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Exit fields only if closed */}
          {form.status !== "Active" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Exit Price ({symbol})
                </Label>
                <Input
                  type="number" step="0.01" placeholder={`${symbol}0.00`}
                  value={form.exitPrice}
                  onChange={e => f("exitPrice", e.target.value)}
                  className="bg-secondary border-border text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Exit Date
                </Label>
                <DateField
                  value={form.exitDate}
                  onChange={(value) => f("exitDate", value)}
                  placeholder="Pick exit date"
                  toDate={new Date()}
                  aria-label="Exit date"
                />
              </div>
            </div>
          )}

          <Button type="submit" className="w-full mt-1 gradient-primary border-0 text-white font-semibold gap-2">
            <TrendingUp className="h-4 w-4" />
            Add Trade to Portfolio
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTransactionDialog;
