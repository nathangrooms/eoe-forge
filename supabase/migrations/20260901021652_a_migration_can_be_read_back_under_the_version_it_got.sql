-- Read an applied migration back, so its file can be written under the version
-- number the DATABASE recorded rather than a fresh timestamp.
--
-- CLAUDE.md records four migrations sitting in the repo under one version and
-- in `schema_migrations` under another. The hazard is `supabase db push`: it
-- compares repo version numbers against applied ones, sees the repo timestamps
-- as new, and re-runs migrations the database already has. Whether that is
-- harmless depends entirely on whether each one is idempotent, and several are
-- not.
--
-- Gated on the run token, the same admin-only gate as `facet-memo-fill`, because
-- migration bodies describe the schema and anon should not enumerate them.

create or replace function public.applied_migration_sql(p_run_token uuid, p_version text)
returns table (version text, name text, sql text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.facet_memo_runs where run_token = p_run_token) then
    raise exception 'unknown run_token';
  end if;
  return query
    select m.version, m.name, array_to_string(m.statements, E';\n\n') || ';'
    from supabase_migrations.schema_migrations m
    where m.version = p_version;
end;
$$;

revoke all on function public.applied_migration_sql(uuid, text) from public;
grant execute on function public.applied_migration_sql(uuid, text) to anon, authenticated, service_role;;
