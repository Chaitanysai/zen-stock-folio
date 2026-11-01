# INDmoney Sync + U.S. Holdings — Design

Status: approved 2026-11-01. Implementation has not started.

## 1. Context

ZenFolio is an Indian (NSE/INR) portfolio tracker. It stores one snapshot per
user in Firestore (`portfolios/{uid}`) and reaches market data through
Cloudflare Pages Functions. The browser owns all portfolio writes; Functions
verify Firebase ID tokens with a REST lookup and have no Admin SDK
(`functions/api/_lib/auth.ts`).

INDmoney exposes a trading API ("INDstocks"):

- Authentication: `POST /generate/token` with header `x-api-key` (Client ID)
  and body `{ mpin, totp }`; the token is valid for 24 hours and **only the
  newest token remains valid** (INDstocks FAQ, 2026-11-01).
- Read endpoints include `/user/profile`, `/funds`, `/portfolio/holdings`,
  `/portfolio/positions`, `/order-book`, `/trade-book` (INDstocks API overview,
  2026-11-01). Read-only endpoints do not require IP allowlisting (INDstocks
  Users page, 2026-11-01).
- Tradable exchanges are NSE, BSE, NFO and BFO. **No U.S. market and no U.S.
  holdings are documented** in this API. INDmoney's U.S. investing product has
  no public API.

Consequences: U.S. holdings cannot be synced from INDmoney. They are tracked
manually or via CSV, and U.S. *market data* comes from providers ZenFolio
already integrates (Yahoo primary, Twelve Data fallback).

Verified constraints in this repository:

- Symbols are NSE-only: `normalizeSymbol` rejects anything else and
  `toYahooSymbol` appends `.NS` (`src/lib/market-data/symbols.ts`).
- Search is filtered to `exchange === "NSI"` on purpose; unfiltered results
  rank the NYSE ADR above the NSE line
  (`docs/api-integration/MARKET-DATA-PROVIDER-CAPABILITY-COMPARISON.md`).
- Market phase/holidays are Asia/Kolkata only (`functions/api/_lib/marketPhase.ts`).
- `PortfolioStock` is a position row (`ticker`, `entryPrice`, `cmp`,
  `quantity`, `status`, optional `exitPrice`/`exitDate`). "Trade history" is
  `stocks.filter(status !== "Active")` (`src/components/TradeHistory.tsx`).
  There is no execution ledger.
- The snapshot is `{ stocks, trades, watchlist, alerts, fnoTrades }`
  (`src/lib/data/snapshotTypes.ts`).

## 2. Goals and non-goals

Goals:

1. Link an INDmoney (INDstocks) account with a pasted 24-hour token.
2. Sync Indian equity holdings and the trade book, with a preview diff and an
   explicit apply step.
3. Track U.S. holdings in the same portfolio, valued in INR with USD detail
   and FX P&L separated from price P&L.

Non-goals:

- Order placement or any write to the broker (ZenFolio stays tracking-only).
- Storing MPIN or a TOTP seed.
- Unattended/scheduled sync (would require a service account).
- Syncing INDmoney's U.S. account or U.S. options/F&O.
- Corporate actions beyond what the broker supplies.
- LRS/TCS/tax reporting.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Read-only API sync (no orders) | Matches the tracking-only product and avoids SEBI algo-trading obligations |
| D2 | U.S. holdings in the same design | One portfolio; no separate product surface |
| D3 | Encrypted 24-hour token, no MPIN/TOTP at rest | A stored MPIN + TOTP seed is effectively full broker access |
| D4 | Holdings + trade book | Open positions from the broker, audit trail and closed trades from fills |
| D5 | Preview diff, then apply | Protects manually entered positions from silent overwrite |
| D6 | INR totals, USD detail | Indian investor framing; FX effect must stay visible |
| D7 | Server-authoritative using the caller's Firebase ID token | No service-account credential; Firestore rules still enforce ownership |
| D8 | Stateless broker proxy; server reads/writes snapshot per request | Functions stay stateless; no background job |

## 4. Domain model

### 4.1 Position additions

`PortfolioStock` gains:

