-- Fix infinite RLS recursion on the "Admins can read all users" policy.
-- The original policy from 003_multi_tenant.sql used:
--   EXISTS (SELECT 1 FROM users me WHERE me.id = auth.uid() AND me.is_admin = true)
-- That subquery on the same `users` table re-triggers the SELECT policies,
-- causing infinite recursion. Every SELECT from users returned 500.
--
-- Replace with a SECURITY DEFINER function that bypasses RLS internally.

DROP POLICY IF EXISTS "Admins can read all users" ON users;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT is_admin FROM users WHERE id = auth.uid()), false)
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

CREATE POLICY "Admins can read all users"
  ON users FOR SELECT
  USING (public.is_current_user_admin());
