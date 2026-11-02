import type { Candle } from "@/lib/market-data/types";

export interface CloseBar {
  time: number;
  value: number;
  up: boolean;
}

export function buildCloseBars(candles: Candle[]): CloseBar[] {
  return candles.map((candle, index) => ({
    time: candle.time,
    value: candle.close,
    up: index === 0 ? candle.close >= candle.open : candle.close >= candles[index - 1].close,
  }));
}

export function closeBarBase(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  return Math.round(Math.min(...candles.map((c) => c.close)) * 0.98 * 100) / 100;
}
