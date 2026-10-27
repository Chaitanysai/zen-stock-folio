/**
 * Index strip for the overview tab.
 *
 * `GET /api/market` returns `price: null` for an index whose provider failed.
 * That is rendered as "unavailable" — never as 0 or as a stale carry-over —
 * because a missing index level and a flat index look identical on screen and
 * a trader may act on either.
 */

import { useEffect, useState } from "react";
import type { MarketOverviewResponse } from "@/lib/market-data/types.ts";
import { dataModeLabel } from "@/lib/market-data/freshness.ts";
import { fetchMarketOverview } from "@/lib/market-data/client.ts";

type StripState =
  | { kind: "loading" }
  | { kind: "ready"; data: MarketOverviewResponse }
  | { kind: "error"; message: string };

function formatLevel(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MarketIndexStrip() {
  const [state, setState] = useState<StripState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchMarketOverview({ signal: controller.signal });
        if (!controller.signal.aborted) setState({ kind: "ready", data });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ kind: "error", message: error instanceof Error ? error.message : "Index data unavailable." });
      }
    })();

    return () => controller.abort();
  }, []);

  if (state.kind === "error") {
    return (
      <div style={{ fontSize: 10.5, fontFamily: "var(--ff-mono)", color: "var(--tx-400)", padding: "2px 0" }}>
        Indices unavailable — {state.message}
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div style={{ fontSize: 10.5, fontFamily: "var(--ff-mono)", color: "var(--tx-300)", padding: "2px 0" }}>
        Loading indices…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
      {state.data.indices.map((index) => {
        const up = (index.changePercent ?? 0) >= 0;
        return (
          <div key={index.providerSymbol} style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-400)", letterSpacing: ".06em", textTransform: "uppercase" }}>
              {index.label}
            </span>
            {index.price === null ? (
              <span style={{ fontSize: 11.5, fontFamily: "var(--ff-mono)", color: "var(--tx-300)" }}>
                unavailable
              </span>
            ) : (
              <>
                <span style={{ fontSize: 12.5, fontFamily: "var(--ff-mono)", fontWeight: 700, color: "var(--tx-900)" }}>
                  {formatLevel(index.price)}
                </span>
                {index.changePercent !== null && (
                  <span style={{ fontSize: 10.5, fontFamily: "var(--ff-mono)", fontWeight: 700, color: up ? "var(--green)" : "var(--red)" }}>
                    {up ? "+" : ""}{index.changePercent.toFixed(2)}%
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}

      <span
        style={{ fontSize: 9.5, fontFamily: "var(--ff-mono)", color: "var(--tx-300)", marginLeft: "auto" }}
        title={state.data.warnings.join(" · ") || undefined}
      >
        {dataModeLabel(state.data.dataMode)} · {state.data.provider}
        {state.data.cached ? " · cached" : ""}
        {state.data.stale ? " · stale" : ""}
      </span>
    </div>
  );
}

export default MarketIndexStrip;
