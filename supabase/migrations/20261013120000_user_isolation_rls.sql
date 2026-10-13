-- ════════════════════════════════════════════════════════════════════════════
-- Strict per-user isolation for portfolio data.
--
-- Safe to re-run. This migration is ADDITIVE ONLY:
--   * it never DELETEs, UPDATEs or re-assigns any existing row
--   * it never disables row level security
--   * ownership of pre-existing rows is left exactly as it is
--
-- What it fixes
--   1. portfolio_snapshots UPDATE policy had USING but no WITH CHECK, so an
--      authenticated user could rewrite their row's user_id and hand their row
--      to (or steal a row for) another account. WITH CHECK closes that.
--   2. Policies were unqualified, so they also applied to the `anon` role.
--      They are now restricted to `authenticated`.
--   3. `profiles` is queried by the client (src/pages/Index.tsx) but had no
--      table definition, no RLS and no policies in version control. It is now
--      defined and locked to the owning user.
--
-- Apply with:  supabase db push
-- or manually: Supabase Dashboard -> SQL Editor -> paste & run
-- ════════════════════════════════════════════════════════════════════════════

-- ── portfolio_snapshots ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot   JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own snapshot"   ON public.portfolio_snapshots;
DROP POLICY IF EXISTS "Users can upsert own snapshot" ON public.portfolio_snapshots;
DROP POLICY IF EXISTS "Users can update own snapshot" ON public.portfolio_snapshots;
DROP POLICY IF EXISTS "Users can delete own snapshot" ON public.portfolio_snapshots;

CREATE POLICY "Users can read own snapshot"
  ON public.portfolio_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own snapshot"
  ON public.portfolio_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- USING  -> which rows may be targeted
-- WITH CHECK -> what the row may look like afterwards (blocks user_id rewrite)
CREATE POLICY "Users can update own snapshot"
  ON public.portfolio_snapshots FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshot"
  ON public.portfolio_snapshots FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No-ops when the columns already exist.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── Verification (read-only; run manually after applying) ───────────────────
-- Expect rowsecurity = true for both tables:
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN ('portfolio_snapshots', 'profiles');
--
-- Expect every policy to be scoped to {authenticated} and both UPDATE
-- policies to have a non-null with_check:
--   SELECT tablename, policyname, roles, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename IN ('portfolio_snapshots', 'profiles')
--   ORDER BY tablename, cmd;
--
-- Two-user check (run as each user's JWT, e.g. from the app or a REST call):
--   SELECT count(*) FROM portfolio_snapshots;              -- expect 0 or 1 (own row only)
--   SELECT count(*) FROM portfolio_snapshots
--     WHERE user_id <> auth.uid();                          -- expect 0
--   UPDATE portfolio_snapshots SET user_id = '<other-user-uuid>';  -- expect 0 rows / error
