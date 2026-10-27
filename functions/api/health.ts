import { requireVerifiedIdentity } from "./_lib/auth";
import { checkRateLimit, RATE_LIMITS } from "./_lib/ratelimit";
import { errorResponse, handleOptions, jsonResponse, requireMethod, retryAfterHeader } from "./_lib/http";
import { fetchYahooQuote } from "../../src/lib/market-data/yahoo.ts";
import { fetchUpstoxQuote } from "../../src/lib/market-data/upstox.ts";
import type {
  HealthResponse,
  IntegrationHealth,
  IntegrationState,
} from "../../src/lib/market-data/types.ts";
import type { Env, PagesHandler } from "./_lib/types";

/**
 * GET /api/health[?deep=1] — integration health centre (diagnostics only).
 *
 * Reports, per integration: whether it is configured (env var NAMES only),
 * what it powers, and — with ?deep=1 — the result of a live probe. Secrets are
 * never returned (booleans and names only, never values), no user data is
 * included, and probe failures are reduced to a short sanitized reason.
 *
 * Deep mode degrades gracefully: every probe is bounded and swallowed into a
 * `degraded` state, so diagnostics stay available while a provider is down.
 * The default (`deep` absent) performs no upstream calls: it reports
 * configuration plus already-known local state.
 */

/** Worst-to-best for the aggregate roll-up. */
const STATE_RANK: Record<IntegrationState, number> = {
  error: 0,
  degraded: 1,
  unconfigured: 2,
  connected: 3,
};

function worst(states: IntegrationState[]): IntegrationState {
  if (states.length === 0) return "unconfigured";
  return states.reduce((acc, state) => (STATE_RANK[state] < STATE_RANK[acc] ? state : acc));
}

/** Short, sanitized reason. Never includes a URL with a key or a raw body. */
function sanitize(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]")
    .replace(/https?:\/\/\S+/g, "[url]")
    .slice(0, 160);
}

/** A var counts as configured only when it holds a non-empty value. */
const configuredNames = (env: Env, names: readonly string[]): string[] => {
  const values = env as unknown as Record<string, unknown>;
  return names.filter((name) => typeof values[name] === "string" && (values[name] as string).trim() !== "");
};

interface ProbeOutcome {
  state: IntegrationState;
  latencyMs: number | null;
  detail: string;
  facts: Record<string, string | number | boolean>;
}

const NO_PROBE: ProbeOutcome = {
  state: "unconfigured",
  latencyMs: null,
  detail: "No live check performed. Add ?deep=1 for an upstream probe.",
  facts: {},
};

/** Swallows anything a probe can raise — deep mode must degrade, never throw. */
async function safeProbe(label: string, probe: () => Promise<ProbeOutcome>): Promise<ProbeOutcome> {
  try {
    return await probe();
  } catch (error) {
    return {
      state: "degraded",
      latencyMs: null,
      detail: `${label} probe failed: ${sanitize(error)}`,
      facts: {},
    };
  }
}

/** Yahoo needs no credentials; it is the baseline market-data source. */
async function probeYahoo(): Promise<ProbeOutcome> {
  const started = Date.now();
  try {
    const result = await fetchYahooQuote("RELIANCE", 6000);
    return {
      state: "connected",
      latencyMs: Date.now() - started,
      detail: "Quote endpoint answered. Unofficial source; NSE data is delayed during a session.",
      facts: {
        sampleSymbol: result.quote.symbol,
        samplePrice: result.quote.price ?? "unavailable",
        exchangeTimestamp: result.exchangeTimestampMs
          ? new Date(result.exchangeTimestampMs).toISOString()
          : "unavailable",
      },
    };
  } catch (error) {
    return {
      state: "degraded",
      latencyMs: Date.now() - started,
      detail: `Quote endpoint failed: ${sanitize(error)}`,
      facts: {},
    };
  }
}

/**
 * Upstox requires a token AND an accepted instrument key. The probe uses the
 * documented `NSE_EQ|INE002A01018` (RELIANCE ISIN — a public identifier) so
 * "configured" can never be mistaken for "working".
 */
