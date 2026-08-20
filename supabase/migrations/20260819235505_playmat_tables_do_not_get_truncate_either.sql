-- The two new playmat tables came out of the box holding TRUNCATE.
--
-- Supabase's default privileges grant everything on a new public table to
-- `anon` and `authenticated`, and TRUNCATE is in "everything". It bypasses RLS
-- entirely, which is why the 2026-08-18 hardening pass revoked it across the
-- board; a table created after that pass simply gets it again. Measured right
-- after the playmat migration: `authenticated` held TRUNCATE on both
-- `playmats` and `playmat_prefs`.
--
-- Not reachable through PostgREST today, same as last time. Revoked anyway,
-- for the same reason as last time.

revoke truncate on public.playmats      from anon, authenticated;
revoke truncate on public.playmat_prefs from anon, authenticated;
