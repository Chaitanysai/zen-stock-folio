# Security posture — release notes

Last reviewed: 2026-10-29, branch `feat/obsidian-dashboard`.

## Response headers

The policy lives in two places because Cloudflare Pages applies `_headers` to
static assets only:

| Surface | Source |
|---|---|
| Static assets (`/`, `/assets/*`, favicons) | `public/_headers` |
| Pages Functions (`/api/*`) | `functions/_middleware.ts` → `functions/api/_lib/securityHeaders.ts` |

`functions/api/_lib/securityHeaders.test.ts` fails if the two copies drift or if
the CSP's inline-script hash no longer matches the pre-paint theme script in
`index.html`.

Current policy:

- `Content-Security-Policy` — same-origin scripts, Google's Firebase Auth loader
  (`apis.google.com`; it injects `js/api.js` for the Google provider), and
  **two** inline-script hashes: the pre-paint theme bootstrap in `index.html`
  and the pre-hydration script next-themes injects at runtime. Inline styles
  (React/Radix), Google Fonts, `*.googleapis.com` (Firebase Auth/Firestore), the
  Firebase auth-domain iframe and the Google account chooser, and `https:`
  images. `frame-ancestors 'none'`; no `'unsafe-inline'` for scripts. If
  `next-themes` is upgraded or the `ThemeProvider` props change, recompute the
  second hash and re-run the Preview smoke test (a missing hash shows up as a
  `securitypolicyviolation`).
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — camera/microphone/geolocation/payment/USB etc. denied.
- `Strict-Transport-Security: max-age=300` — deliberately short because the app
  is served from `*.pages.dev`; do not add `preload` on that hostname.

Do **not** add `Cross-Origin-Opener-Policy: same-origin`: Firebase
`signInWithPopup` needs the opener relationship. `frame-ancestors 'none'` is
safe because the app is never embedded by Firebase; Firebase is embedded by the
app.

## `/api/health` operator allowlist

`GET /api/health` requires a verified Firebase identity **and** the caller's uid
in `HEALTH_OPERATOR_UIDS`. Empty/unset disables the endpoint (404) — fail closed.
It never returns secret values, only configured env-var names.

To enable diagnostics on Preview only:

1. Take your Firebase Auth uid (Firebase console → Authentication → Users). A
   uid is an opaque, non-secret identifier.
2. Add it to `wrangler.toml` under `[env.preview.vars]`:

   ```toml
   HEALTH_OPERATOR_UIDS = "<firebase-uid>"
   ```

3. Redeploy the preview. `wrangler pages deploy` uploads `[env.preview.vars]`
   with that deployment, so the value takes effect on the next deploy without
   touching production.

Alternative: `npx wrangler pages secret put HEALTH_OPERATOR_UIDS --project-name zenfolio --env preview`
(also fine; a var is simpler for a non-secret allowlist).

## CORS

`functions/api/_lib/http.ts` grants `Access-Control-Allow-Origin` only when the
request `Origin` is listed in `ALLOWED_ORIGINS`. The preview/production value is
empty, so API responses carry no wildcard and foreign preflights get 403.
`public/_headers` removes the platform's `Access-Control-Allow-Origin: *` from
static assets. Do not add `*` to `ALLOWED_ORIGINS`.

Rate limiting is per-isolate and per-user. A Cloudflare WAF rate-limit rule is
still the account-level control; it is configured in the dashboard, not in this
repository, and was not changed by this release.

## Broker callback state (residual)

Authorization states are keyed `state:{provider}:{hash}`. A callback for one
provider cannot read, consume or burn another provider's state. Completion only
finalizes a connection still in `pending_authorization`; a duplicate/late
callback gets `conflict` and leaves a completed connection untouched.

KV has no compare-and-swap. The get/delete/marker sequence is **best effort, not
atomic**; the provider's one-time `request_token` is the actual single-use gate.
A strict exactly-once state consumer needs a Durable Object, which Cloudflare
requires as a separate Worker binding. Broker connections are not activated by
this release, so that infrastructure change is deferred; see
`docs/brokers/architecture.md` risks.

Groww advertises no callback URL (`callbackUrl: null`): it is keys-only and its
adapter cannot complete a browser redirect.

## `xlsx` dependency

`xlsx@0.18.5` (Apache-2.0) has two known high-severity advisories:
prototype pollution (GHSA-4r6h-8v6p-xvw6, fixed in 0.19.3) and ReDoS
(GHSA-5pgg-2g8v-p4x9, fixed in 0.20.2). `npm audit` reports `fixAvailable:
false` because SheetJS publishes fixed builds from `cdn.sheetjs.com`, not npm.

Mitigations in place: the module is imported lazily only when the user picks a
file, the file is size-capped (5 MB) and row-capped (5,000) before parsing, and
the parsed rows are validated. The remaining exposure requires the user to open
a malicious workbook they selected. **Deferred risk**, not a dashboard-release
blocker; a follow-up should upgrade to the official 0.20.x tarball (or move to a
maintained parser) after compatibility and licence review.
