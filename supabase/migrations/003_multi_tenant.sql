-- ============================================
-- Multi-tenant rework
-- ============================================
-- Adds user_status enum, is_admin flag, app_settings table.
-- Drops the leaky "Anyone can count users" RLS policy and replaces it
-- with row-scoped + admin-scoped policies plus SECURITY DEFINER RPCs
-- for the public counts the signup page needs.
-- Migrates the existing single user (if any) to admin/active.

-- ---- 1. user_status enum ----

CREATE TYPE user_status AS ENUM ('pending_approval', 'active', 'rejected');

-- ---- 2. New columns on users ----

ALTER TABLE users ADD COLUMN email text;
ALTER TABLE users ADD COLUMN status user_status NOT NULL DEFAULT 'pending_approval';
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN approved_at timestamptz;

-- Backfill the existing user (if any) as admin + active
UPDATE users
SET email = username || '@pear.music',
    status = 'active',
    is_admin = true,
    approved_at = created_at;

ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
ALTER TABLE users DROP COLUMN username;

-- ---- 3. app_settings table (single row) ----

CREATE TABLE app_settings (
  id               smallint PRIMARY KEY CHECK (id = 1),
  max_active_users int NOT NULL DEFAULT 15,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (id, max_active_users) VALUES (1, 15);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
  ON app_settings FOR SELECT
  USING (true);

-- No client-side INSERT/UPDATE policies — admin Edge Function uses service role.

-- ---- 4. Tighten RLS on users (drop the permissive SELECT policy) ----

DROP POLICY IF EXISTS "Anyone can count users" ON users;
DROP POLICY IF EXISTS "Users can read own profile" ON users;

CREATE POLICY "Users can read own row"
  ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users me
      WHERE me.id = auth.uid() AND me.is_admin = true
    )
  );

-- ---- 5. Public count RPCs (SECURITY DEFINER, bypass RLS for counts only) ----

CREATE OR REPLACE FUNCTION public.count_users_by_status(target_status user_status)
  RETURNS int
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int FROM users WHERE status = target_status
$$;

CREATE OR REPLACE FUNCTION public.count_total_users()
  RETURNS int
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT count(*)::int FROM users
$$;

GRANT EXECUTE ON FUNCTION public.count_users_by_status(user_status) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_total_users() TO anon, authenticated;
