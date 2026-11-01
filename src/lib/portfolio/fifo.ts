import type { Execution } from "../data/snapshotTypes.ts";

/**
 * FIFO over the full NSE execution ledger.
 *
 * A sell that consumes several buys becomes one lot with a quantity-weighted
 * buy price, so the realised P&L equals the sum of its matched chunks.
 * Overselling is reported, never invented away. Runs in the browser and in
 * Pages Functions, so it uses no Node APIs.
 */

export interface ClosedLot {
  ticker: string;
  quantity: number;
  averageBuyPrice: number;
  sellPrice: number;
  boughtOn: string;
  soldOn: string;
}

export interface AggregatedClosedLot {
  ticker: string;
  quantity: number;
  averageBuyPrice: number;
  sellPrice: number;
  boughtOn: string;
  soldOn: string;
}

interface OpenLot {
  quantity: number;
  price: number;
  at: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `DD-MMM-YYYY` on the IST calendar, matching the dates already stored. */
export function formatTradeDate(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "";
  const ist = new Date(time + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCDate()}-${MONTHS[ist.getUTCMonth()]}-${ist.getUTCFullYear()}`;
}

const idCollator = new Intl.Collator("en", { numeric: true });

const executionOrder = (a: Execution, b: Execution): number => {
  const delta = Date.parse(a.executedAt) - Date.parse(b.executedAt);
  if (delta !== 0) return delta;
  const collated = idCollator.compare(a.id, b.id);
  if (collated !== 0) return collated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export function deriveClosedLots(
  executions: Execution[],
  warnings: string[] = [],
): ClosedLot[] {
  const queues = new Map<string, OpenLot[]>();
  const lots: ClosedLot[] = [];

  for (const execution of [...executions]
    .filter((row) => row.market === "NSE" && row.currency === "INR")
    .sort(executionOrder)) {
    const queue = queues.get(execution.ticker) ?? [];
    queues.set(execution.ticker, queue);

    if (execution.side === "BUY") {
      queue.push({ quantity: execution.quantity, price: execution.price, at: execution.executedAt });
      continue;
    }

    let remaining = execution.quantity;
    let matched = 0;
    let cost = 0;
    let boughtOn = "";
    while (remaining > 0 && queue.length > 0) {
      const lot = queue[0];
      const taken = Math.min(remaining, lot.quantity);
      matched += taken;
      cost += taken * lot.price;
      if (!boughtOn || Date.parse(lot.at) < Date.parse(boughtOn)) boughtOn = lot.at;
      remaining -= taken;
      lot.quantity -= taken;
      if (lot.quantity <= 0) queue.shift();
    }

    if (matched > 0) {
      lots.push({
        ticker: execution.ticker,
        quantity: matched,
        averageBuyPrice: cost / matched,
        sellPrice: execution.price,
        boughtOn,
        soldOn: execution.executedAt,
      });
    }
    if (remaining > 0) {
      warnings.push(
        `FIFO history for ${execution.ticker} sells ${remaining} more share(s) than it buys; the excess is ignored.`,
      );
    }
  }

  return lots;
}

/**
 * One dashboard row per ticker. Multiple matched lots become a
 * quantity-weighted entry and exit, spanning the first buy to the last sell.
 */
export function aggregateClosedLots(lots: ClosedLot[]): AggregatedClosedLot[] {
  const byTicker = new Map<string, AggregatedClosedLot & { buyCost: number; sellNotional: number }>();

  for (const lot of lots) {
    const current = byTicker.get(lot.ticker);
    if (!current) {
      byTicker.set(lot.ticker, {
        ticker: lot.ticker,
        quantity: lot.quantity,
        averageBuyPrice: lot.averageBuyPrice,
        sellPrice: lot.sellPrice,
        boughtOn: lot.boughtOn,
        soldOn: lot.soldOn,
        buyCost: lot.averageBuyPrice * lot.quantity,
        sellNotional: lot.sellPrice * lot.quantity,
      });
      continue;
    }
    current.buyCost += lot.averageBuyPrice * lot.quantity;
    current.sellNotional += lot.sellPrice * lot.quantity;
    current.quantity += lot.quantity;
    current.averageBuyPrice = current.buyCost / current.quantity;
    current.sellPrice = current.sellNotional / current.quantity;
    if (Date.parse(lot.boughtOn) < Date.parse(current.boughtOn)) current.boughtOn = lot.boughtOn;
    if (Date.parse(lot.soldOn) > Date.parse(current.soldOn)) current.soldOn = lot.soldOn;
  }

  return [...byTicker.values()].map((row) => ({
    ticker: row.ticker,
    quantity: row.quantity,
    averageBuyPrice: row.averageBuyPrice,
    sellPrice: row.sellPrice,
    boughtOn: row.boughtOn,
    soldOn: row.soldOn,
  }));
}
