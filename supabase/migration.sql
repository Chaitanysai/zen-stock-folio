-- Run this SQL in your Supabase project:
-- Dashboard → SQL Editor → New Query → paste & run

-- 1. Create the portfolio_snapshots table
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot  JSONB        NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row Level Security so users can only see their own data
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. Each user can only read/write their own row
CREATE POLICY "Users can read own snapshot"
  ON portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own snapshot"
  ON portfolio_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshot"
  ON portfolio_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshot"
  ON portfolio_snapshots FOR DELETE
  USING (auth.uid() = user_id);
