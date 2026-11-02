import type { CandleResolution } from "@/lib/market-data/types";

const INTRADAY: CandleResolution[] = ["1m", "5m", "15m"];

export const isIntradayResolution = (resolution: CandleResolution): boolean =>
  INTRADAY.includes(resolution);

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
});

export function formatIstTick(timeSeconds: number, resolution: CandleResolution): string {
  const date = new Date(timeSeconds * 1000);
  return isIntradayResolution(resolution) ? TIME_FMT.format(date) : DATE_FMT.format(date);
}

export function chartTimeAxisOptions(resolution: CandleResolution) {
  return {
    timeScale: {
      timeVisible: isIntradayResolution(resolution),
      secondsVisible: false,
      tickMarkFormatter: (time: number) => formatIstTick(time, resolution),
    },
    localization: {
      timeFormatter: (time: number) => formatIstTick(time, resolution),
    },
  };
}
