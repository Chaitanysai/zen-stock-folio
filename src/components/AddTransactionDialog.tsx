import { useState, useRef } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, CheckCircle2, AlertCircle, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AddTransactionDialogProps {
  onAdd: (stock: PortfolioStock) => void;
}

const EMPTY_FORM = {
  ticker: "",
  stockName: "",
  entryDate: "",
  entryPrice: "",
  quantity: "",
  exitPrice: "",
  exitDate: "",
  status: "Active" as PortfolioStock["status"],
};

const AddTransactionDialog = ({ onAdd }: AddTransactionDialogProps) => {
  const [open, setOpen]     = useState(false);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [fetchedCmp, setFetchedCmp]         = useState<number | null>(null);
  const [fetchedHigh, setFetchedHigh]       = useState<number | null>(null);
  const [fetchedLow, setFetchedLow]         = useState<number | null>(null);
  const [fetchedChange, setFetchedChange]   = useState<number | null>(null);
  const [priceStatus, setPriceStatus]       = useState<"idle" | "loading" | "success" | "error">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const f = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }));

  // Auto-fetch CMP when ticker is typed (debounced 800ms)
  const handleTickerChange = (raw: string) => {
    const val = raw.toUpperCase().trim();
    f("ticker", val);
    setFetchedCmp(null);
    setPriceStatus("idle");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length < 2) return;

    debounceRef.current = setTimeout(async () => {
      setPriceStatus("loading");
      try {
        const res  = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: [val] }),
        });
        const data = await res.json();
        const p    = data?.prices?.[val];
        if (p && p.price > 0) {
          setFetchedCmp(p.price);
          setFetchedHigh(p.weekHigh52 || null);
          setFetchedLow(p.weekLow52   || null);
          setFetchedChange(p.changePercent || null);
          setPriceStatus("success");
        } else {
          setPriceStatus("error");
        }
      } catch {
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

    const cmpToUse = fetchedCmp ?? parseFloat(form.entryPrice);

    const stock: PortfolioStock = {
      ticker:     form.ticker.toUpperCase(),
      stockName:  form.stockName,
      entryDate:  form.entryDate || new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      entryPrice: parseFloat(form.entryPrice),
      cmp:        cmpToUse,
      weekHigh52: fetchedHigh ?? cmpToUse,
      weekLow52:  fetchedLow  ?? cmpToUse,
      dailyChange: fetchedChange ?? 0,
      quantity:   parseInt(form.quantity),
      status:     form.status,
      ...(form.exitPrice ? { exitPrice: parseFloat(form.exitPrice) } : {}),
      ...(form.exitDate  ? { exitDate:  form.exitDate }              : {}),
    };

    onAdd(stock);
    toast({ title: "Trade added ✅", description: `${stock.ticker} added to your portfolio.` });
    setForm(EMPTY_FORM);
    setFetchedCmp(null);
    setFetchedHigh(null);
    setFetchedLow(null);
    setFetchedChange(null);
    setPriceStatus("idle");
    setOpen(false);
  };

  const isPositive = (fetchedChange ?? 0) >= 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs gradient-primary border-0 text-white font-semibold">
          <Plus className="h-3.5 w-3.5" /> Add Trade
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <TrendingUp className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
            Add New Trade
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">

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
                  ₹{fetchedCmp.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                {fetchedChange !== null && (
                  <span className={`font-semibold ticker ${isPositive ? "text-profit" : "text-loss"}`}>
                    {isPositive ? "▲" : "▼"} {Math.abs(fetchedChange).toFixed(2)}%
                  </span>
                )}
                {fetchedHigh && <span>52W H: <span className="ticker">₹{fetchedHigh.toFixed(0)}</span></span>}
                {fetchedLow  && <span>52W L: <span className="ticker">₹{fetchedLow.toFixed(0)}</span></span>}
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
                Entry Price (₹) *
              </Label>
              <Input
                type="number" step="0.01" placeholder="₹0.00"
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
              <Input
                type="date"
                value={form.entryDate}
                onChange={e => f("entryDate", e.target.value)}
                className="bg-secondary border-border text-sm"
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
              <SelectContent className="bg-popover border-border">
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
                  Exit Price (₹)
                </Label>
                <Input
                  type="number" step="0.01" placeholder="₹0.00"
                  value={form.exitPrice}
                  onChange={e => f("exitPrice", e.target.value)}
                  className="bg-secondary border-border text-sm font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Exit Date
                </Label>
                <Input
                  type="date"
                  value={form.exitDate}
                  onChange={e => f("exitDate", e.target.value)}
                  className="bg-secondary border-border text-sm"
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