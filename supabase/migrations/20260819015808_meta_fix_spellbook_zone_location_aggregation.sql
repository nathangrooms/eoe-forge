-- Fix: zone_locations is text[] per combo piece, and array_agg over an array column produces a
-- 2-D array, not a list of arrays. Aggregate the zone strings themselves instead, in a separate
-- CTE, so the quantity sum is not multiplied by the number of zones a piece can sit in.

create or replace function public.meta_load_spellbook_page(p_page jsonb, p_run bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  with v as (
    select j from jsonb_array_elements(coalesce(p_page->'results', '[]'::jsonb)) as j
  ),
  ins as (
    insert into public.meta_combos (
      id, source_id, status, identity, bracket_tag, popularity, produces,
      mana_needed, mana_value_needed, easy_prerequisites, notable_prerequisites,
      description, legalities, prices, spoiler, card_count, template_count,
      template_requirements, last_seen_run, updated_at
    )
    select
      v.j->>'id',
      'commander_spellbook',
      nullif(v.j->>'status', ''),
      nullif(v.j->>'identity', ''),
      nullif(v.j->>'bracketTag', ''),
      nullif(v.j->>'popularity', '')::integer,
      coalesce((
        select array_agg(distinct x.f)
        from jsonb_array_elements(coalesce(v.j->'produces', '[]'::jsonb)) p,
             lateral (select nullif(p->'feature'->>'name','') as f) x
        where x.f is not null
      ), '{}'::text[]),
      nullif(v.j->>'manaNeeded', ''),
      nullif(v.j->>'manaValueNeeded', '')::integer,
      nullif(v.j->>'easyPrerequisites', ''),
      nullif(v.j->>'notablePrerequisites', ''),
      nullif(v.j->>'description', ''),
      v.j->'legalities',
      v.j->'prices',
      coalesce((v.j->>'spoiler')::boolean, false),
      coalesce((
        select count(distinct u->'card'->>'oracleId')
        from jsonb_array_elements(coalesce(v.j->'uses', '[]'::jsonb)) u
        where nullif(u->'card'->>'oracleId','') is not null
      ), 0),
      coalesce((
        select sum(coalesce(nullif(r->>'quantity','')::integer, 1))
        from jsonb_array_elements(coalesce(v.j->'requires', '[]'::jsonb)) r
        where r->'template' is not null
      ), 0),
      (
        select jsonb_agg(jsonb_build_object(
          'name', r->'template'->>'name',
          'quantity', coalesce(nullif(r->>'quantity','')::integer, 1),
          'scryfall_query', r->'template'->>'scryfallQuery'))
        from jsonb_array_elements(coalesce(v.j->'requires', '[]'::jsonb)) r
        where r->'template' is not null
      ),
      p_run,
      now()
    from v
    where nullif(v.j->>'id','') is not null
    on conflict (id) do update set
      status = excluded.status, identity = excluded.identity, bracket_tag = excluded.bracket_tag,
      popularity = excluded.popularity, produces = excluded.produces,
      mana_needed = excluded.mana_needed, mana_value_needed = excluded.mana_value_needed,
      easy_prerequisites = excluded.easy_prerequisites,
      notable_prerequisites = excluded.notable_prerequisites,
      description = excluded.description, legalities = excluded.legalities,
      prices = excluded.prices, spoiler = excluded.spoiler,
      card_count = excluded.card_count, template_count = excluded.template_count,
      template_requirements = excluded.template_requirements,
      last_seen_run = excluded.last_seen_run, updated_at = now()
    returning 1
  )
  select count(*) into v_count from ins;

  -- Combo pieces. ONLY entries in `uses`, which are specific cards carrying an oracleId.
  --
  -- `requires` entries are deliberately excluded. They are Scryfall queries standing in for a
  -- class of card ("any permanent castable for {C}"), not cards. Writing them here would invent
  -- combo membership for every card matching the query and would render exactly as confidently
  -- as a real one. They live in meta_combos.template_requirements instead.
  with uses as (
    select
      j->>'id' as combo_id,
      u->'card'->>'oracleId' as oracle_id,
      coalesce(nullif(u->'card'->>'name',''), u->'card'->>'oracleId') as card_name,
      coalesce(nullif(u->>'quantity','')::integer, 1) as qty,
      coalesce((u->>'mustBeCommander')::boolean, false) as must_cmd,
      coalesce((select array_agg(z) from jsonb_array_elements_text(u->'zoneLocations') z), '{}'::text[]) as zones
    from jsonb_array_elements(coalesce(p_page->'results', '[]'::jsonb)) as j,
         jsonb_array_elements(coalesce(j->'uses', '[]'::jsonb)) as u
    where nullif(j->>'id','') is not null
      and nullif(u->'card'->>'oracleId','') is not null
  ),
  agg as (
    select combo_id, oracle_id, max(card_name) as card_name,
           sum(qty)::integer as qty, bool_or(must_cmd) as must_cmd
    from uses group by combo_id, oracle_id
  ),
  zone_agg as (
    select u.combo_id, u.oracle_id, array_agg(distinct z) as zone_locations
    from uses u, unnest(u.zones) z
    group by u.combo_id, u.oracle_id
  )
  insert into public.meta_combo_cards (combo_id, oracle_id, card_name, quantity, must_be_commander, zone_locations)
  select a.combo_id, a.oracle_id, a.card_name, a.qty, a.must_cmd,
         coalesce(za.zone_locations, '{}'::text[])
  from agg a
  left join zone_agg za on za.combo_id = a.combo_id and za.oracle_id = a.oracle_id
  on conflict (combo_id, oracle_id) do update set
    card_name = excluded.card_name, quantity = excluded.quantity,
    must_be_commander = excluded.must_be_commander, zone_locations = excluded.zone_locations;

  return v_count;
end;
$fn$;

revoke all on function public.meta_load_spellbook_page(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.meta_load_spellbook_page(jsonb, bigint) to service_role;;