import type { BrokerProviderPublic, BrokerProvidersResponse } from "../../../src/lib/brokers/contracts.ts";
import { BROKER_PROVIDER_LIST } from "../../../src/lib/brokers/registry.ts";
import { handleBrokerRoute, requireBrokerIdentity } from "./_lib/access.ts";
import { handleOptions, jsonResponse } from "../_lib/http.ts";
import type { PagesHandler } from "../_lib/types.ts";
import { providerEnabled } from "./_lib/providers/index.ts";
import { brokerSetupState, callbackUrl, publicOrigin } from "./_lib/store.ts";

/**
 * GET /api/brokers/providers — documented capabilities plus this deployment's
 * enablement. The browser renders only what the server says is available and
 * shows `unavailableReason` instead of a disabled control with no explanation.
 */
export const onRequestGet: PagesHandler = async ({ request, env }) =>
  handleBrokerRoute(env, request, "providers", async () => {
    const access = await requireBrokerIdentity(env, request, "brokerRead");
    if (!access.ok) return access.response;

    const setup = await brokerSetupState(env);
    const providers: BrokerProviderPublic[] = BROKER_PROVIDER_LIST.map((capability) => {
      const enabled = setup.ready && providerEnabled(env, capability.id);
      return {
        ...capability,
        enabled,
        unavailableReason: !setup.ready
          ? "Broker connection storage is not configured on this server."
          : !providerEnabled(env, capability.id)
            ? "This broker is disabled in this environment."
            : null,
        setupIssues: setup.issues,
        callbackUrl: callbackUrl(env, request, capability.id),
      };
    });

    const body: BrokerProvidersResponse = {
      providers,
      storeReady: setup.ready,
      setupIssues: setup.issues,
      callbackOrigin: publicOrigin(env, request),
    };
    return jsonResponse(env, request, body);
  });

export const onRequestOptions: PagesHandler = async ({ request, env }) =>
  handleOptions(env, request) ?? new Response(null, { status: 204 });