| Field | Type | Default on read | Meaning |
|---|---|---|---|
| `market` | `"NSE" \| "US"` | `"NSE"` | Listing market |
| `currency` | `"INR" \| "USD"` | `"INR"` | Native trading currency |
| `fxAtCost` | `number?` | absent | USD→INR rate when the position was opened |
| `source` | `"manual" \| "indmoney"` | `"manual"` | Ownership of the row for sync |
| `brokerRef` | `string?` | absent | Broker symbol/exchange as returned |

Identity is `market:ticker`. `INFY` on NSE and the NYSE ADR are distinct rows.

### 4.2 Execution ledger

`PortfolioSnapshot` gains an additive field:

```ts
executions?: Execution[]

type Execution = {
  id: string;                      // "indmoney:<tradeId>" or deterministic hash
  source: "indmoney";
  market: "NSE" | "US";            // v1 only writes "NSE"; the union leaves room
  ticker: string;                  // for a future U.S. broker feed
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: string;              // ISO-8601
  currency: "INR" | "USD";         // v1 only writes "INR"
};
```

Existing snapshots parse with `executions` defaulting to `[]`. CSV imports do
not create executions; they remain a broker-fill record.

### 4.3 Valuation

For every position, `fx = currency === "USD" ? usdInr : 1`:

- `valueInr = quantity × cmp × fx`
- `pricePnlInr = quantity × (cmp − entryPrice) × fx`
- `fxPnlInr = quantity × entryPrice × (fx − fxAtCost)`

If `fxAtCost` is absent, `fxPnlInr` is unavailable and renders `—`. It is never
estimated. Portfolio totals sum `valueInr` and `pricePnlInr`; the FX total is
shown separately and labelled as an estimate when any lot lacks `fxAtCost`.

Rounding: keep full precision internally; round once at render.

### 4.4 Compatibility

No migration job and no schema-version rewrite. `parseSnapshot` applies the
defaults in 4.1 and `[]` for executions. Older clients that ignore new fields
still render a valid portfolio.

## 5. Market data changes

### 5.1 Symbols

- `normalizeSymbol(raw, market = "NSE")`. NSE keeps the current regex. U.S.
  accepts `/^[A-Z][A-Z0-9.\-]{0,9}$/` (so `BRK.B` is valid).
- `toYahooSymbol(ticker, market)`: NSE appends `.NS`; U.S. returns the bare
  ticker.
- A single symbol never resolves to more than one market. Callers must state
  the market; there is no auto-detection.

### 5.2 Quotes, candles, search, EOD

- `POST /api/quotes` accepts `{ instruments: [{ market, ticker }] }`.
  Bare `{ tickers: [...] }` remains valid and means NSE. Each returned quote
  carries `market` and `currency`. The per-request cap is unchanged.
- `GET /api/candles?symbol=..&range=..&market=..`; U.S. sessions use ET
  timestamps; range presets are unchanged.
- `GET /api/search?q=..&market=..&limit=..`. NSE keeps the `NSI` filter; U.S.
  accepts NYSE/NASDAQ/AMEX listings. Results never mix markets. An empty result
  stays HTTP 200 with a note; provider failure stays 502.
- `POST /api/prices` (EOD cache) accepts the same `instruments` shape. Cache
  keys include the market (`US:AAPL:2026-11-01`) so the two markets cannot
  collide.

### 5.3 FX

New `GET /api/fx?base=USD&quote=INR`:

- Upstream: Yahoo `USDINR=X` chart endpoint, server-side only.
- Cached in the existing `PRICE_CACHE` KV for 15 minutes with a `stale` flag.
- Returns `{ rate, asOf, stale, provider }`. On upstream failure with a cached
  value, return it as `stale: true`; with none, return 502. Never return 0 or a
  guessed rate.
- The dashboard requests the rate once per refresh and reuses it for all rows.

### 5.4 Sessions and holidays

`marketPhase` becomes `marketPhase(market, now)`:

- NSE: 09:15–15:30 Asia/Kolkata, existing holiday handling.
- U.S.: 09:30–16:00 America/New_York, plus a checked-in NYSE/NASDAQ holiday
  list for the current year. An expired list must surface as "unknown" rather
  than "open".

Index tiles, F&O, and index alerts remain NSE-only.

### 5.5 UI

- Holdings table gains a currency indicator per row; U.S. rows show native USD
  price and quantity plus the INR value.
- Header totals stay INR. A separate FX P&L figure is shown beside price P&L.
- Adding a U.S. position offers a market selector; CSV import accepts a
  `market`/`currency` column (default NSE/INR).

