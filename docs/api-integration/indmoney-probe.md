# INDstocks read-API probe

Status: **not run.** Production `INDSTOCKS_BASE_URL` was set on 2026-11-01 at the
operator's explicit request, before this probe was completed, so the field
mappings below are unverified against a live account. Every other environment
keeps `INDSTOCKS_BASE_URL` unset: while it is unset, both broker routes answer
`503 BROKER_DISABLED` and no unverified field mapping is reachable.

Run this once against the account owner's own INDmoney/INDstocks token, then
redact every account identifier (client id, user id, order/trade ids, PAN, email,
phone) before committing this file. Never commit the token itself.

## 1. API base URL

- Base URL observed in the authenticated app's network calls:
  `https://api.indstocks.com` (2026-11-01, authenticated `GET /user/profile`)
- Does it match the host the adapter assumes? yes
- Redirects or host changes: none observed

## 2. `GET /portfolio/holdings`

Documented shape (api-docs.indstocks.com/portfolio_funds, read 2026-11-02; not
yet confirmed against a live account):

- Response envelope (top-level keys): `status`, `data` (no known nested list key)
- Per-row keys: `security_id`, `symbol`, `isin`, `total_qty`, `used_qty`,
  `avg_price`, `t1_qty`, `t1_avg_price`, `dp_qty`, `dp_avg_price`
- Numeric fields delivered as strings? documented as numbers; live unknown
- Exchange field name and values: **none documented** — the adapter requires an
  exchange and reports a row without one as invalid rather than assuming NSE
- Empty-portfolio shape: unknown (adapter treats `{data:null}` and `{data:[]}`
  as empty)

## 3. `GET /trade-book`

Documented shape (api-docs.indstocks.com/normal_orders, read 2026-11-02; not yet
confirmed against a live account):

- Request: `GET /trade-book?segment={EQUITY|DERIVATIVE|COMMODITY}` — `segment`
  is required. On 2026-11-02 a production preview sent no `segment`; the broker
  rejected the call (4xx surfaced as `502 BROKER_CONTRACT`). The adapter now
  sends `?segment=EQUITY`.
- Response envelope (top-level keys): `status`, `data`
- Per-row keys: `fill_id`, `exch_order_id`, `quantity`, `price`, `trade_date`,
  `trade_serial_no`, `scrip_code`, `remarks` — no symbol, exchange, or side is
  documented
- Date/time field name and format (with timezone): `trade_date`,
  `2025-11-11T17:48:23+05:30`
- Stable per-fill id present? (field name, or "none"): `fill_id`
- Buy/sell field name and values: none documented

## 4. Token acceptance

- Was a dashboard-generated token accepted by `/portfolio/holdings` and
  `/trade-book`? not yet exercised (only `/user/profile` so far)
- If no, which token type works: the dashboard's 24-hour access token, sent as
  `Authorization: <token>` with no scheme prefix. `Authorization: Bearer <token>`
  is rejected with `401 {"error_type":"TokenException","message":"Unable to
  validate user token"}` (verified 2026-11-01). `x-api-key` is not required for
  `/user/profile`.

## 5. Pagination and caps

- Pagination parameters:
- Trade-book row cap per page:
- Page cap observed:

## 6. Rate limits and headers

- `Retry-After` or rate-limit headers observed:
- Documented limit:

## Outcome

- [ ] Adapter alias sets confirmed or amended
- [ ] `INDSTOCKS_BASE_URL` can be set
- [ ] If any item is unconfirmed: keep `INDSTOCKS_BASE_URL` unset and use CSV
      import; record the gap here
