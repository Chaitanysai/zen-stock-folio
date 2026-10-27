/**
 * Convergence test for the evaluation effect.
 *
 * The dashboard effect persists `alertState` from inside a `useEffect` that
 * itself depends on `alertState`. That shape is a classic React loop: persist →
 * state changes → effect re-runs → persist again. This harness reproduces the
 * exact pattern (guard key + conditional persist) with the real evaluator and
 * asserts the component settles instead of re-rendering forever.
 */
import { describe, expect, it } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, waitFor } from "@testing-library/react";
import type { QuoteEnvelope } from "@/lib/market-data/types.ts";
import type { PriceAlert } from "@/data/sampleData";
import { evaluateAlerts, type AlertStateMap } from "@/lib/alerts/evaluator";

let renderCount = 0;

const alert: PriceAlert = {
  id: "a1",
  ticker: "RELIANCE",
  type: "target_hit",
  targetPrice: 100,
  direction: "above",
  triggered: false,
  createdAt: "2026-10-01T00:00:00.000Z",
};

function envelope(ts: string, price = 2600): Record<string, QuoteEnvelope> {
  return {
    RELIANCE: {
      provider: "yahoo",
      dataMode: "delayed",
      fetchedAt: ts,
      exchangeTimestamp: ts,
      cached: false,
      cacheAgeMs: 0,
      stale: false,
      unavailable: [],
      warnings: [],
      quote: { symbol: "RELIANCE", price, change: null, changePercent: null, previousClose: null, dayHigh: null, dayLow: null, weekHigh52: null, weekLow52: null, volume: null, currency: "INR", exchange: "NSE", name: null },
    },
  };
}

/** Mirrors the dashboard's effect: guard key, evaluate, persist only on change. */
function Harness({ envelopes }: { envelopes: Record<string, QuoteEnvelope> }) {
  renderCount += 1;
  const [alertState, setAlertState] = useState<AlertStateMap>({});
  const evaluatedKeyRef = useRef("");

  useEffect(() => {
    const key = JSON.stringify({
      e: Object.entries(envelopes).map(([s, v]) => [s, v.exchangeTimestamp, v.dataMode, v.stale, v.cached, v.quote?.price ?? null]),
      s: alertState,
    });
    if (key === evaluatedKeyRef.current) return;
    evaluatedKeyRef.current = key;

    const { nextState } = evaluateAlerts(envelopes, [alert], alertState);
    if (JSON.stringify(nextState) !== JSON.stringify(alertState)) {
      setAlertState(nextState);
    }
  }, [envelopes, alertState]);

  return <div data-testid="renders">{Object.keys(alertState).length}</div>;
}

describe("evaluation effect convergence", () => {
  it("settles instead of re-rendering forever", async () => {
    renderCount = 0;
    const { getByTestId } = render(<Harness envelopes={envelope("2026-10-27T09:45:00.000Z")} />);
    await waitFor(() => expect(getByTestId("renders").textContent).toBe("1"));
    // Baseline established; a handful of renders, then stable.
    const settled = renderCount;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(renderCount).toBe(settled);
    expect(renderCount).toBeLessThan(10);
  });
});
