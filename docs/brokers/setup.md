# Broker connections — deployment and provider setup

Status: deployed and verified on the `feat/obsidian-dashboard` **preview**
(`wrangler.toml` `[env.preview]` + `BROKER_CREDENTIALS_KEYS` as a preview
secret). Production is a separate release decision and currently has none of
the three settings below, so every broker endpoint there returns
`setup_required` (503) and the dashboard shows the missing variable names.

This feature is read-only. It never places, modifies or cancels orders.

## 1. Server prerequisites

| Setting | Kind | Purpose |
|---|---|---|
| `BROKER_STORE` | KV binding | Connection metadata, one-time authorization state, encrypted credential envelopes, sync ledger |
| `BROKER_CREDENTIALS_KEYS` | secret | JSON map of key version → base64 32-byte AES-GCM key |
| `BROKER_PUBLIC_ORIGIN` | var | HTTPS origin used for callback URLs and post-callback redirects |

### 1.1 Create the KV namespace

```sh
wrangler kv namespace create BROKER_STORE
```

Copy the printed `id` into `wrangler.toml`. **The Wrangler config file is the
source of truth for Pages configuration** — dashboard edits to the same fields
are rejected, and a deploy overwrites values that are not in the file. `vars`
and `kv_namespaces` are NOT inherited by `env.*`, so each environment repeats
what it needs:

- `[env.preview]` in `wrangler.toml` already carries `PRICE_CACHE` and
  `BROKER_STORE` — new preview deployments pick the binding up automatically.
- Binding it to **Production** is a separate release decision: add a top-level
  `[[kv_namespaces]]` block (top level stays production-only in this repo) and
  deploy to `main`.

Use a namespace dedicated to this feature. It holds encrypted user credentials,
not disposable market data, so do not reuse `PRICE_CACHE`.

### 1.2 Generate the encryption key set

Run locally; do not paste the output into chat, a commit or an issue:

```sh
node -e "console.log(JSON.stringify({1: require('crypto').randomBytes(32).toString('base64')}))"
```

Store the printed JSON as the secret:

```sh
# Preview (the branch alias environment):
npx wrangler pages secret put BROKER_CREDENTIALS_KEYS --project-name zenfolio --env preview

# Production — the default when --env is omitted! An unqualified
# `pages secret put` writes to PRODUCTION. Always pass --env explicitly.
npx wrangler pages secret put BROKER_CREDENTIALS_KEYS --project-name zenfolio --env production
```

Rules:

- The value must be a JSON object of integer version → base64 32-byte key.
- New envelopes use the highest version unless
  `BROKER_CREDENTIALS_ACTIVE_KEY_VERSION` is set.
- **Keep every version that still protects a stored connection.** Removing a
  version makes those connections undecryptable (`setup_required` on read).
  There is no automatic re-encryption routine; to retire a key, first have each
  connection reauthorize or re-enter credentials under the new active version.
- Losing this secret loses the stored broker credentials. They can be re-entered,
  so this is recoverable, but sync stops until then.

`BROKER_CREDENTIALS_ACTIVE_KEY_VERSION` is optional. Set it only when you need
new writes pinned to an older version while a newer one is being introduced.

### 1.3 Set the public origin

This is a plain (non-secret) variable. Declare it in `wrangler.toml` —
`[env.preview.vars]` already sets the branch alias for previews; for Production
add it to the top-level `[vars]` block with the production origin:

```toml
[vars]
FIREBASE_API_KEY = "…"
BROKER_PUBLIC_ORIGIN = "https://zenfolio-7jd.pages.dev"
```

For `.dev.vars` (local `wrangler pages dev`) the same name works as a line in
that file.

Value: the deployment's public HTTPS origin, e.g.
`https://zenfolio-7jd.pages.dev` — no trailing slash, no path. It is never taken
from a request header, so a spoofed `Host` cannot redirect the callback.

If it is absent, the code falls back to the request origin; that is convenient
locally but not recommended in production because a preview deployment would
produce a preview callback URL that is not registered with either provider.

### 1.4 Optional provider switches

