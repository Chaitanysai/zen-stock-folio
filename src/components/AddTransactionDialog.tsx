import { useState } from "react";
import { PortfolioStock } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AddTransactionDialogProps {
  onAdd: (stock: PortfolioStock) => void;
}

const AddTransactionDialog = ({ onAdd }: AddTransactionDialogProps) => {
  const [open, setOpen] = useState(false);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.stockName || !form.entryPrice || !form.quantity || !form.cmp) {
      toast({ title: "Missing fields", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    const stock: PortfolioStock = {
      ticker: form.ticker.toUpperCase(),
      stockName: form.stockName,
      entryDate: form.entryDate || new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      entryPrice: parseFloat(form.entryPrice),
      cmp: parseFloat(form.cmp),
      weekHigh52: parseFloat(form.weekHigh52) || parseFloat(form.cmp),
      quantity: parseInt(form.quantity),
      status: form.status,
      ...(form.exitPrice ? { exitPrice: parseFloat(form.exitPrice) } : {}),
      ...(form.exitDate ? { exitDate: form.exitDate } : {}),
    };

    onAdd(stock);
    toast({ title: "Transaction added", description: `${stock.ticker} added to portfolio` });
    setForm({ ticker: "", stockName: "", entryDate: "", entryPrice: "", cmp: "", weekHigh52: "", quantity: "", exitPrice: "", exitDate: "", status: "Active" });
    setOpen(false);
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Transaction (₹ INR)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Ticker *</Label>
              <Input placeholder="e.g. RELIANCE" value={form.ticker} onChange={(e) => updateField("ticker", e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Stock Name *</Label>
              <Input placeholder="e.g. Reliance Industries" value={form.stockName} onChange={(e) => updateField("stockName", e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Entry Price (₹) *</Label>
              <Input type="number" step="0.01" placeholder="₹0.00" value={form.entryPrice} onChange={(e) => updateField("entryPrice", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CMP (₹) *</Label>
              <Input type="number" step="0.01" placeholder="₹0.00" value={form.cmp} onChange={(e) => updateField("cmp", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Quantity *</Label>
              <Input type="number" placeholder="0" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Entry Date</Label>
              <Input type="date" value={form.entryDate} onChange={(e) => updateField("entryDate", e.target.value)} className="bg-secondary border-border text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">52W High (₹)</Label>
              <Input type="number" step="0.01" placeholder="₹0.00" value={form.weekHigh52} onChange={(e) => updateField("weekHigh52", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
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
                <Input type="number" step="0.01" placeholder="₹0.00" value={form.exitPrice} onChange={(e) => updateField("exitPrice", e.target.value)} className="bg-secondary border-border text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Exit Date</Label>
                <Input type="date" value={form.exitDate} onChange={(e) => updateField("exitDate", e.target.value)} className="bg-secondary border-border text-sm" />
              </div>
            </div>
          )}
          <Button type="submit" className="w-full mt-2">Add to Portfolio</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddTransactionDialog;