## 6. Broker integration

### 6.1 Stored connection

Firestore document `users/{uid}/private/brokerConnection`:

```ts
{
  provider: "indmoney";
  ciphertext: string;   // base64
  iv: string;           // base64, 12 bytes
  keyVersion: 1;
  expiresAt: string;    // ISO, server clock + 24h at link time
  linkedAt: string;
  lastSyncAt?: string;
}
```

Rules: readable and writable only by `request.auth.uid === uid`; no other
access. The client may read `expiresAt` to prompt before expiry; it is advisory
UI state only. The server treats a broker 401 as the authoritative expiry
signal, since a newer token generated in the INDstocks dashboard invalidates
the stored one.

Encryption: AES-256-GCM via WebCrypto in the Worker. Key from the
`BROKER_TOKEN_KEY` secret (32 bytes, base64). Additional authenticated data is
`` `${uid}:indmoney:v${keyVersion}` `` so ciphertext cannot be moved between
users. Decryption happens only inside Functions; the plaintext token is never
returned to the client, written to Firestore, or logged.

### 6.2 Routes

Both routes require a verified Firebase identity (existing helper) and are
disabled with HTTP 503 when `BROKER_TOKEN_KEY` is absent.

**`POST /api/broker/indmoney/link`**

```
request  { token: string }
response { ciphertext, iv, keyVersion, expiresAt }
errors   401 invalid/expired token from broker
         429 rate limited
         503 broker integration not configured
```

Validates the token with `GET /user/profile` before encrypting. Body cap 4 KB.

**`POST /api/broker/indmoney/sync`**

```
request  { mode: "preview" | "apply", ciphertext, iv, keyVersion,
           baseUpdateTime?: string }   // required for apply
response PreviewResult | ApplyResult
```

`PreviewResult`:

```ts
{
  mode: "preview";
  fetchedAt: string;
  snapshotUpdateTime: string;
  holdings: { added: HoldingChange[]; updated: HoldingChange[];
              removed: HoldingChange[]; unchanged: number };
  conflicts: Conflict[];        // manual row with the same market:ticker
  unmatched: Unmatched[];       // broker symbol that could not be mapped
  executions: { added: number; duplicates: number };
  warnings: string[];           // e.g. empty broker result, missing entryDate
}
```

`ApplyResult`: `{ mode: "apply"; applied: { added, updated, removed, executions },
snapshotUpdateTime, warnings }`.

### 6.3 Normalization

Holdings (`GET /portfolio/holdings`, expected fields; the probe in §10 confirms
the exact names): broker symbol, exchange, ISIN, quantity, average price.
Mapping:

- `ticker` = broker symbol, uppercased; `market` = `NSE` (only NSE/BSE
  holdings are accepted; BSE-only listings are reported as unmatched in v1).
- `entryPrice` = broker average price; `quantity` = broker quantity.
- `cmp` = existing value or 0 until the next quote refresh; the sync never
  invents a market price.
- `entryDate`: preserved when the row already exists; otherwise the earliest
  matching BUY in the trade book; otherwise today with a warning in
  `warnings[]` and `notes.tradeReason` untouched.
- `source` = `"indmoney"`, `brokerRef` = `exchange:tradingsymbol`.

Trade book (`GET /trade-book`): one `Execution` per fill. `id` =
`indmoney:<tradeId>` when the broker exposes a stable id; otherwise a SHA-256
of `ticker|side|quantity|price|executedAt` prefixed `indmoney:hash:`. Duplicate
ids are skipped. In the fallback case the diff surfaces identical fills so the
user can reject them.

Closed positions: on every sync, all `source: "indmoney"` rows with status
`Sold Profit`/`Sold Loss` are recomputed FIFO from the full execution history
and replaced wholesale. Open rows come from `/portfolio/holdings`. Journal
`notes` are carried over by `market:ticker` (and exit date when multiple
closed lots exist). A row whose `notes` cannot be matched to a derived lot is
kept unchanged and listed in `conflicts`; the remaining rows are still
recomputed.

### 6.4 Diff and apply

Preview:

1. Verify identity; decrypt token; fetch holdings and trade book in parallel
   (8 s timeout, one retry on network/5xx, none on 4xx).
2. Read `portfolios/{uid}` with the caller's ID token.
3. Compute the diff against `source: "indmoney"` rows and `executions` only.
4. Return the diff and the snapshot `updateTime`.