| Variable | Default | Effect |
|---|---|---|
| `BROKER_ZERODHA_ENABLED` | enabled | Set to `"false"` to hide/refuse Zerodha |
| `BROKER_GROWW_ENABLED` | enabled | Set to `"false"` to hide/refuse Groww |

`BROKER_ZERODHA_SHARED_APP` is not implemented. Shared multi-user Kite access
stays unavailable regardless of its value.

## 2. Zerodha (Kite Connect)

1. Each user creates a Kite Connect app at <https://developers.kite.trade/> and
   subscribes to Kite Connect (₹500/month per API key per Zerodha's support
   article). ZenFolio does not provide a shared app.
2. In the Kite app settings, register this redirect URL exactly:

   ```
   https://<your-deployment>/api/brokers/callback/zerodha
   ```

   The redirect URL is per app and per origin, and Kite allows exactly one per
   app. Production is `https://zenfolio-7jd.pages.dev/api/brokers/callback/zerodha`;
   the preview origin is the stable branch alias
   `https://feat-obsidian-dashboard.zenfolio-7jd.pages.dev/api/brokers/callback/zerodha`
   (set as `BROKER_PUBLIC_ORIGIN` in `[env.preview]`, so it survives every
   preview upload). To test on preview, temporarily switch the registration or
   use a second Kite app.
3. In ZenFolio → Brokers → Zerodha → **Connect account**, enter the app's API
   key and secret. The values are sent once to this deployment's Function,
   encrypted, and never returned to the browser.
4. The browser is sent to Kite's login page. Kite returns `request_token`, the
   Function exchanges it server-side with the documented checksum, and the
   browser is redirected back to `/?broker=connected&provider=zerodha&connection=…`.
5. Access tokens expire at 06:00 IST the next day. Kite has no refresh token;
   use **Reauthorize** to repeat the login.

The one-time `state` travels in Kite's `redirect_params`; KV stores only its
SHA-256 hash, so a KV dump cannot be replayed against the callback.

## 3. Groww (Trading API)

1. Create an API key and secret in the Groww app. Groww requires an active
   Trading API subscription (₹499 + taxes/month per its pricing page; verify
   current terms).
2. Groww may require daily approval of the key on its **Cloud API Keys** page.
   If a token mint starts failing, approve the key and use **Reauthorize** in
   ZenFolio.
3. In ZenFolio → Brokers → Groww → **Use my API keys**, enter the key and
   secret. The Function mints a token
   (`POST /v1/token/api/access`, `key_type: "approval"`), then immediately reads
   holdings. A minted token alone is not accepted as proof of read access.
4. Tokens expire daily at 06:00 IST. The stored key and secret are re-minted by
   **Test** or **Sync** when the token has expired, provided approval is current.

There is no redirect URL for Groww. The provider card shows the callback URL for
completeness only.

## 4. Verify a deployment

1. `GET /api/brokers/providers` with a valid Firebase ID token returns
   `storeReady: true`, `setupIssues: []`, and both providers enabled.
2. Create one connection per provider and use **Test**. A connection is only
   stored as `connected` after a live provider read.
3. Use **Sync**, then confirm the returned report shows per-category statuses and
   `coverage.currentDayOnly: true`.
4. Imported holdings appear as rows carrying broker provenance; manually entered
   rows are never modified.
5. Disconnect deletes the encrypted credential envelope. Reconnecting creates a
   new connection.

## 5. Known limits

- Order and trade data is **current day only** for both providers. Neither
  documents an all-time tradebook. The sync report says so and recommends
  statement import for history.
- Groww trades are fetched per order (pages of 50, capped at 40 orders per
  sync); the report marks such results `partial`.
- No scheduled/background sync. Syncs run when the user asks.
- Rate limits are per-isolate fixed windows, not a global account cap. A
  Cloudflare WAF rate-limit rule remains the account-level control.
- KV has no compare-and-swap; a two-minute sync lock prevents overlapping runs
  but not every race after a crash.
- No order placement, modification or cancellation exists anywhere in the
  adapter surface.
