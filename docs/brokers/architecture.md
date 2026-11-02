# Broker connection framework — discovery and design

Status: **configured and deployed in preview and production; no connection is
activated.** The `BROKER_STORE` KV binding, `BROKER_PUBLIC_ORIGIN` and the
`BROKER_CREDENTIALS_KEYS` secret exist in both environments (see `setup.md`), so
the broker surfaces are enabled there. No provider credentials have been
entered, no callback is registered, and no real broker API has been called. No
live broker credentials were used during development.

## 1. Architecture discovered

| Concern | Active implementation |
|---|---|
| Frontend | Vite 5, React 18, TypeScript, dashboard in `src/pages/Index.tsx` |
| Hosting | Cloudflare Pages project `zenfolio`; previews are manual `wrangler pages deploy` uploads |
| API runtime | Pages Functions in `functions/api/*` (file-based routes under `/api/*`) |
| Identity | Firebase Auth; every `/api/*` call carries `Authorization: Bearer <Firebase ID token>` |
| Server identity check | `functions/api/_lib/auth.ts` — Identity Toolkit `accounts:lookup`, fail closed |
| User data | Firestore `portfolios/{uid}` and `users/{uid}`, owner-only rules, one whole-portfolio snapshot |
| Server data | Cloudflare KV `PRICE_CACHE` (disposable market cache) |
| Secrets | Cloudflare Pages secrets / `.dev.vars`; never `VITE_*` for server values |
| Tests | Vitest + Testing Library for `src/`; Functions suites exist under `functions/` but were not wired into a script before this feature |

The browser never receives server secrets. There is no Firebase Admin SDK path
in Workers, so the server cannot read or write Firestore. That constraint drives
the storage split below.

## 2. Provider evidence (official docs, reviewed 2026-10-28)

### Zerodha Kite Connect

Source: <https://kite.trade/docs/connect/v3/user/>,
<https://kite.trade/docs/connect/v3/portfolio/>,
<https://kite.trade/docs/connect/v3/orders/>,
<https://support.zerodha.com/category/trading-and-markets/general-kite/kite-api/articles/kite-connect-api-faqs>

- Login: `https://kite.zerodha.com/connect/login?v=3&api_key=<key>`.
- `redirect_params` is supported and is URL-encoded query data appended to the
  registered redirect URL, so ZenFolio can carry a one-time `state`.
- The redirect returns `request_token`, which lives only a few minutes and is
  one-time.
- Token exchange: form-encoded `POST https://api.kite.trade/session/token` with
  `api_key`, `request_token`, `checksum`, where
  `checksum = SHA-256(api_key + request_token + api_secret)`.
- Access tokens expire at **06:00 IST the next day**. Reauthorization requires a
  fresh browser login; there is no refresh token.
- Read-only data: `GET /portfolio/holdings`, `GET /portfolio/positions`,
  `GET /orders`, `GET /trades`. Orders and trades are **current-day** records;
  no all-time tradebook endpoint is documented.
- One Kite Connect app is tied to one client ID and its own paid subscription
  (₹500/month per API key per the official support article). Shared multi-user
  use is therefore **not enabled**; each ZenFolio user must supply credentials
  for their own Kite Connect app. The shared-app capability is reported as
  unavailable unless a future written approval and configuration exist.
- The `api_secret` must never be shipped to a browser; the exchange happens in
  the Pages Function.

### Groww Trading API

Source: <https://groww.in/trade-api/docs/curl> and
<https://groww.in/trade-api/docs/curl/portfolio>,
<https://groww.in/trade-api/docs/curl/orders>

- Users create an API key and secret in their Groww profile. There is no OAuth
  redirect flow documented for third-party apps.
- Token: `POST https://api.groww.in/v1/token/api/access` with
  `Authorization: Bearer <API_KEY>` and JSON
  `{ "key_type": "approval", "checksum": SHA-256(secret + timestamp), "timestamp": "<epoch seconds>" }`.
- The key must be approved daily on Groww's Cloud API Keys page. Tokens expire
  daily at **06:00 IST** (the token response also carries an `expiry`).
- Subscription: Groww's pricing page states ₹499 + taxes per month; verify the
  current terms before enabling in production.
- Read-only data: `GET /v1/holdings/user`, `GET /v1/positions/user?segment=CASH|FNO`,
  `GET /v1/order/list?segment=...&page=0&page_size=100`, and
  `GET /v1/order/trades/<order_id>?segment=...&page=0&page_size=50`.
- There is no bulk executed-trade endpoint. Trades are fetched per order, so the
  sync engine caps how many orders it walks and reports partial coverage.
- Documented rate limits: authentication 5/s, orders 10/s, live data 10/s,
  non-trading (holdings/positions/orders/trades) 20/s and 500/min; the token
  endpoint is limited to 150 requests per 24 hours.

