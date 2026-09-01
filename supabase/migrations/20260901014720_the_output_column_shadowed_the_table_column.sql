-- `returns table (loaded int, gated int, ...)` declares an OUT variable named
-- `gated`, and the table it queries has a column of the same name, so
-- `where gated` was ambiguous and the whole load failed with 42702. Renamed the
-- outputs rather than qualifying the column, because a function whose output
-- names collide with its own table's columns will do this again on the next
-- edit.
drop function if exists public.load_tag_facet_map(uuid, jsonb);

create or replace function public.load_tag_facet_map(p_run_token uuid, p_rows jsonb)
returns table (n_loaded integer, n_gated integer, n_unknown_tags integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unknown integer;
begin
  if not exists (select 1 from public.facet_memo_runs where run_token = p_run_token) then
    raise exception 'unknown run_token';
  end if;

  create temporary table _incoming on commit drop as
  select (r->>'tag_id')::uuid                                 as tag_id,
         r->>'slug'                                           as slug,
         array(select jsonb_array_elements_text(r->'facets')) as facets,
         r->>'confidence'                                     as confidence,
         coalesce((r->>'gated')::boolean, false)              as gated,
         r->>'why'                                            as why
  from jsonb_array_elements(p_rows) r;

  -- A tag we have never ingested cannot be mapped. Counted and skipped rather
  -- than failing the load, because Tagger adds tags and the map is written
  -- against a snapshot.
  select count(*) into v_unknown
  from _incoming i
  where not exists (select 1 from public.scryfall_tags t where t.tag_id = i.tag_id);

  insert into public.tag_facet_map (tag_id, slug, facets, confidence, gated, why)
  select i.tag_id, i.slug, i.facets, i.confidence, i.gated, i.why
  from _incoming i
  where exists (select 1 from public.scryfall_tags t where t.tag_id = i.tag_id)
  on conflict (tag_id) do update
    set slug = excluded.slug,
        facets = excluded.facets,
        confidence = excluded.confidence,
        gated = excluded.gated,
        why = excluded.why;

  return query
    select (select count(*)::integer from public.tag_facet_map),
           (select count(*)::integer from public.tag_facet_map m where m.gated),
           v_unknown;
end;
$$;

revoke all on function public.load_tag_facet_map(uuid, jsonb) from public;
grant execute on function public.load_tag_facet_map(uuid, jsonb) to anon, authenticated, service_role;;
