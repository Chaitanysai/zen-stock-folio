import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { AssistantCard } from "@/lib/assistant/schemas";
import { formatNative, formatPercent, formatQuantity, signedToneClass } from "@/lib/assistant/format";

/**
 * Structured results.
 *
 * Cards are the honest half of an answer: the numbers come straight from the
 * server payload (already validated against the wire schema), and anything the
 * server marked unknown renders as an em dash rather than a zero. Nothing here
 * recomputes a total — that would be a second implementation of the valuation
 * policy.
 */

const DATA_MODE_LABEL: Record<string, string> = {
  realtime: "Live",
  delayed: "Delayed",
  eod: "EOD",
  unknown: "Time unknown",
};

const chip = "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

export function AssistantCards({ cards }: { cards: AssistantCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {cards.map((card, index) => (
        <CardView key={`${card.kind}-${index}`} card={card} />
      ))}
    </div>
  );
}

function CardView({ card }: { card: AssistantCard }) {
  switch (card.kind) {
    case "metrics":
      return (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
          <CardHead title={card.title} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-3.5 pb-3.5">
            {card.metrics.map((metric) => (
              <div key={metric.label} className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </div>
                <div className={`truncate font-mono text-sm font-semibold tabular-nums ${signedToneClass(metric.value)}`}>
                  {metric.currency === null ? (metric.value === null ? "—" : formatQuantity(metric.value)) : formatNative(metric.value, metric.currency)}
                </div>
                {metric.hint ? <div className="text-[10px] text-muted-foreground">{metric.hint}</div> : null}
              </div>
            ))}
          </div>
          {card.note ? <CardNote text={card.note} /> : null}
        </section>
      );

    case "holdings":
      return (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
          <CardHead title={card.title} />
          {card.rows.length === 0 ? (
            <p className="px-3.5 pb-3.5 text-xs text-muted-foreground">No positions to show.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {card.rows.map((row) => (
                <li key={`${row.market}-${row.ticker}-${row.quantity}-${row.status}`} className="px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold text-foreground">{row.ticker}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{row.name}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-xs font-semibold tabular-nums text-foreground">
                        {formatNative(row.price, row.currency)}
                      </div>
                      <div className={`font-mono text-[11px] font-semibold tabular-nums ${signedToneClass(row.pnl)}`}>
                        {row.pnl === null ? "P&L unknown" : formatNative(row.pnl, row.currency)}
                        {row.pnlPercent === null ? "" : ` · ${formatPercent(row.pnlPercent)}`}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="font-mono tabular-nums">{formatQuantity(row.quantity)} qty</span>
                    <span className="font-mono tabular-nums">avg {formatNative(row.averageCost, row.currency)}</span>
                    <span className="uppercase tracking-wide">{row.market}</span>
                    {row.status !== "Active" ? <span className="uppercase tracking-wide">{row.status}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {card.note ? <CardNote text={card.note} /> : null}
        </section>
      );

    case "stocks":
      return (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
          <CardHead title={card.title} />
          {card.hits.length === 0 ? (
            <p className="px-3.5 pb-3.5 text-xs text-muted-foreground">No listing matched.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {card.hits.map((hit) => (
                <li key={`${hit.market}-${hit.symbol}`} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs font-semibold text-foreground">{hit.symbol}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{hit.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={chip}>{hit.exchange || hit.market}</span>
                    {hit.instrumentType ? <span className={chip}>{hit.instrumentType}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {card.note ? <CardNote text={card.note} /> : null}
        </section>
      );

    case "quote":
      return (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
          <CardHead title={card.title} right={<span className={chip}>{DATA_MODE_LABEL[card.dataMode] ?? card.dataMode}</span>} />
          <div className="flex items-end justify-between gap-3 px-3.5 pb-2">
            <div className="font-mono text-lg font-semibold tabular-nums text-foreground">
              {formatNative(card.price, card.currency)}
            </div>
            <div className={`font-mono text-xs font-semibold tabular-nums ${signedToneClass(card.changePercent)}`}>
              {formatPercent(card.changePercent)} today
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 px-3.5 pb-3.5 text-[11px] text-muted-foreground">
            <div>
              52W high <span className="font-mono tabular-nums text-foreground">{formatNative(card.weekHigh52, card.currency, 0)}</span>
            </div>
            <div>
              52W low <span className="font-mono tabular-nums text-foreground">{formatNative(card.weekLow52, card.currency, 0)}</span>
            </div>
          </div>
          {card.note ? <CardNote text={card.note} /> : null}
        </section>
      );

    case "market":
      return (
        <section className="overflow-hidden rounded-xl border border-border/70 bg-card/80">
          <CardHead title={card.title} right={<span className={chip}>{card.label}</span>} />
          <div className="px-3.5 pb-2 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">{card.istTime} IST</span> · {card.description}
          </div>
          {card.indices.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {card.indices.map((index) => (
                <li key={index.label} className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <span className="text-xs text-foreground">{index.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {formatNative(index.price, "INR", 2)}
                    </span>
                    <span className={`font-mono text-[11px] font-semibold tabular-nums ${signedToneClass(index.changePercent)}`}>
                      {formatPercent(index.changePercent)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {card.note ? <CardNote text={card.note} /> : null}
        </section>
      );

    case "navigation":
      return (
        <Link
          to={card.path}
          className="inline-flex min-h-[40px] items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/80 px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {card.label}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      );

    default:
      return null;
  }
}

function CardHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
      <h3 className="m-0 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {right}
    </div>
  );
}

function CardNote({ text }: { text: string }) {
  return (
    <p className="m-0 border-t border-border/60 bg-muted/30 px-3.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}
