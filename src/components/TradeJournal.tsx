import { useState } from "react";
import { PortfolioStock, TradeJournalEntry } from "@/data/sampleData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BookOpen, MessageSquare } from "lucide-react";

interface TradeJournalProps {
  stocks: PortfolioStock[];
  onUpdateNotes: (ticker: string, notes: TradeJournalEntry) => void;
}

const TradeJournal = ({ stocks, onUpdateNotes }: TradeJournalProps) => {
  const [editTicker, setEditTicker] = useState<string | null>(null);
  const [form, setForm] = useState<TradeJournalEntry>({});

  const openEdit = (stock: PortfolioStock) => {
    setEditTicker(stock.ticker);
    setForm(stock.notes || {});
  };

  const save = () => {
    if (editTicker) {
      onUpdateNotes(editTicker, form);
      setEditTicker(null);
    }
  };

  const stocksWithNotes = stocks.filter(s => s.notes && Object.values(s.notes).some(v => v));

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Trade Journal</h2>
          <p className="text-xs text-muted-foreground mt-1">Record your reasoning, strategy, and lessons for each trade</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* All stocks list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stocks.map(stock => {
            const hasNotes = stock.notes && Object.values(stock.notes).some(v => v);
            return (
              <div key={stock.ticker} className="bg-secondary/50 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono font-semibold text-primary text-sm">{stock.ticker}</span>
                    <span className="text-xs text-muted-foreground ml-2">{stock.stockName}</span>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(stock)}>
                        <MessageSquare className="h-3 w-3" /> {hasNotes ? "Edit" : "Add Notes"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg bg-card border-border">
                      <DialogHeader>
                        <DialogTitle className="text-foreground">Trade Journal — {stock.ticker}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Trade Reason</Label>
                          <Textarea
                            placeholder="Why did you enter this trade?"
                            value={form.tradeReason || ""}
                            onChange={e => setForm(p => ({ ...p, tradeReason: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Market Condition</Label>
                          <Textarea
                            placeholder="Bullish, bearish, sideways, sector momentum?"
                            value={form.marketCondition || ""}
                            onChange={e => setForm(p => ({ ...p, marketCondition: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Strategy Used</Label>
                          <Textarea
                            placeholder="Breakout, support bounce, momentum, swing?"
                            value={form.strategyUsed || ""}
                            onChange={e => setForm(p => ({ ...p, strategyUsed: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Mistakes / Lessons Learned</Label>
                          <Textarea
                            placeholder="What would you do differently?"
                            value={form.mistakesLearned || ""}
                            onChange={e => setForm(p => ({ ...p, mistakesLearned: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <Button onClick={save} className="w-full">Save Journal Entry</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                {hasNotes ? (
                  <div className="space-y-1.5 text-xs">
                    {stock.notes?.tradeReason && (
                      <div><span className="text-muted-foreground">Reason:</span> <span className="text-foreground">{stock.notes.tradeReason}</span></div>
                    )}
                    {stock.notes?.strategyUsed && (
                      <div><span className="text-muted-foreground">Strategy:</span> <span className="text-foreground">{stock.notes.strategyUsed}</span></div>
                    )}
                    {stock.notes?.marketCondition && (
                      <div><span className="text-muted-foreground">Market:</span> <span className="text-foreground">{stock.notes.marketCondition}</span></div>
                    )}
                    {stock.notes?.mistakesLearned && (
                      <div><span className="text-muted-foreground">Lessons:</span> <span className="text-foreground italic">{stock.notes.mistakesLearned}</span></div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No notes yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TradeJournal;