async function probeUpstox(env: Env): Promise<ProbeOutcome> {
  const token = env.UPSTOX_ACCESS_TOKEN;
  if (typeof token !== "string" || token.trim() === "") {
    return {
      state: "unconfigured",
      latencyMs: null,
      detail: "No Upstox market-data token is set; realtime quotes are disabled.",
      facts: {},
    };
  }

  const started = Date.now();
  try {
    const result = await fetchUpstoxQuote(
      "NSE_EQ|INE002A01018",
      "RELIANCE",
      { accessToken: token },
      6000,
    );
    return {
      state: "connected",
      latencyMs: Date.now() - started,
      detail: "Realtime quote endpoint answered with a valid token.",
      facts: { samplePrice: result.quote.price ?? "unavailable" },
    };
  } catch (error) {
    return {
      state: "degraded",
      latencyMs: Date.now() - started,
      detail: `Upstox probe failed: ${sanitize(error)}`,
      facts: {},
    };
  }
}

/**
 * The identity boundary must keep rejecting junk tokens. A request WITHOUT a
 * token being rejected proves the key and the endpoint work without ever
 * needing a real user session. A 400 "API key not valid" body is the
 * exception: that means the configured key itself is rejected.
 */
async function probeFirebaseIdentity(env: Env): Promise<ProbeOutcome> {
  const apiKey = env.FIREBASE_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return {
      state: "unconfigured",
      latencyMs: null,
      detail: "FIREBASE_API_KEY is not set; every authenticated route fails closed.",
      facts: {},
    };
  }

  const started = Date.now();
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "health-probe-invalid-token" }),
        signal: AbortSignal.timeout(6000),
      },
    );
    const latencyMs = Date.now() - started;
    let reason = "";
    if (!response.ok) {
      reason = await response.text().catch(() => "");
    }
    if (response.status === 400 && /api key not valid/i.test(reason)) {
      return {
        state: "degraded",
        latencyMs,
        detail: "Identity Toolkit rejected the configured API key.",
        facts: { probeStatus: response.status },
      };
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return {
        state: "connected",
        latencyMs,
        detail: "Verifier rejected an unauthenticated probe, as it should.",
        facts: { probeStatus: response.status },
      };
    }
    return {
      state: "degraded",
      latencyMs,
      detail: "Unexpected verifier response; token validation may be misconfigured.",
      facts: { probeStatus: response.status },
    };
  } catch (error) {
    return {
      state: "degraded",
      latencyMs: Date.now() - started,
      detail: `Identity verification unreachable: ${sanitize(error)}`,
      facts: {},
    };
  }
}

/**
 * Twelve Data's NSE directory is ~1 MB, so the deep probe reads the STATUS only
 * and never parses the body — the probe must stay cheap and bounded.
 */
