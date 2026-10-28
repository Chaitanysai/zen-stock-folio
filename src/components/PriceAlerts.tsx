import { useState } from "react";
import { PriceAlert } from "@/data/sampleData";
import { Bell, BellRing, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface PriceAlertsProps {
  alerts: PriceAlert[];
  onAddAlert: (alert: PriceAlert) => void;
  onDeleteAlert: (id: string) => void;
  onDismissAlert: (id: string) => void;
}

const PriceAlerts = ({ alerts, onAddAlert, onDeleteAlert, onDismissAlert }: PriceAlertsProps) => {
  const [addOpen, setAddOpen] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({ ticker: "", type: "target_hit" as PriceAlert["type"], targetPrice: "", direction: "above" as PriceAlert["direction"] });

  const handleAdd = () => {
    const ticker = form.ticker.trim().toUpperCase();
    const targetPrice = Number(form.targetPrice);
    if (!ticker || !Number.isFinite(targetPrice) || targetPrice <= 0) {
      toast({ title: "Invalid alert", description: "Enter a ticker and a target price greater than zero.", variant: "destructive" });
      return;
    }
    const alert: PriceAlert = {
      id: crypto.randomUUID(),
      ticker,
      type: form.type,
      targetPrice,
      direction: form.direction,
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    onAddAlert(alert);
    setForm({ ticker: "", type: "target_hit", targetPrice: "", direction: "above" });
    setAddOpen(false);
    toast({ title: "Alert created", description: `Alert set for ${alert.ticker} at ₹${alert.targetPrice}` });
  };

  const visibleAlerts = alerts.filter(a => !a.dismissedAt);
  const triggeredAlerts = visibleAlerts.filter(a => a.triggered);
  const activeAlerts = visibleAlerts.filter(a => !a.triggered);

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Price Alerts</h2>
            <p className="text-xs text-muted-foreground mt-1">{activeAlerts.length} active · {triggeredAlerts.length} triggered</p>
          </div>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> New Alert</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md bg-card border-border" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle className="text-foreground">Create Price Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="alert-ticker" className="text-xs text-muted-foreground">Ticker</Label>
                <Input id="alert-ticker" placeholder="e.g. RELIANCE" value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value }))} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="alert-type" className="text-xs text-muted-foreground">Alert Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as PriceAlert["type"] }))}>
                    <SelectTrigger id="alert-type" aria-label="Alert type" className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="target_hit">🎯 Target Hit</SelectItem>
                      <SelectItem value="sl_hit">🛑 Stop Loss Hit</SelectItem>
                      <SelectItem value="entry_zone">🟢 Entry Zone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="alert-direction" className="text-xs text-muted-foreground">Direction</Label>
                  <Select value={form.direction} onValueChange={v => setForm(p => ({ ...p, direction: v as PriceAlert["direction"] }))}>
                    <SelectTrigger id="alert-direction" aria-label="Alert direction" className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="above">Price Above</SelectItem>
                      <SelectItem value="below">Price Below</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="alert-target-price" className="text-xs text-muted-foreground">Target Price (₹)</Label>
                <Input id="alert-target-price" type="number" step="0.01" placeholder="₹0.00" value={form.targetPrice} onChange={e => setForm(p => ({ ...p, targetPrice: e.target.value }))} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <Button onClick={handleAdd} className="w-full">Create Alert</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="border-b border-border bg-secondary/30 px-4 py-2 text-[11px] text-muted-foreground">
        Evaluated while this app is open · no background or push notifications. Alerts fire only on quotes received after the alert was created. Symbols outside your portfolio are fetched with your price updates.
      </p>

      <div className="p-4 space-y-3">
        {/* Triggered alerts */}
        {triggeredAlerts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-warning uppercase tracking-wider">🔔 Triggered</h3>
            {triggeredAlerts.map(a => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <BellRing className="h-4 w-4 shrink-0 text-warning" />
                  <span className="font-mono text-sm font-semibold text-primary">{a.ticker}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.type === "target_hit" ? "🎯 Target" : a.type === "sl_hit" ? "🛑 SL" : "🟢 Entry"} — ₹{a.targetPrice}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Dismiss alert for ${a.ticker}`} onClick={() => onDismissAlert(a.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Active alerts */}
        {activeAlerts.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Alerts</h3>
            {activeAlerts.map(a => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-primary">{a.ticker}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {a.type === "target_hit" ? "🎯 Target" : a.type === "sl_hit" ? "🛑 SL" : "🟢 Entry"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {a.direction === "above" ? "≥" : "≤"} ₹{a.targetPrice}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-loss hover:text-loss" aria-label={`Delete alert for ${a.ticker}`} onClick={() => onDeleteAlert(a.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          triggeredAlerts.length === 0 && (
            <div className="zf-empty-state">
              <div className="zf-empty-icon" aria-hidden="true"><Bell /></div>
              <h3 className="zf-empty-title">No alerts set</h3>
              <p className="zf-empty-body">
                Create one to track a price level while this app is open.
              </p>
              <Button size="sm" className="zf-empty-action gap-1.5 text-xs" onClick={() => setAddOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Create your first alert
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PriceAlerts;