Apply:

1. Repeat steps 1–3.
2. If `baseUpdateTime` does not equal the current `updateTime`, return
   `409 SNAPSHOT_CHANGED` — nothing is written.
3. Write once with Firestore `:commit` (update of the snapshot document) using
   the `updateTime` precondition. A failed precondition maps to the same 409.
4. Return counts and the new `updateTime`.

Guards:

- Manual rows are never created, modified, or deleted by sync.
- A ticker that exists manually and at the broker is a `conflict`; the manual
  row wins and the broker row is skipped.
- A sync that returns zero holdings while the previous INDmoney sync had rows
  is reported as a warning and requires explicit confirmation before apply.
- A response with `unmatched` entries can still apply the matched subset.

### 6.5 Limits

New rate-limit tier `BROKER_SYNC`: 6 requests/minute and 20/day per user.
Link uses the same tier. Upstream timeouts are 8 s; no unbounded retries.

## 7. Security

- Plaintext broker tokens exist only in request memory inside a Function.
- Ciphertext lives in the user's own document; losing Firestore exposes no
  usable credential without `BROKER_TOKEN_KEY`.
- The sync response never contains the token or raw broker payloads.
- Logs contain status codes and counts only (existing `log.ts`).
- A stolen session can trigger a sync (equivalent to the user's own access)
  but cannot extract the stored token.
- Missing key disables only the two broker routes.

## 8. Failure handling

| Condition | HTTP | Code | UI |
|---|---|---|---|
| Broker rejects the token | 409 | `TOKEN_EXPIRED` | Prompt for a new token; mark connection stale |
| Invalid ciphertext/AAD | 400 | `BAD_CIPHERTEXT` | Force re-link |
| Snapshot changed since preview | 409 | `SNAPSHOT_CHANGED` | Re-run preview |
| Broker 5xx/timeout | 502 | `BROKER_UNAVAILABLE` | Retry later; nothing written |
| Broker returns unparseable payload | 502 | `BROKER_CONTRACT` | Retry later; report the shape mismatch |
| Rate limited | 429 | `RATE_LIMITED` | Show retry-after |
| Key not configured | 503 | `BROKER_DISABLED` | Hide the connect card |

## 9. Testing

- Unit: symbol normalization per market, FX math, FIFO derivation, execution
  idempotency, diff classification, note preservation.
- Route: unauthenticated 401, unverified email rejected, expiry/409/429/503
  paths, size caps, that apply never writes on a stale `updateTime`.
- Contract: fixtures captured from the probe in §10, with account identifiers
  and PII removed, asserting the normalizer against real field names.
- Rules: `users/{uid}/private/**` readable only by its owner.
- Browser smoke: one Playwright path with a stubbed broker (link → preview →
  apply → visible holdings), plus a U.S. holding entered manually and priced
  through `/api/quotes` with an FX rate.

## 10. Pre-implementation probe (requires the user's account)

Before the adapter mapping is finalized, one authenticated probe captures:

1. API base URL (not published in the pages reached).
2. `/portfolio/holdings` response shape and field names.
3. `/trade-book` response shape, date format, and whether a stable trade id
   exists.
4. Whether a dashboard-generated token is accepted by these read endpoints
   (versus a `/generate/token` token).
5. Pagination and row caps on the trade book.
6. Broker rate limits/headers, if any.

Fixtures are committed with identifiers redacted. If an item cannot be
confirmed, the adapter keeps the CSV path as the fallback: the sync normalizer
and the importer share one canonical DTO.

## 11. References

- INDstocks — User Authentication & Profile API:
  https://api-docs.indstocks.com/Users/
- INDstocks — API overview:
  https://api-docs.indstocks.com/api-overview/
- INDstocks — FAQ (token lifetime, TOTP flow):
  https://api-docs.indstocks.com/faq/
- INDstocks — API conventions:
  https://api-docs.indstocks.com/conventions/
- OpenAlgo — IndMoney broker notes:
  https://docs.openalgo.in/connect-brokers/brokers/indmoney
- Repository: `docs/api-integration/MARKET-DATA-PROVIDER-CAPABILITY-COMPARISON.md`

All INDstocks page checks were performed on 2026-11-01. Response shapes are
unverified until the probe in §10.
