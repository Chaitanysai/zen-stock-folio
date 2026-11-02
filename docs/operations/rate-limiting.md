# Rate limiting

Two layers, and only one of them lives in this repository.

## Layer 1 — in-process budgets (code)

`functions/api/_lib/ratelimit.ts` keeps a fixed-window counter per
`<uid>:<endpoint>` and every endpoint calls `checkRateLimit` before doing work.
Budgets are per authenticated user, not per IP, because every endpoint requires a
verified Firebase identity.

**Known limitation, by design:** the counters live in a `Map` inside a single
Worker isolate. Cloudflare runs many isolates, so the effective ceiling is
`configured limit × live isolates`. This softens abuse; it is not a hard cap.

Broker sync adds a two-part budget. The minute budget is per route — keyed
`{uid}:broker-link` in `POST /api/broker/indmoney/link` and `{uid}:broker-sync`
in `POST /api/broker/indmoney/sync` — while only the daily counter is shared by
both routes:

| Tier | Limit | Window | Storage |
| --- | --- | --- | --- |
| minute (per route) | 6 requests | 60 s | in-isolate `Map` (same as every other endpoint) |
| day (shared by both routes) | 20 requests | UTC day | Cloudflare KV counter in `PRICE_CACHE` |

The daily counter is read-modify-write without a transaction, so simultaneous
isolates can overshoot by a small amount; it is a cost guard, not an exact
quota. When the KV binding is absent the daily check fails open and only the
minute limiter applies. `Retry-After` on a daily 429 is the number of seconds
until the next UTC midnight.

## Layer 2 — the edge (console, not code)

The hard cap must be a Cloudflare WAF rate-limiting rule, because only the edge
sees every request across all isolates.

Create one rule on the Pages project (free tier includes one rate-limiting rule):

| Setting | Value |
| --- | --- |
| Rule name | `api-hard-cap` |
| If incoming requests match | URI Path starts with `/api/` |
| Rate | 100 requests per 60 seconds |
| Counting characteristic | IP address |
| Action | Block, duration 60 seconds |

Why per-IP here when the in-code limiter is per-user: the edge does not know who
the user is (Firebase ID-token verification happens inside the Function), and the
purpose of this layer is to stop volumetric abuse that never reaches that check.

The 100/min ceiling is above every per-user budget in `RATE_LIMITS` (the highest
is `prices` at 120/min for a single user, and the batch endpoints are far lower),
so it will not trip a normal dashboard session — verify that claim against real
traffic before trusting it.

## Verifying

```sh
# 1. Per-user budget: the 11th /api/ai call in a minute must be 429 with Retry-After
for i in $(seq 1 11); do
  curl -s -o /dev/null -w '%{http_code} ' https://<domain>/api/ai \
    -X POST -H "Authorization: Bearer $ID_TOKEN" \
    -H 'Content-Type: application/json' -d '{"type":"chat","messages":[{"role":"user","content":"hi"}]}'
done; echo

# 2. Edge cap: a burst from one IP must start returning Cloudflare's 429 block
#    page (HTML, not our JSON envelope) — that distinction proves which layer
#    fired.
```

If step 2 returns our JSON `{"error":"Rate limit exceeded"}`, only Layer 1 is
active: the WAF rule is missing or mis-scoped.
