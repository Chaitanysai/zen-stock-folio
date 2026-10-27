import { useId, useState } from "react";
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
  const uid = useId();

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

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border p-4 sm:px-5">
        <BookOpen className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Trade Journal</h2>
          <p className="text-xs text-muted-foreground mt-1">Record your reasoning, strategy, and lessons for each trade</p>
        </div>
      </div>

      {stocks.length === 0 ? (
        <div className="zf-empty-state">
          <div className="zf-empty-icon" aria-hidden="true"><BookOpen /></div>
          <h3 className="zf-empty-title">Nothing to journal yet</h3>
          <p className="zf-empty-body">
            Each trade in your portfolio gets a journal card here for its reasoning, strategy and lessons.
          </p>
        </div>
      ) : (
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stocks.map(stock => {
            const hasNotes = stock.notes && Object.values(stock.notes).some(v => v);
            return (
              <div key={stock.ticker} className="rounded-xl border border-border bg-secondary/40 p-4 transition-colors hover:border-primary/25">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-semibold text-primary">{stock.ticker}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{stock.stockName}</div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => openEdit(stock)}>
                        <MessageSquare className="h-3 w-3" /> {hasNotes ? "Edit" : "Add Notes"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg bg-card border-border" aria-describedby={undefined}>
                      <DialogHeader>
                        <DialogTitle className="text-foreground">Trade Journal — {stock.ticker}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor={`${uid}-${stock.ticker}-reason`} className="text-xs text-muted-foreground">Trade Reason</Label>
                          <Textarea
                            id={`${uid}-${stock.ticker}-reason`}
                            placeholder="Why did you enter this trade?"
                            value={form.tradeReason || ""}
                            onChange={e => setForm(p => ({ ...p, tradeReason: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`${uid}-${stock.ticker}-market`} className="text-xs text-muted-foreground">Market Condition</Label>
                          <Textarea
                            id={`${uid}-${stock.ticker}-market`}
                            placeholder="Bullish, bearish, sideways, sector momentum?"
                            value={form.marketCondition || ""}
                            onChange={e => setForm(p => ({ ...p, marketCondition: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`${uid}-${stock.ticker}-strategy`} className="text-xs text-muted-foreground">Strategy Used</Label>
                          <Textarea
                            id={`${uid}-${stock.ticker}-strategy`}
                            placeholder="Breakout, support bounce, momentum, swing?"
                            value={form.strategyUsed || ""}
                            onChange={e => setForm(p => ({ ...p, strategyUsed: e.target.value }))}
                            className="bg-secondary border-border text-sm min-h-[60px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`${uid}-${stock.ticker}-lessons`} className="text-xs text-muted-foreground">Mistakes / Lessons Learned</Label>
                          <Textarea
                            id={`${uid}-${stock.ticker}-lessons`}
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
      )}
    </div>
  );
};

export default TradeJournal;
