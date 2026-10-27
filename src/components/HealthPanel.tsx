/**
 * Integration health centre.
 *
 * `GET /api/health` reports configuration and cheap local state only; `?deep=1`
 * performs live upstream calls, so it sits behind an explicit button rather
 * than firing on render — deep probes may be billable and are slow.
 *
 * Everything shown here comes from the API. Env values never reach the client:
 * the response carries env-var *names* and booleans for presence.
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, XCircle } from "lucide-react";
import type { HealthResponse, IntegrationHealth, IntegrationState } from "@/lib/market-data/types.ts";
import { fetchHealth } from "@/lib/market-data/client.ts";
import { formatExchangeTimestamp } from "@/lib/market-data/freshness.ts";

const STATE_STYLE: Record<IntegrationState, { color: string; bg: string; stripe: string; label: string }> = {
  connected:    { color: "var(--green)", bg: "var(--green-bg, rgba(22,163,74,.10))",  stripe: "var(--green)",  label: "Connected" },
  degraded:     { color: "var(--amber)", bg: "var(--amber-bg, rgba(217,119,6,.12))", stripe: "var(--amber)", label: "Degraded" },
  unconfigured: { color: "var(--tx-400)", bg: "var(--bg-hover)",                       stripe: "var(--tx-300)", label: "Unconfigured" },
  error:        { color: "var(--red)", bg: "var(--red-bg, rgba(220,38,38,.10))",      stripe: "var(--red)",    label: "Error" },
};

function StateIcon({ state }: { state: IntegrationState }) {
  const size = 13;
  if (state === "connected") return <CheckCircle2 size={size} color="var(--green)" />;
  if (state === "degraded") return <AlertTriangle size={size} color="var(--amber)" />;
  if (state === "error") return <XCircle size={size} color="var(--red)" />;
  return <HelpCircle size={size} color="var(--tx-400)" />;
}

function IntegrationRow({ integration }: { integration: IntegrationHealth }) {
  const style = STATE_STYLE[integration.state];
  const facts = Object.entries(integration.facts);

  return (
    <div
      style={{
        borderLeft: `3px solid ${style.stripe}`,
        background: "var(--bg-card)",
        border: "1px solid var(--bd-100)",
        borderLeftWidth: 3,
        borderRadius: 9,
        padding: "11px 14px",
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <StateIcon state={integration.state} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--tx-900)" }}>{integration.label}</span>
        <span
          style={{
            fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em",
            fontFamily: "var(--ff-mono)", color: style.color, background: style.bg,
            padding: "2px 7px", borderRadius: 20,
          }}
        >
          {style.label}
        </span>
        {integration.latencyMs !== null && (
          <span style={{ fontSize: 10, fontFamily: "var(--ff-mono)", color: "var(--tx-300)", marginLeft: "auto" }}>
            {integration.latencyMs} ms
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--tx-500)", marginTop: 5 }}>{integration.purpose}</div>
      <div style={{ fontSize: 11, color: "var(--tx-400)", marginTop: 3 }}>{integration.detail}</div>

      {integration.requiredEnv.length > 0 && (
        <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 5 }}>
          {integration.requiredEnv.map((name) => {
            const present = integration.configuredEnv.includes(name);
            return (
              <span
                key={name}
                title={present ? `${name} is set` : `${name} is not set`}
                style={{
                  fontSize: 9.5, fontFamily: "var(--ff-mono)",
                  padding: "2px 6px", borderRadius: 4,
                  border: `1px solid ${present ? "var(--green-bd, rgba(22,163,74,.35))" : "var(--bd-100)"}`,
                  color: present ? "var(--green)" : "var(--tx-300)",
                  textDecoration: present ? "none" : "line-through",
                }}
              >
                {name}
              </span>
            );
          })}
        </div>
      )}

      {facts.length > 0 && (
        <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 12 }}>
          {facts.map(([key, value]) => (
            <span key={key} style={{ fontSize: 10, fontFamily: "var(--ff-mono)", color: "var(--tx-400)" }}>
              {key}: <span style={{ color: "var(--tx-600, var(--tx-500))" }}>{String(value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function HealthPanel() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deep, setDeep] = useState(false);

  const load = useCallback(async (runDeep: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchHealth({ deep: runDeep });
      setData(response);
      setDeep(runDeep);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Health check failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div>
      <div className="zf-card" style={{ padding: "16px 18px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <Activity size={15} color="var(--accent)" />
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx-900)" }}>Integration Health</div>
          {data && (
            <span
              style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em",
                fontFamily: "var(--ff-mono)", color: STATE_STYLE[data.summary].color,
                background: STATE_STYLE[data.summary].bg, padding: "2px 7px", borderRadius: 20,
              }}
            >
              {STATE_STYLE[data.summary].label}
            </span>
          )}

          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button
              className="zf-hbtn"
              onClick={() => void load(false)}
              disabled={loading}
              title="Re-check configuration and local state"
            >
              <RefreshCw size={12} className={loading ? "zf-spin" : ""} />
            </button>
            <button
              className="zf-hbtn"
              onClick={() => void load(true)}
              disabled={loading}
              title="Run live upstream probes. May be slow and may consume provider quota."
              style={{ width: "auto", padding: "0 10px", fontSize: 10.5, fontFamily: "var(--ff-mono)" }}
            >
              Deep probe
            </button>
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: "var(--tx-400)", fontFamily: "var(--ff-mono)" }}>
          {deep
            ? "Live probes were run against upstream providers."
            : "Configuration only — no upstream requests were made."}
          {data
            ? ` Checked ${formatExchangeTimestamp(data.generatedAt)} IST · ${data.integrations.length} integrations` +
              ` (${data.integrations.filter((i) => i.state === "connected").length} connected).`
            : ""}
        </div>
      </div>

      {error && (
        <div className="zf-card" style={{ padding: "14px 18px", color: "var(--red)", fontSize: 11.5 }}>
          {error}
        </div>
      )}

      {data?.integrations.map((integration) => (
        <IntegrationRow key={integration.id} integration={integration} />
      ))}

      {loading && !data && (
        <div style={{ fontSize: 11, color: "var(--tx-400)", fontFamily: "var(--ff-mono)", padding: 8 }}>
          Checking integrations…
        </div>
      )}
    </div>
  );
}

export default HealthPanel;
