-- Server-side cache of the latest market quote per ticker.
-- Written only by api/prices.ts using the service-role key, which bypasses RLS.
-- Idempotent: safe to run where the table already exists.

CREATE TABLE IF NOT EXISTS eod_price_cache (
  ticker          TEXT           PRIMARY KEY,
  price           NUMERIC(18, 4) NOT NULL CHECK (price > 0),
  week_high52     NUMERIC(18, 4),
  week_low52      NUMERIC(18, 4),
  change_percent  NUMERIC(10, 4),
  change          NUMERIC(18, 4),
  fetched_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  source          TEXT           NOT NULL
);

ALTER TABLE eod_price_cache ENABLE ROW LEVEL SECURITY;

-- Public market data: any client may read it.
-- No insert/update/delete policy exists, so only the service role can write.
DROP POLICY IF EXISTS "Anyone can read cached prices" ON eod_price_cache;
CREATE POLICY "Anyone can read cached prices"
  ON eod_price_cache FOR SELECT
  USING (true);