## 3. Storage and encryption design

There is no server-side Firestore access, and adding a database is out of scope.
The server stores only broker connection state:

- New KV binding `BROKER_STORE` (server-only). Keys are namespaced by uid.
- Credentials are encrypted with AES-256-GCM (WebCrypto) before they are
  written. The key comes from the `BROKER_CREDENTIALS_KEYS` secret, a JSON map
  of version → base64 32-byte key. Per-record AAD binds version, uid,
  connection id and provider.
- Ciphertext envelopes store only `{v, iv, ct, createdAt}`. Key material is
  never written to KV and never returned by an endpoint.
- If the binding or a valid key is missing, every broker endpoint fails closed
  with `setup_required`; provider cards show the missing variable **names** only.
- Connection metadata (status, timestamps, last safe error code, last sync
  summary) is stored separately from credentials. There is no credential field
  in the connection record.

Imported holdings reach the existing user data path by returning normalized
records from the sync endpoint; the authenticated browser merges them into the
owner-only Firestore snapshot. This preserves the single-source-of-truth model
and keeps all user portfolio writes behind Firestore rules. The server never
writes portfolio data.

## 4. State model

`pending_credentials → pending_authorization → connected` for Zerodha;
`pending_credentials → connected` for Groww after a real token mint + holdings
call. `connected → syncing → connected` around a sync. Auth failures produce
`reauthorization_required`; 429/5xx/timeouts produce
`temporarily_unavailable` without discarding credentials; disconnecting is
terminal and deletes the credential envelope.

## 5. Files as implemented

| Area | Files |
|---|---|
| Shared contract | `src/lib/brokers/contracts.ts`, `registry.ts`, `messages.ts` |
| Server security | `functions/api/brokers/_lib/{crypto,state,store,errors,schemas,stateMachine,access,session,failures,authorize,providerHttp,time,normalize}.ts` |
| Providers | `functions/api/brokers/_lib/providers/{zerodha,groww,index}.ts` |
| Sync | `functions/api/brokers/_lib/sync.ts` |
| API | `functions/api/brokers/{providers,authorize,callback/[provider],connections/index,connections/[id],connections/[id]/test,connections/[id]/sync,connections/[id]/sync-status}.ts` |
| Browser client | `src/lib/brokers/{client,merge}.ts` |
| UI | `src/components/dashboard/Brokers.tsx`, `BrokerFormDialog.tsx`, `nav.ts`, `src/pages/Index.tsx`, `src/styles/dashboard.css` |
| Tests | `functions/api/brokers/**/*.test.ts`, `src/lib/brokers/*.test.ts` |
| Docs/config | `docs/brokers/{architecture,setup}.md`, `.env.example`, `wrangler.toml` (commented binding), `vitest.functions.config.ts`, `tsconfig.functions.json`, `package.json` scripts |

## 6. Risks and blockers

- **Deployment prerequisites:** the `BROKER_STORE` KV namespace and binding,
  `BROKER_CREDENTIALS_KEYS` and `BROKER_PUBLIC_ORIGIN`. All four are present in
  preview and production, each environment with its own namespace and its own
  key set, so nothing is shared between them. An environment that loses any of
  them goes inert with `setup_required` — that fail-closed behavior is intended.
- **Activation is per-user and manual:** a connection is stored only after a live
  provider read, and ZenFolio registers no callback on the user's behalf.
- **Zerodha app registration:** each user's Kite Connect app must register
  `<origin>/api/brokers/callback/zerodha` as its redirect URL. ZenFolio cannot
  do this on the user's behalf.
- **Zerodha multi-user:** disabled. Enabling shared-app mode requires written
  Zerodha approval and a reviewed production configuration.
- **Historical trades:** neither provider documents an all-time tradebook.
  Coverage is reported as current-day; statement (CSV) import is the future path.
- **KV consistency/atomicity:** KV has no compare-and-swap. Authorization states
  are provider-scoped (`state:{provider}:{hash}`) so one provider cannot consume
  another's state, and completion only finalizes a connection still in
  `pending_authorization`. Consumption itself is best effort, not atomic; the
  provider's one-time `request_token` is the effective single-use gate. A strict
  exactly-once consumer needs a Durable Object (a separate Worker binding, not
  introduced here). A short-lived sync lock plus idempotent client merge
  mitigates duplicate sync runs; a crash can leave a lock that expires after two
  minutes.
- **No live verification:** no broker credentials, subscriptions or approvals
  were available. Adapters are tested against documented response shapes with
  mocks only; this is not evidence of a live integration.
- **Groww response aliases:** Groww documents field names per endpoint but the
  live payloads can vary; the adapter accepts documented aliases and skips
  unrecognised rows rather than inventing values. A live smoke test should
  confirm the holding, position, order and trade field names before relying on
  them.
