import type { BrokerProviderId } from "../../../../../src/lib/brokers/contracts.ts";
import type { Env } from "../../../_lib/types.ts";
import type { BrokerAdapter } from "../adapter.ts";
import { BrokerError } from "../errors.ts";
import { growwAdapter } from "./groww.ts";
import { upstoxAdapter } from "./upstox.ts";
import { zerodhaAdapter } from "./zerodha.ts";

const ADAPTERS: Record<BrokerProviderId, BrokerAdapter> = {
  zerodha: zerodhaAdapter,
  groww: growwAdapter,
  upstox: upstoxAdapter,
};

export const adapterFor = (provider: BrokerProviderId): BrokerAdapter => {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new BrokerError("unsupported_provider");
  return adapter;
};

/**
 * Enablement is opt-out: a provider is usable once the server-side store and
 * keys are configured, unless an operator explicitly disables it. Shared
 * multi-user Kite access is a separate capability and stays unavailable.
 */
export const providerEnabled = (env: Env, provider: BrokerProviderId): boolean => {
  if (provider === "zerodha") return env.BROKER_ZERODHA_ENABLED !== "false";
  if (provider === "upstox") return env.BROKER_UPSTOX_ENABLED !== "false";
  return env.BROKER_GROWW_ENABLED !== "false";
};

export const assertProviderEnabled = (env: Env, provider: BrokerProviderId): void => {
  if (!providerEnabled(env, provider)) throw new BrokerError("provider_disabled");
};
