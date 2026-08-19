-- The canonical transform from a raw third-party payload into meta_* rows.
--
-- It lives in SQL, once, rather than in each ingestion client, so that every caller produces
-- byte-identical rows. The edge functions are deliberately thin: fetch a page, hand the raw
-- JSON to these functions, checkpoint. Any future client (a backfill script, a cron job, a
-- manual repair) gets the same normalisation for free and cannot drift from it.

-- ---------------------------------------------------------------------------
-- Commander Spellbook: one page of /variants/ .
-- ---------------------------------------------------------------------------

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
        select array_agg(distinct f) from jsonb_array_elements(coalesce(v.j->'produces', '[]'::jsonb)) p,
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
      -- Template pieces are counted, never turned into cards. See below.
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
  -- `requires` entries are deliberately excluded here. They are Scryfall queries standing in
  -- for a class of card ("any permanent castable for {C}"), not cards. Writing them into this
  -- table would invent combo membership for every card matching the query and would render as
  -- confidently as a real one. They are kept as meta_combos.template_requirements instead.
  insert into public.meta_combo_cards (combo_id, oracle_id, card_name, quantity, must_be_commander, zone_locations)
  select
    j->>'id',
    u->'card'->>'oracleId',
    coalesce(nullif(u->'card'->>'name',''), u->'card'->>'oracleId'),
    sum(coalesce(nullif(u->>'quantity','')::integer, 1)),
    bool_or(coalesce((u->>'mustBeCommander')::boolean, false)),
    (array_agg(coalesce((select array_agg(z) from jsonb_array_elements_text(u->'zoneLocations') z), '{}'::text[])))[1]
  from jsonb_array_elements(coalesce(p_page->'results', '[]'::jsonb)) as j,
       jsonb_array_elements(coalesce(j->'uses', '[]'::jsonb)) as u
  where nullif(j->>'id','') is not null
    and nullif(u->'card'->>'oracleId','') is not null
  group by j->>'id', u->'card'->>'oracleId', coalesce(nullif(u->'card'->>'name',''), u->'card'->>'oracleId')
  on conflict (combo_id, oracle_id) do update set
    card_name = excluded.card_name, quantity = excluded.quantity,
    must_be_commander = excluded.must_be_commander, zone_locations = excluded.zone_locations;

  return v_count;
end;
$fn$;

comment on function public.meta_load_spellbook_page(jsonb, bigint) is
  'Normalises one page of Commander Spellbook /variants/ into meta_combos and meta_combo_cards. The canonical transform: ingestion clients fetch and hand raw JSON here rather than reimplementing it. Template requirements are stored as metadata and never as combo cards.';

-- ---------------------------------------------------------------------------
-- MTGJSON: one deck file.
-- ---------------------------------------------------------------------------

create or replace function public.meta_load_mtgjson_deck(p_file_name text, p_deck jsonb)
returns table (deck_id uuid, deck_format text, total_cards integer, is_complete boolean, ingested boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_type    text := nullif(p_deck->>'type', '');
  v_format  text;
  v_deck_id uuid;
  v_total   integer;
  v_distinct integer;
  v_complete boolean;
  v_cmdrs   text[];
begin
  select a.format into v_format
  from public.meta_deck_type_allowlist a
  where a.deck_type = v_type;

  -- Unknown type, or a type deliberately excluded. Not an error: it is the common case, and
  -- skipping is the whole point of the allowlist.
  if v_format is null then
    return query select null::uuid, null::text, 0, false, false;
    return;
  end if;

  -- Collapse each board to one row per oracle_id. MTGJSON lists each PRINTING separately, so a
  -- deck running four Forests across two sets arrives as two entries of two. That is one card
  -- played four times, not two different cards, and distinct_cards must reflect that.
  create temp table if not exists _meta_deck_load (
    oracle_id text, card_name text, quantity integer, board text
  ) on commit drop;
  delete from _meta_deck_load;

  insert into _meta_deck_load (oracle_id, card_name, quantity, board)
  select c->'identifiers'->>'scryfallOracleId',
         max(coalesce(nullif(c->>'name',''), c->'identifiers'->>'scryfallOracleId')),
         sum(coalesce(nullif(c->>'count','')::integer, 0)),
         b.board
  from (values ('mainBoard','main'), ('sideBoard','side'), ('commander','commander')) as b(src, board),
       lateral jsonb_array_elements(coalesce(p_deck->b.src, '[]'::jsonb)) as c
  where nullif(c->'identifiers'->>'scryfallOracleId','') is not null
    and coalesce(nullif(c->>'count','')::integer, 0) > 0
  group by c->'identifiers'->>'scryfallOracleId', b.board;

  -- Deck size counts what you start the game with: main board plus commanders. A sideboard is
  -- not part of the 60 and not part of the 100.
  select coalesce(sum(quantity), 0), count(distinct oracle_id)
    into v_total, v_distinct
  from _meta_deck_load where board in ('main','commander');

  v_complete := public.meta_is_complete_deck(v_format, v_total);

  select coalesce(array_agg(oracle_id order by oracle_id), '{}'::text[]) into v_cmdrs
  from _meta_deck_load where board = 'commander';

  insert into public.meta_decks (
    source_id, source_deck_id, name, deck_type, format, set_code, released_at,
    source_url, commander_oracle_ids, total_cards, distinct_cards, is_complete, ingested_at
  ) values (
    'mtgjson', p_file_name, coalesce(nullif(p_deck->>'name',''), p_file_name), v_type, v_format,
    nullif(p_deck->>'code',''), nullif(p_deck->>'releaseDate','')::date,
    nullif(p_deck->>'source',''), v_cmdrs, v_total, v_distinct, v_complete, now()
  )
  on conflict (source_id, source_deck_id) do update set
    name = excluded.name, deck_type = excluded.deck_type, format = excluded.format,
    set_code = excluded.set_code, released_at = excluded.released_at,
    source_url = excluded.source_url, commander_oracle_ids = excluded.commander_oracle_ids,
    total_cards = excluded.total_cards, distinct_cards = excluded.distinct_cards,
    is_complete = excluded.is_complete, ingested_at = now()
  returning id into v_deck_id;

  -- Replace rather than merge: a deck's contents are whatever the source says today.
  delete from public.meta_deck_cards dc where dc.deck_id = v_deck_id;

  insert into public.meta_deck_cards (deck_id, oracle_id, board, quantity, card_name)
  select v_deck_id, oracle_id, board, quantity, card_name from _meta_deck_load;

  return query select v_deck_id, v_format, v_total, v_complete, true;
end;
$fn$;

comment on function public.meta_load_mtgjson_deck(text, jsonb) is
  'Normalises one MTGJSON deck file into meta_decks and meta_deck_cards, or reports ingested=false when the deck type is not an allowlisted decklist. The canonical transform. Collapses printings to oracle_id and excludes the sideboard from deck size.';

revoke all on function public.meta_load_spellbook_page(jsonb, bigint) from public, anon, authenticated;
revoke all on function public.meta_load_mtgjson_deck(text, jsonb) from public, anon, authenticated;
grant execute on function public.meta_load_spellbook_page(jsonb, bigint) to service_role;
grant execute on function public.meta_load_mtgjson_deck(text, jsonb) to service_role;
grant execute on function public.meta_is_complete_deck(text, integer) to anon, authenticated, service_role;;