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

- Response envelope (top-level keys):
- Per-row keys:
- Numeric fields delivered as strings? (which)
- Exchange field name and values:
- Empty-portfolio shape:

## 3. `GET /trade-book`

- Response envelope (top-level keys):
- Per-row keys:
- Date/time field name and format (with timezone):
- Stable per-fill id present? (field name, or "none")
- Buy/sell field name and values:

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
