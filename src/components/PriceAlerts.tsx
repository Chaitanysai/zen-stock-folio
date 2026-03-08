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
    if (!form.ticker || !form.targetPrice) {
      toast({ title: "Missing fields", description: "Please fill ticker and price", variant: "destructive" });
      return;
    }
    const alert: PriceAlert = {
      id: crypto.randomUUID(),
      ticker: form.ticker.toUpperCase(),
      type: form.type,
      targetPrice: parseFloat(form.targetPrice),
      direction: form.direction,
      triggered: false,
      createdAt: new Date().toISOString(),
    };
    onAddAlert(alert);
    setForm({ ticker: "", type: "target_hit", targetPrice: "", direction: "above" });
    setAddOpen(false);
    toast({ title: "Alert created", description: `Alert set for ${alert.ticker} at ₹${alert.targetPrice}` });
  };

  const triggeredAlerts = alerts.filter(a => a.triggered);
  const activeAlerts = alerts.filter(a => !a.triggered);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
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
          <DialogContent className="sm:max-w-md bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Create Price Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Ticker</Label>
                <Input placeholder="e.g. RELIANCE" value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value }))} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Alert Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as PriceAlert["type"] }))}>
                    <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="target_hit">🎯 Target Hit</SelectItem>
                      <SelectItem value="sl_hit">🛑 Stop Loss Hit</SelectItem>
                      <SelectItem value="entry_zone">🟢 Entry Zone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Direction</Label>
                  <Select value={form.direction} onValueChange={v => setForm(p => ({ ...p, direction: v as PriceAlert["direction"] }))}>
                    <SelectTrigger className="bg-secondary border-border text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="above">Price Above</SelectItem>
                      <SelectItem value="below">Price Below</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target Price (₹)</Label>
                <Input type="number" step="0.01" placeholder="₹0.00" value={form.targetPrice} onChange={e => setForm(p => ({ ...p, targetPrice: e.target.value }))} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <Button onClick={handleAdd} className="w-full">Create Alert</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-4 space-y-3">
        {/* Triggered alerts */}
        {triggeredAlerts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-warning uppercase tracking-wider">🔔 Triggered</h3>
            {triggeredAlerts.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-warning animate-pulse" />
                  <span className="font-mono text-sm font-semibold text-primary">{a.ticker}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.type === "target_hit" ? "🎯 Target" : a.type === "sl_hit" ? "🛑 SL" : "🟢 Entry"} — ₹{a.targetPrice}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDismissAlert(a.id)}>
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
              <div key={a.id} className="flex items-center justify-between bg-secondary/50 rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-primary">{a.ticker}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {a.type === "target_hit" ? "🎯 Target" : a.type === "sl_hit" ? "🛑 SL" : "🟢 Entry"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {a.direction === "above" ? "≥" : "≤"} ₹{a.targetPrice}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-loss hover:text-loss" onClick={() => onDeleteAlert(a.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          triggeredAlerts.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No alerts set. Create one to get notified when prices hit your targets.</p>
          )
        )}
      </div>
    </div>
  );
};

export default PriceAlerts;
