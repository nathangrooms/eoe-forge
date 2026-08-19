-- Derived aggregates over ingested decks. Real counts only.
--
-- The single most dangerous output this project could produce is an inclusion rate computed
-- from a handful of decks and rendered as an authoritative percentage. Every function here is
-- built so that cannot happen: scopes below the sample threshold produce NO ROW AT ALL, rather
-- than a row with a caveat attached that a caller is free to ignore.

create or replace function public.meta_min_scope_decks()
returns integer language sql immutable
as $$ select 30 $$;

comment on function public.meta_min_scope_decks() is
  'Minimum decks in a scope before an inclusion rate may be stored for it. 30 is the floor at which a proportion starts to mean anything; 100+ is where it becomes confident. Scopes below this are omitted entirely. Raising this number is always safe. Lowering it is a decision about honesty, not about tuning.';

create or replace function public.meta_min_pair_decks()
returns integer language sql immutable
as $$ select 3 $$;

comment on function public.meta_min_pair_decks() is
  'Minimum decks a card pair must co-occur in before the pair is stored. A pair seen together in one or two decks is a coincidence, and storing every such pair would also produce tens of millions of meaningless rows.';

create or replace function public.meta_refresh_inclusion()
returns table (scope_kind text, scopes integer, rows_written integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_min integer := public.meta_min_scope_decks();
begin
  delete from public.meta_card_inclusion;

  -- Scope 1: whole format. Denominator is every complete deck of that format.
  with scope_totals as (
    select d.format as k, count(*)::int as n
    from public.meta_decks d
    where d.is_complete
    group by d.format
    having count(*) >= v_min
  ),
  hits as (
    select d.format as k, dc.oracle_id,
           count(distinct d.id)::int as containing,
           avg(dc.quantity)::numeric as avg_qty
    from public.meta_decks d
    join public.meta_deck_cards dc on dc.deck_id = d.id
    where d.is_complete
      and dc.board in ('main', 'commander')
      and d.format in (select k from scope_totals)
    group by d.format, dc.oracle_id
  )
  insert into public.meta_card_inclusion
    (scope_kind, scope_key, oracle_id, decks_containing, decks_in_scope, inclusion_rate, avg_quantity)
  select 'format', h.k, h.oracle_id, h.containing, s.n,
         round(h.containing::numeric / s.n, 6), round(h.avg_qty, 3)
  from hits h join scope_totals s on s.k = h.k;

  -- Scope 2: per commander. Denominator is every complete commander deck led by that commander.
  -- With a precon-only corpus this yields nothing, because each commander leads about one deck.
  -- That is the correct answer, not a failure, and it is why the threshold exists.
  with scope_totals as (
    select cmd.oracle_id as k, count(distinct d.id)::int as n
    from public.meta_decks d
    cross join lateral unnest(d.commander_oracle_ids) as cmd(oracle_id)
    where d.is_complete and d.format = 'commander'
    group by cmd.oracle_id
    having count(distinct d.id) >= v_min
  ),
  hits as (
    select cmd.oracle_id as k, dc.oracle_id as card,
           count(distinct d.id)::int as containing,
           avg(dc.quantity)::numeric as avg_qty
    from public.meta_decks d
    cross join lateral unnest(d.commander_oracle_ids) as cmd(oracle_id)
    join public.meta_deck_cards dc on dc.deck_id = d.id
    where d.is_complete and d.format = 'commander'
      and dc.board in ('main', 'commander')
      and cmd.oracle_id in (select k from scope_totals)
    group by cmd.oracle_id, dc.oracle_id
  )
  insert into public.meta_card_inclusion
    (scope_kind, scope_key, oracle_id, decks_containing, decks_in_scope, inclusion_rate, avg_quantity)
  select 'commander', h.k, h.card, h.containing, s.n,
         round(h.containing::numeric / s.n, 6), round(h.avg_qty, 3)
  from hits h join scope_totals s on s.k = h.k;

  return query
    select i.scope_kind, count(distinct i.scope_key)::int, count(*)::int
    from public.meta_card_inclusion i
    group by i.scope_kind;
end;
$fn$;

comment on function public.meta_refresh_inclusion() is
  'Recomputes public.meta_card_inclusion from scratch over complete ingested decks. Counts are exact: decks_containing is a count of distinct decks, decks_in_scope is a count of distinct decks. Nothing is inferred, weighted or smoothed.';

create or replace function public.meta_refresh_pairs()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_min      integer := public.meta_min_scope_decks();
  v_min_pair integer := public.meta_min_pair_decks();
  v_rows     integer;
begin
  delete from public.meta_card_pairs;

  with scope_totals as (
    select d.format as k, count(*)::int as n
    from public.meta_decks d
    where d.is_complete
    group by d.format
    having count(*) >= v_min
  ),
  deck_cards as (
    select d.id as deck_id, d.format as k, dc.oracle_id
    from public.meta_decks d
    join public.meta_deck_cards dc on dc.deck_id = d.id
    where d.is_complete
      and dc.board in ('main', 'commander')
      and d.format in (select k from scope_totals)
  ),
  singles as (
    select k, oracle_id, count(distinct deck_id)::int as n_card
    from deck_cards group by k, oracle_id
  ),
  pairs as (
    select a.k, a.oracle_id as a_id, b.oracle_id as b_id,
           count(distinct a.deck_id)::int as both
    from deck_cards a
    join deck_cards b on b.deck_id = a.deck_id and b.k = a.k and b.oracle_id > a.oracle_id
    group by a.k, a.oracle_id, b.oracle_id
    having count(distinct a.deck_id) >= v_min_pair
  )
  insert into public.meta_card_pairs
    (scope_kind, scope_key, oracle_id_a, oracle_id_b,
     decks_containing_both, decks_containing_a, decks_containing_b, decks_in_scope, lift)
  select 'format', p.k, p.a_id, p.b_id, p.both, sa.n_card, sb.n_card, s.n,
         round((p.both::numeric * s.n) / nullif(sa.n_card::numeric * sb.n_card, 0), 4)
  from pairs p
  join scope_totals s on s.k = p.k
  join singles sa on sa.k = p.k and sa.oracle_id = p.a_id
  join singles sb on sb.k = p.k and sb.oracle_id = p.b_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

comment on function public.meta_refresh_pairs() is
  'Recomputes public.meta_card_pairs. lift = (both * N) / (count_a * count_b), which is observed co-occurrence over what statistical independence would predict. The four raw counts are stored alongside so the figure can be checked by hand.';

create or replace function public.meta_inclusion_for_card(p_oracle_id text)
returns table (
  scope_kind text, scope_key text, decks_containing integer,
  decks_in_scope integer, inclusion_rate numeric
)
language sql stable
set search_path = public
as $$
  select i.scope_kind, i.scope_key, i.decks_containing, i.decks_in_scope, i.inclusion_rate
  from public.meta_card_inclusion i
  where i.oracle_id = p_oracle_id
  order by i.decks_in_scope desc;
$$;

create or replace function public.meta_partners_for_card(p_oracle_id text, p_limit integer default 20)
returns table (
  partner_oracle_id text, scope_key text, decks_together integer,
  decks_in_scope integer, lift numeric
)
language sql stable
set search_path = public
as $$
  select case when p.oracle_id_a = p_oracle_id then p.oracle_id_b else p.oracle_id_a end,
         p.scope_key, p.decks_containing_both, p.decks_in_scope, p.lift
  from public.meta_card_pairs p
  where p.oracle_id_a = p_oracle_id or p.oracle_id_b = p_oracle_id
  order by p.decks_containing_both desc, p.lift desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

comment on function public.meta_partners_for_card(text, integer) is
  'Cards actually played alongside this one in ingested decks, with the deck count that supports each. Returns nothing when there is no evidence, which is the honest result and must be rendered as an absent section rather than an empty state implying zero.';

create or replace function public.meta_combos_for_card(p_oracle_id text, p_limit integer default 20)
returns table (
  combo_id text, identity text, produces text[], popularity integer,
  bracket_tag text, piece_count integer
)
language sql stable
set search_path = public
as $$
  select c.id, c.identity, c.produces, c.popularity, c.bracket_tag, c.card_count
  from public.meta_combos c
  join public.meta_combo_cards cc on cc.combo_id = c.id
  where cc.oracle_id = p_oracle_id and c.status = 'OK' and not c.spoiler
  order by c.popularity desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.meta_begin_ingest(p_source text, p_restart boolean default false)
returns table (run_id bigint, resume_cursor text, processed integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_run    bigint;
  v_cursor text;
  v_proc   integer;
begin
  select r.cursor, r.processed, r.run_id into v_cursor, v_proc, v_run
  from public.meta_ingest_runs r where r.source_id = p_source for update;

  if not found then
    raise exception 'unknown meta source %', p_source;
  end if;

  -- Restart, or a run that had already finished, both begin a fresh sweep.
  if p_restart or v_cursor is null then
    v_run := v_run + 1;
    v_cursor := null;
    v_proc := 0;
  end if;

  update public.meta_ingest_runs r
     set status = 'running', run_id = v_run, cursor = v_cursor, processed = v_proc,
         started_at = case when v_proc = 0 then now() else r.started_at end,
         finished_at = null, error_message = null
   where r.source_id = p_source;

  return query select v_run, v_cursor, v_proc;
end;
$fn$;

create or replace function public.meta_checkpoint_ingest(p_source text, p_cursor text, p_processed integer, p_total integer default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.meta_ingest_runs
     set status = 'running', cursor = p_cursor, processed = p_processed,
         total = coalesce(p_total, total)
   where source_id = p_source;
$$;

comment on function public.meta_checkpoint_ingest(text, text, integer, integer) is
  'Mid-run save point. Only ever called while more work remains. Finishing goes through meta_finish_ingest so the cursor cannot survive completion.';

create or replace function public.meta_finish_ingest(p_source text, p_prune_run boolean default false)
returns table (final_status text, cursor_after text, processed integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_run bigint;
begin
  select r.run_id into v_run from public.meta_ingest_runs r where r.source_id = p_source;

  -- Rows the completed sweep did not touch no longer exist upstream. Only safe on a full
  -- sweep, which is why the caller must ask for it explicitly.
  if p_prune_run then
    delete from public.meta_combos c
     where c.source_id = p_source
       and (c.last_seen_run is distinct from v_run);
  end if;

  -- The completion path. status leaves 'running', and the BEFORE trigger on the table nulls
  -- the cursor as a consequence, so no future edit can complete a run and forget to clear it.
  update public.meta_ingest_runs r
     set status = 'done', processed = r.processed, finished_at = now(), error_message = null
   where r.source_id = p_source;

  update public.meta_sources s set last_ingest_at = now() where s.id = p_source;

  return query
    select r.status, r.cursor, r.processed
    from public.meta_ingest_runs r where r.source_id = p_source;
end;
$fn$;

comment on function public.meta_finish_ingest(text, boolean) is
  'THE COMPLETION PATH. Clears the resume cursor by moving status out of running, which the table trigger enforces. This exists as one call because the alternative, remembering to null a cursor in application code, is exactly what froze the Scryfall card sync for months.';

create or replace function public.meta_fail_ingest(p_source text, p_error text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.meta_ingest_runs
     set status = 'error', error_message = left(coalesce(p_error, 'unknown'), 2000)
   where source_id = p_source;
$$;

revoke all on function public.meta_refresh_inclusion() from public, anon, authenticated;
revoke all on function public.meta_refresh_pairs() from public, anon, authenticated;
revoke all on function public.meta_begin_ingest(text, boolean) from public, anon, authenticated;
revoke all on function public.meta_checkpoint_ingest(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.meta_finish_ingest(text, boolean) from public, anon, authenticated;
revoke all on function public.meta_fail_ingest(text, text) from public, anon, authenticated;

grant execute on function public.meta_refresh_inclusion() to service_role;
grant execute on function public.meta_refresh_pairs() to service_role;
grant execute on function public.meta_begin_ingest(text, boolean) to service_role;
grant execute on function public.meta_checkpoint_ingest(text, text, integer, integer) to service_role;
grant execute on function public.meta_finish_ingest(text, boolean) to service_role;
grant execute on function public.meta_fail_ingest(text, text) to service_role;

grant execute on function public.meta_inclusion_for_card(text) to anon, authenticated, service_role;
grant execute on function public.meta_partners_for_card(text, integer) to anon, authenticated, service_role;
grant execute on function public.meta_combos_for_card(text, integer) to anon, authenticated, service_role;
grant execute on function public.meta_min_scope_decks() to anon, authenticated, service_role;
grant execute on function public.meta_min_pair_decks() to anon, authenticated, service_role;;