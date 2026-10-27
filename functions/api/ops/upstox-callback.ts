import type { PagesHandler } from "../_lib/types";

/**
 * GET /api/ops/upstox-callback — Upstox daily re-authorization helper.
 *
 * Secure redesign of the two legacy Vercel endpoints (see
 * docs/migration/upstox-reauth.md):
 *  - `/api/refresh-token` is REMOVED, not ported: Upstox v2 has no refresh
 *    flow that reuses an access token as an authorization code, and the old
 *    endpoint returned a fresh access token in an unauthenticated JSON body.
 *  - The legacy callback rendered the token in HTML for anyone holding the
 *    OAuth redirect; this version requires the long random `key` query
 *    parameter to match the UPSTOX_OPS_KEY secret and answers 404 to
 *    anyone else — the endpoint is unfindable and unusable without the
 *    operator secret.
 *  - The redirect_uri is derived from the request origin, so the Upstox app
 *    registration must point at `<origin>/api/ops/upstox-callback` (runbook).
 *
 * This is an operator tool only. It never places orders and never receives
 * trading credentials from the app.
 */

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
};

const page = (title: string, bodyHtml: string): Response =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:sans-serif;max-width:700px;margin:60px auto;padding:20px">${bodyHtml}</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const code = url.searchParams.get("code") ?? "";

  if (!env.UPSTOX_OPS_KEY || !constantTimeEqual(key, env.UPSTOX_OPS_KEY)) {
    return new Response("Not found", { status: 404 });
  }
  if (!code) {
    return page("Upstox re-auth", "<h2>Missing authorization code</h2><p>Start the flow from the Upstox dashboard.</p>");
  }
  if (!env.UPSTOX_API_KEY || !env.UPSTOX_API_SECRET) {
    return page("Upstox re-auth", "<h2>Not configured</h2><p>Server is missing Upstox client credentials.</p>");
  }

  const body = new URLSearchParams({
    code,
    client_id: env.UPSTOX_API_KEY,
    client_secret: env.UPSTOX_API_SECRET,
    redirect_uri: `${url.origin}/api/ops/upstox-callback`,
    grant_type: "authorization_code",
  });

  try {
    const res = await fetch("https://api.upstox.com/v2/login/authorization/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!res.ok || !data.access_token) {
      // Upstream error details are shown only to the operator holding the key.
      return page(
        "Upstox re-auth failed",
        `<h2>Token exchange failed</h2><pre>Upstox returned ${res.status}. The authorization code may already be used or expired — restart the flow.</pre>`,
      );
    }

    return page(
      "Upstox token",
      `<h2>Access token generated</h2>
<p>Update <strong>UPSTOX_ACCESS_TOKEN</strong> in the Cloudflare Pages project with:</p>
<div id="token" style="background:#f0f0f0;padding:16px;border-radius:8px;word-break:break-all;font-family:monospace">${data.access_token}</div>
<button onclick="navigator.clipboard.writeText(document.getElementById('token').innerText)">Copy token</button>
<p style="color:#888">Tokens expire at market close (3:30 AM IST next day). This page is shown once — do not share the URL.</p>`,
    );
  } catch {
    return page("Upstox re-auth failed", "<h2>Token exchange failed</h2><pre>Upstox was unreachable — try again.</pre>");
  }
};
