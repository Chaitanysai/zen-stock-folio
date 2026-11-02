# NSE trading calendar

`src/lib/market/nseHolidays.ts` is hand-maintained: NSE publishes its trading
holiday list once per year as an exchange circular
(<https://www.nseindia.com/resources/exchange-communication-holidays>). There
is no stable API, so the file carries an explicit coverage state per year.

| Coverage | Meaning | Runtime behaviour |
| --- | --- | --- |
| `verified` | Transcribed from the official circular | Full status |
| `provisional` | Only fixed-date national holidays are listed | Status is computed and `calendarCoverage: "provisional"` is returned; lunar/announced holidays may still be missing |
| missing year | No entry for that year | Fail-closed: `phase: "unknown"`, label `STATUS UNAVAILABLE`, data mode `unknown` |

## Current state

- 2025 — `verified` (14 holidays + Muhurat trading).
- 2026 — `provisional`: only Republic Day, Maharashtra Day, Gandhi Jayanti and
  Christmas. Holi, Id, Mahavir Jayanti, Good Friday, Ganesh Chaturthi,
  Dussehra, Diwali and Gurpurb are **not** listed yet. On those dates the
  dashboard can read the NSE as open when it is closed.
- 2027 — **missing**. From 1 January 2027 every NSE status reads
  `STATUS UNAVAILABLE` until the year is added.

## Gate

1. Transcribe the 2026 circular into `HOLIDAY_CALENDAR[2026]` (including the
   Diwali Muhurat session, if one is announced) and set `coverage: "verified"`.
2. Add `HOLIDAY_CALENDAR[2027]` from the 2027 circular **before 1 January
   2027**. This is a dated data task, not a code change.
3. If a year is not yet published, leave it missing rather than guessing:
   `STATUS UNAVAILABLE` is the correct presentation for an unknown calendar.
