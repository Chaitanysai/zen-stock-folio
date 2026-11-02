import { applySecurityHeaders } from "./api/_lib/securityHeaders";
import type { Env } from "./api/_lib/types";

/**
 * Applies the security-header policy to Pages Functions responses.
 *
 * Static assets are covered by `public/_headers`; Cloudflare does not apply
 * that file to Functions responses, so this middleware is the Functions-side
 * half of the policy. It is scoped to `/api/*` (the only Functions routes in
 * this project) to avoid setting the same headers twice on static responses.
 */

interface MiddlewareContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

export const onRequest = async (context: MiddlewareContext): Promise<Response> => {
  const response = await context.next();
  if (!new URL(context.request.url).pathname.startsWith("/api/")) return response;
  // 101 responses are protocol upgrades and cannot be reconstructed.
  if (response.status === 101) return response;

  const headers = new Headers(response.headers);
  applySecurityHeaders(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
