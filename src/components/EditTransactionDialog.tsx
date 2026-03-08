import { useState, useEffect } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface EditTransactionDialogProps {
  stock: PortfolioStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: PortfolioStock) => void;
}

const EditTransactionDialog = ({ stock, open, onOpenChange, onSave }: EditTransactionDialogProps) => {
  const { toast } = useToast();
  const [form, setForm] = useState({
    ticker: "",
    stockName: "",
    entryDate: "",
    entryPrice: "",
    cmp: "",
    weekHigh52: "",
    quantity: "",
    exitPrice: "",
    exitDate: "",
    status: "Active" as PortfolioStock["status"],
  });

  useEffect(() => {
    if (stock) {
      setForm({
        ticker: stock.ticker,
        stockName: stock.stockName,
        entryDate: stock.entryDate,
        entryPrice: stock.entryPrice.toString(),
        cmp: stock.cmp.toString(),
        weekHigh52: stock.weekHigh52.toString(),
        quantity: stock.quantity.toString(),
        exitPrice: stock.exitPrice?.toString() || "",
        exitDate: stock.exitDate || "",
        status: stock.status,
      });
    }
  }, [stock]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.stockName || !form.entryPrice || !form.quantity || !form.cmp) {
      toast({ title: "Missing fields", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const updated: PortfolioStock = {
      ticker: form.ticker.toUpperCase(),
      stockName: form.stockName,
      entryDate: form.entryDate,
      entryPrice: parseFloat(form.entryPrice),
      cmp: parseFloat(form.cmp),
      weekHigh52: parseFloat(form.weekHigh52) || parseFloat(form.cmp),
      quantity: parseInt(form.quantity),
      status: form.status,
      ...(form.exitPrice ? { exitPrice: parseFloat(form.exitPrice) } : {}),
      ...(form.exitDate ? { exitDate: form.exitDate } : {}),
    };

    onSave(updated);
    toast({ title: "Transaction updated", description: `${updated.ticker} has been updated` });
    onOpenChange(false);
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Transaction — {form.ticker} (₹ INR)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Ticker *</Label>
              <Input value={form.ticker} onChange={(e) => updateField("ticker", e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Stock Name *</Label>
              <Input value={form.stockName} onChange={(e) => updateField("stockName", e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Entry Price (₹) *</Label>
              <Input type="number" step="0.01" value={form.entryPrice} onChange={(e) => updateField("entryPrice", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CMP (₹) *</Label>
              <Input type="number" step="0.01" value={form.cmp} onChange={(e) => updateField("cmp", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Quantity *</Label>
              <Input type="number" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Entry Date</Label>
              <Input value={form.entryDate} onChange={(e) => updateField("entryDate", e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">52W High (₹)</Label>
              <Input type="number" step="0.01" value={form.weekHigh52} onChange={(e) => updateField("weekHigh52", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => updateField("status", v)}>
                <SelectTrigger className="bg-secondary border-border text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="Active">🟢 Active (Open)</SelectItem>
                  <SelectItem value="Sold Profit">✅ Closed (Profit)</SelectItem>
                  <SelectItem value="Sold Loss">❌ Closed (Loss)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.status !== "Active" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Exit Price (₹)</Label>
                <Input type="number" step="0.01" value={form.exitPrice} onChange={(e) => updateField("exitPrice", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Exit Date</Label>
                <Input value={form.exitDate} onChange={(e) => updateField("exitDate", e.target.value)} className="bg-secondary border-border text-sm" />
              </div>
            </div>
          )}
          <Button type="submit" className="w-full mt-2">Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditTransactionDialog;