async function probeTwelveData(): Promise<ProbeOutcome> {
  const started = Date.now();
  try {
    const response = await fetch("https://api.twelvedata.com/stocks?exchange=NSE&country=India", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    return {
      state: response.ok ? "connected" : "degraded",
      latencyMs: Date.now() - started,
      detail: response.ok
        ? "Directory endpoint answered (status only — body not parsed in the probe)."
        : `Directory endpoint responded ${response.status}.`,
      facts: {},
    };
  } catch (error) {
    return {
      state: "degraded",
      latencyMs: Date.now() - started,
      detail: `Directory endpoint failed: ${sanitize(error)}`,
      facts: {},
    };
  }
}

/** A KV read that does not throw proves the binding works. Never reads a real value. */
async function probeKv(env: Env): Promise<ProbeOutcome> {
  const binding = env.PRICE_CACHE;
  if (!binding) {
    return {
      state: "unconfigured",
      latencyMs: null,
      detail: "No PRICE_CACHE KV binding; endpoints degrade to live-only mode.",
      facts: {},
    };
  }
  const started = Date.now();
  try {
    await binding.get(["eod:__health__"], { type: "text" });
    return {
      state: "connected",
      latencyMs: Date.now() - started,
      detail: "EOD cache read succeeded.",
      facts: {},
    };
  } catch (error) {
    return {
      state: "degraded",
      latencyMs: Date.now() - started,
      detail: `EOD cache read failed: ${sanitize(error)}`,
      facts: {},
    };
  }
}

function configOnly(
  env: Env,
  id: string,
  label: string,
  purpose: string,
  envNames: readonly string[],
  detailWhenConfigured: string,
  checkedAt: string,
): IntegrationHealth {
  const configured = configuredNames(env, envNames);
  const state: IntegrationState = configured.length > 0 ? "connected" : "unconfigured";
  return {
    id,
    label,
    purpose,
    state,
    requiredEnv: envNames,
    configuredEnv: configured,
    lastCheckedAt: checkedAt,
    latencyMs: null,
    detail:
      configured.length > 0
        ? detailWhenConfigured
        : `Missing: ${envNames.join(", ")}. This feature is disabled until configured.`,
    facts: { configuredCount: configured.length },
  };
}

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const unvalidated = requireMethod(env, request, "GET");
  if (unvalidated) return unvalidated;

  // The health centre is itself an authenticated, rate-limited endpoint: it
  // costs upstream probes in deep mode and its output must not be scrapable.
  const auth = await requireVerifiedIdentity(env, request);
  if (!auth.ok) return auth.response;

  const rl = checkRateLimit(
    `${auth.identity.uid}:health`,
    RATE_LIMITS.health.limit,
    RATE_LIMITS.health.windowMs,
  );
  if (!rl.allowed) {
    return errorResponse(env, request, 429, "Rate limit exceeded", retryAfterHeader(rl.resetInMs));
  }

  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const checkedAt = new Date().toISOString();

  // Deep probes target independent upstreams: run them in parallel so the
  // endpoint's worst case is the slowest probe, not the sum of them.
  const [yahoo, upstox, identity, twelveData, kv] = await Promise.all([
    safeProbe("Yahoo", async () => {
      if (!deep) {
        return {
          ...NO_PROBE,
          state: "connected" as IntegrationState,
          detail: "No credentials required. Add ?deep=1 to verify upstream reachability.",
        };
      }
      return probeYahoo();
    }),
    safeProbe("Upstox", async () => {
      if (!deep) {
        return {
          ...NO_PROBE,
          state: (typeof env.UPSTOX_ACCESS_TOKEN === "string" && env.UPSTOX_ACCESS_TOKEN.trim() !== ""
            ? "connected"
            : "unconfigured") as IntegrationState,
          detail:
            typeof env.UPSTOX_ACCESS_TOKEN === "string" && env.UPSTOX_ACCESS_TOKEN.trim() !== ""
              ? "An Upstox market-data token is set. Add ?deep=1 to verify it."
              : "No Upstox market-data token is set; realtime quotes are disabled.",
        };
      }
      return probeUpstox(env);
    }),
    safeProbe("Identity", async () => {
      if (!deep) {
        return {
          ...NO_PROBE,
          state: (typeof env.FIREBASE_API_KEY === "string" && env.FIREBASE_API_KEY.trim() !== ""
            ? "connected"
            : "unconfigured") as IntegrationState,
          detail:
            typeof env.FIREBASE_API_KEY === "string" && env.FIREBASE_API_KEY.trim() !== ""
              ? "Verifier configuration detected. Add ?deep=1 to confirm it rejects anonymous calls."
              : "FIREBASE_API_KEY is not set; every authenticated route fails closed.",
        };
      }
      return probeFirebaseIdentity(env);
    }),
    safeProbe("TwelveData", async () => {
      if (!deep) {
        return {
          ...NO_PROBE,
          detail:
            "Directory not cached on this runtime; search uses live Yahoo. Add ?deep=1 to probe reachability.",
        };
      }
      return probeTwelveData();
    }),
    safeProbe("KV", async () => {
      if (!deep) {
        if (!env.PRICE_CACHE) {
          return {
            ...NO_PROBE,
            detail: "No PRICE_CACHE KV binding; endpoints degrade to live-only mode.",
          };
        }
        return {
          ...NO_PROBE,
          state: "connected" as IntegrationState,
          detail: "KV binding present. Add ?deep=1 to verify reads.",
        };
      }
      return probeKv(env);
    }),
  ]);

  const integrations: IntegrationHealth[] = [];

  integrations.push({
    id: "yahoo-chart",
    label: "Yahoo Finance chart",
    purpose: "Delayed NSE quotes, OHLCV candles, index quotes, symbol search",
    state: yahoo.state,
    requiredEnv: [],
    configuredEnv: [],
    lastCheckedAt: checkedAt,
    latencyMs: yahoo.latencyMs,
    detail: yahoo.detail,
    facts: yahoo.facts,
  });

  integrations.push({
    id: "upstox-market-quote",
    label: "Upstox market quote",
    purpose: "Realtime NSE quotes from composed symbol keys",
    state: upstox.state,
    requiredEnv: ["UPSTOX_ACCESS_TOKEN"],
    configuredEnv: configuredNames(env, ["UPSTOX_ACCESS_TOKEN"]),
    lastCheckedAt: checkedAt,
    latencyMs: upstox.latencyMs,
    detail: upstox.detail,
    facts: upstox.facts,
  });

  integrations.push({
    id: "upstox-instrument-master",
    label: "Upstox instrument master",
    purpose: "Symbol → ISIN → instrument-key resolution for ISIN-keyed paths",
    state: "unconfigured",
    requiredEnv: [],
    configuredEnv: [],
    lastCheckedAt: checkedAt,
    latencyMs: null,
    detail:
      "Deliberately not loaded on the Workers runtime: the 2 MB gzip / 40 MB JSON master " +
      "exceeds Workers memory/CPU limits. Quotes and F&O use composed or caller-supplied keys.",
    facts: {},
  });

  integrations.push({
    id: "price-cache-kv",
    label: "EOD price cache (Workers KV)",
    purpose: "Amortised end-of-day quote cache behind /api/prices",
    state: kv.state,
    requiredEnv: ["PRICE_CACHE"],
    configuredEnv: env.PRICE_CACHE ? ["PRICE_CACHE"] : [],
    lastCheckedAt: checkedAt,
    latencyMs: kv.latencyMs,
    detail: kv.detail,
    facts: kv.facts,
  });

  integrations.push({
    id: "firebase-identity",
    label: "Firebase identity verification",
    purpose: "Verifies the caller's bearer token for every endpoint",
    state: identity.state,
    requiredEnv: ["FIREBASE_API_KEY"],
    configuredEnv: configuredNames(env, ["FIREBASE_API_KEY"]),
    lastCheckedAt: checkedAt,
    latencyMs: identity.latencyMs,
    detail: identity.detail,
    facts: identity.facts,
  });

  integrations.push({
    id: "twelvedata-directory",
    label: "Twelve Data symbol directory",
    purpose: "Symbol reference and search fallback (ISINs are placeholders)",
    state: twelveData.state,
    requiredEnv: [],
    configuredEnv: [],
    lastCheckedAt: checkedAt,
    latencyMs: twelveData.latencyMs,
    detail: twelveData.detail,
    facts: twelveData.facts,
  });

  integrations.push(
    configOnly(
      env,
      "newsapi",
      "NewsAPI",
      "Headline feed for the News tab",
      ["NEWS_API_KEY"],
      "NewsAPI key present. Without it the News tab shows an empty state, never synthetic headlines.",
      checkedAt,
    ),
    configOnly(
      env,
      "finnhub",
      "Finnhub news",
      "Secondary headline source",
      ["FINNHUB_API_KEY"],
      "Finnhub key present; used as a news fallback.",
      checkedAt,
    ),
    configOnly(
      env,
      "groq",
      "Groq AI",
      "Portfolio analysis and chat (rate limited, authenticated)",
      ["GROQ_API_KEY"],
      "Groq key present. AI endpoints require a verified identity and are rate limited.",
      checkedAt,
    ),
    configOnly(
      env,
      "openrouter",
      "OpenRouter AI",
      "AI fallback provider",
      ["OPENROUTER_API_KEY"],
      "OpenRouter key present; used when Groq does not answer.",
      checkedAt,
    ),
  );

  const payload: HealthResponse = {
    generatedAt: checkedAt,
    integrations,
    // Aggregate over the request-serving market-data path and the verifier,
    // which is what the dashboard needs (reference roll-up).
    summary: worst(
      integrations
        .filter((item) => ["yahoo-chart", "firebase-identity"].includes(item.id))
        .map((item) => item.state),
    ),
  };

  return jsonResponse(env, request, payload);
};

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
