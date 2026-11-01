# INDmoney broker sync

Status: implemented, **disabled by configuration** until the API probe
(`docs/api-integration/indmoney-probe.md`) is complete.

## What it does

- Reads the user's NSE holdings and trade book from INDstocks over HTTPS.
- Shows a preview diff, then applies it only on an explicit second request.
- Creates, updates, or removes only rows with `source: "indmoney"`. Manual rows
  are never touched; a ticker that also has a manual row is skipped and reported
  as a `manual-position` conflict.
- Recomputes closed positions FIFO from the full merged execution ledger.
- Returns `409 SNAPSHOT_CHANGED` if the portfolio changed between preview and
  apply; nothing is written in that case.
- Refuses to remove every synced open position unless the apply request carries
  `confirmEmpty: true` after the user confirms in the UI.

It is read-only at the broker: there are no order, funds, or profile-write
endpoints in the adapter.

## Data path

1. The browser pastes a 24-hour INDstocks token.
2. `POST /api/broker/indmoney/link` validates it with `GET /user/profile` and
   returns AES-256-GCM ciphertext (AAD = `<uid>:indmoney:v1`).
3. The browser stores that ciphertext in
   `users/{uid}/private/brokerConnection` (owner-only rules).
4. `POST /api/broker/indmoney/sync` decrypts it in Function memory, reads the
   broker, and reads/writes `portfolios/{uid}` through the Firestore REST API
   **using the caller's own Firebase ID token**. Firestore rules remain the
   authority; there is no service account.
5. The plaintext token exists only in request memory. It is never logged,
   returned to the browser, or written anywhere.

## Configuration (names only)

| Name | Secret | Required for sync | Purpose |
| --- | --- | --- | --- |
| `FIREBASE_PROJECT_ID` | no | yes | Project for Firestore REST (`/v1/projects/<id>/databases/(default)`) |
| `INDSTOCKS_BASE_URL` | no | yes | Broker API origin; unset = routes answer `503 BROKER_DISABLED` |
| `INDSTOCKS_API_KEY` | yes | yes | App credential sent with each broker request |
| `BROKER_TOKEN_KEY` | yes | yes | 32 random bytes, base64; seals every stored token |

Set secrets with `wrangler pages secret put <NAME>` and local values in
`.dev.vars` (gitignored). Generate the sealing key with
`openssl rand -base64 32`; paste it at the prompt, do not save it in a file.

## Enable checklist

1. The probe is complete and committed with identifiers redacted.
2. `FIREBASE_PROJECT_ID` matches the Firebase project that serves the app.
3. `INDSTOCKS_API_KEY` and `BROKER_TOKEN_KEY` are set as secrets in the target
   environment.
4. `INDSTOCKS_BASE_URL` is set last, after 1–3.
5. Run the smoke test against a local deployment (see below).

## Disable / roll back

- Remove `INDSTOCKS_BASE_URL` from the environment. Both routes return
  `503 BROKER_DISABLED`; no read or write is attempted.
- Users can press **Unlink** in the portfolio card. That deletes the ciphertext
  document; synced holdings and executions stay in the portfolio.
- Rotating `BROKER_TOKEN_KEY` makes every stored ciphertext undecryptable. This
  is a deliberate global revoke: every user must link again. Do it only with
  operator approval, and expect `BAD_CIPHERTEXT` until they do.

## Limits

- Firestore caps one document at 1 MiB. The sync checks the encoded write
  before sending it and answers `409 SNAPSHOT_LIMIT_EXCEEDED` when the merged
  snapshot would not fit; nothing is written in that case. The 10 000-fill
  ledger bound is a schema bound, not a guarantee that 10 000 fills fit.
- Each broker route has its own budget of **6 requests/minute**. Both share a
  per-uid daily budget of **20 requests/day**.
- The minute budgets are per Worker isolate; the day budget is a best-effort KV
  counter (non-atomic across isolates). See `rate-limiting.md`.
- Upstream calls time out after 8 s with one retry on network/5xx, none on 4xx.

## Response codes

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_TOKEN`, `INVALID_REQUEST`, `BAD_CIPHERTEXT`, `MISSING_BASE_UPDATE_TIME` | Request was malformed; nothing changed |
| 409 | `TOKEN_EXPIRED` | Broker rejected the token; link again |
| 409 | `SNAPSHOT_CHANGED` | Portfolio moved since the preview; preview again |
| 409 | `EMPTY_HOLDINGS_CONFIRMATION_REQUIRED` | Broker returned no holdings; explicit confirmation needed |
| 409 | `SNAPSHOT_LIMIT_EXCEEDED` | 1000 rows / 10000 executions cap, or the 1 MiB document cap, would be exceeded |
| 429 | `RATE_LIMITED` | Minute or day budget exhausted; honor `Retry-After` |
| 500 | `BROKER_KEY_INVALID` | Server encryption key is missing or malformed; nothing was written |
| 502 | `BROKER_UNAVAILABLE`, `BROKER_CONTRACT`, `SNAPSHOT_UNAVAILABLE`, `SNAPSHOT_WRITE_FAILED` | Upstream/provider failure; nothing changed |
| 503 | `BROKER_DISABLED` | Environment incomplete |

## Smoke test

```sh
# 1. Local dev server (Functions included)
npx wrangler pages dev dist --port 8080

# 2. Save a signed-in browser session once (opens a real browser)
npm run e2e:save-auth

# 3. Unlinked/disabled path always runs; the connected path needs a live token
BROKER_TEST_TOKEN='<24-hour-token>' npm run test:e2e:broker

# 4. Manual U.S. holding: adds a temporary AAPL row, checks USD/INR rendering,
#    then deletes that row again
npm run test:e2e:us
```

The token in step 3 is a live credential: set it only in the shell for that one
command, never in `.env`/`.dev.vars`, and never paste it into a ticket or chat.
The script does not print it.
