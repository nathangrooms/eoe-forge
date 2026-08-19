-- Tagging is what makes tripling the catalogue expensive, and almost all of the
-- extra work is the same answer computed again.
--
-- Measured 2026-08-19 on the live table:
--   select derive_card_tags(...) from cards limit 2000  ->  62.6 s
--   = 31.3 ms per card, and the whole-catalogue retag on 2026-08-18 took
--   30.5 minutes for 34,088 rows (card_retag_progress.started_at/updated_at).
--
-- The BEFORE INSERT trigger runs it once per row written, so 96,732 printings
-- would be roughly 50 minutes of database CPU inside the sync's own upserts.
--
-- But tags derive from name / type_line / oracle_text / keywords / mana_cost /
-- cmc / faces, and different printings of the same card almost always agree on
-- every one of those. Measured on the live table: of 995 oracle_ids with more
-- than one printing (2,046 rows), only 41 differ on those inputs at all. So the
-- number of DISTINCT tag computations barely grows when the row count triples.
--
-- derive_card_tags is declared IMMUTABLE (pg_proc.provolatile = 'i'), which is
-- exactly the licence to cache it. Key on the inputs themselves rather than on
-- oracle_id, so the 41 cards whose printings genuinely differ still each get
-- their own answer.
--
-- Measured afterwards, same 2,000-card query: 796 ms, or 0.40 ms per card on a
-- cache hit against 31.3 ms computing from scratch.
--
-- Nothing here is SECURITY DEFINER, matching the functions it replaces. Only
-- postgres and service_role can write `cards` (its RLS carries a SELECT policy
-- and nothing else), so the trigger only ever runs under a role that can also
-- write the cache.

create table if not exists public.card_tag_memo (
  input_hash text primary key,
  tags       text[] not null,
  created_at timestamptz not null default now()
);

comment on table public.card_tag_memo is
  'Cache of public.derive_card_tags keyed on a hash of its arguments. Safe only because derive_card_tags is IMMUTABLE. IF THE TAG RULES CHANGE THIS MUST BE EMPTIED, otherwise the old classification is handed back. retag_all_cards(p_restart => true) empties it, which is the supported path.';

alter table public.card_tag_memo enable row level security;
-- No policy, and no grants: this is derived internal state with no user-facing
-- reason to be readable. `cards.tags` stays the public surface.
revoke all on public.card_tag_memo from anon, authenticated;

create or replace function public.card_tag_input_hash(
  p_name text, p_type_line text, p_oracle_text text,
  p_keywords text[], p_mana_cost text, p_cmc numeric, p_faces jsonb
) returns text
language sql
immutable
as $fn$
  -- Unit separator between fields so no two different field splits can produce
  -- the same string. jsonb renders canonically, so faces hashes stably.
  select md5(
    coalesce(p_name, '')        || e'\x1f' ||
    coalesce(p_type_line, '')   || e'\x1f' ||
    coalesce(p_oracle_text, '') || e'\x1f' ||
    coalesce(p_keywords::text, '') || e'\x1f' ||
    coalesce(p_mana_cost, '')   || e'\x1f' ||
    coalesce(p_cmc::text, '')   || e'\x1f' ||
    coalesce(p_faces::text, '')
  );
$fn$;

create or replace function public.derive_card_tags_memo(
  p_name text, p_type_line text, p_oracle_text text,
  p_keywords text[], p_mana_cost text, p_cmc numeric, p_faces jsonb
) returns text[]
language plpgsql
as $fn$
declare
  v_hash text := public.card_tag_input_hash(
    p_name, p_type_line, p_oracle_text, p_keywords, p_mana_cost, p_cmc, p_faces);
  v_tags text[];
begin
  select m.tags into v_tags from public.card_tag_memo m where m.input_hash = v_hash;
  if found then
    return v_tags;
  end if;

  v_tags := public.derive_card_tags(
    p_name, p_type_line, p_oracle_text, p_keywords, p_mana_cost, p_cmc, p_faces);

  -- on conflict do nothing: two concurrent sync batches can race to compute the
  -- same card. Both answers are identical, so whichever lands first wins and
  -- the loser is not an error.
  insert into public.card_tag_memo (input_hash, tags)
  values (v_hash, v_tags)
  on conflict (input_hash) do nothing;

  return v_tags;
end;
$fn$;

revoke all on function public.derive_card_tags_memo(text, text, text, text[], text, numeric, jsonb)
  from public, anon, authenticated;

-- The trigger and the two retag paths now go through the cache. Nothing about
-- WHAT they compute changes: on a miss this is derive_card_tags verbatim.
create or replace function public.cards_apply_role_tags()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'INSERT'
     or new.tags is null
     or new.name        is distinct from old.name
     or new.type_line   is distinct from old.type_line
     or new.oracle_text is distinct from old.oracle_text
     or new.keywords    is distinct from old.keywords
     or new.mana_cost   is distinct from old.mana_cost
     or new.cmc         is distinct from old.cmc
     or new.faces       is distinct from old.faces
  then
    new.tags := public.derive_card_tags_memo(
      new.name, new.type_line, new.oracle_text, new.keywords, new.mana_cost, new.cmc, new.faces
    );

  elsif new.tags is distinct from old.tags
        and coalesce(current_setting('deckmatrix.retag', true), '') <> 'on'
  then
    -- A writer changed tags without changing anything tags are derived from.
    -- Nothing it could know makes it right, so keep the derived value. Free:
    -- no reclassification, just a copy.
    new.tags := old.tags;
  end if;

  return new;
end;
$fn$;

create or replace function public.retag_cards(p_ids text[])
returns integer
language plpgsql
as $fn$
declare v_changed integer := 0;
begin
  perform set_config('deckmatrix.retag', 'on', true);

  with computed as (
    select c.id,
           public.derive_card_tags_memo(c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces) as new_tags
    from public.cards c
    where c.id = any(p_ids)
  ), written as (
    update public.cards c
       set tags = k.new_tags
      from computed k
     where c.id = k.id
       and c.tags is distinct from k.new_tags
    returning c.id
  )
  select count(*) into v_changed from written;
  return v_changed;
end;
$fn$;

create or replace function public.retag_cards_batch(
  p_limit integer default 2000,
  p_after text default ''::text
)
returns table (scanned integer, changed integer, last_id text, remaining boolean)
language plpgsql
as $fn$
declare
  v_scanned integer := 0;
  v_changed integer := 0;
  v_last    text := p_after;
begin
  perform set_config('deckmatrix.retag', 'on', true);

  with page as (
    select c.id, c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces, c.tags
    from public.cards c
    where c.id > p_after
    order by c.id
    limit p_limit
  ), computed as (
    select p.id,
           public.derive_card_tags_memo(p.name, p.type_line, p.oracle_text, p.keywords, p.mana_cost, p.cmc, p.faces) as new_tags
    from page p
  ), written as (
    update public.cards c
       set tags = k.new_tags
      from computed k
     where c.id = k.id
       and c.tags is distinct from k.new_tags
    returning c.id
  )
  select (select count(*) from page), (select count(*) from written), (select max(id) from page)
    into v_scanned, v_changed, v_last;

  return query select v_scanned, v_changed, coalesce(v_last, p_after), v_scanned = p_limit;
end;
$fn$;

-- The one documented way to reclassify after a TAG_RULES change. It now empties
-- the cache first, because a restart that kept the cache would hand every card
-- back the classification the change was meant to replace.
create or replace function public.retag_all_cards(
  p_budget_seconds integer default 100,
  p_page integer default 500,
  p_restart boolean default false
) returns public.card_retag_progress
language plpgsql
as $fn$
declare
  v_deadline timestamptz := clock_timestamp() + make_interval(secs => p_budget_seconds);
  v_state    public.card_retag_progress;
  r          record;
begin
  insert into public.card_retag_progress (id) values (true) on conflict (id) do nothing;

  if p_restart then
    -- Cache first. Emptying it after the cursor reset would let the first batch
    -- repopulate it from the stale answers it is trying to discard.
    delete from public.card_tag_memo;

    update public.card_retag_progress
       set last_id = '', scanned = 0, changed = 0, done = false,
           started_at = now(), updated_at = now()
     where id;
  end if;

  select * into v_state from public.card_retag_progress where id;
  if v_state.done then
    return v_state;
  end if;

  loop
    select * into r from public.retag_cards_batch(p_page, v_state.last_id);

    v_state.scanned := v_state.scanned + r.scanned;
    v_state.changed := v_state.changed + r.changed;
    v_state.last_id := r.last_id;
    v_state.done    := not r.remaining;

    update public.card_retag_progress
       set last_id = v_state.last_id,
           scanned = v_state.scanned,
           changed = v_state.changed,
           done    = v_state.done,
           updated_at = now()
     where id;

    exit when v_state.done or clock_timestamp() > v_deadline;
  end loop;

  if v_state.done then
    begin
      perform cron.unschedule('deckmatrix-retag-cards');
    exception when others then
      null;
    end;
  end if;

  return v_state;
end;
$fn$;

-- Seeded from the classification already stored on `cards`. Two checks first:
-- a 400-row sample confirmed cards.tags still matches derive_card_tags exactly
-- (0 mismatches), and no input hash mapped to two different tag arrays across
-- 33,078 distinct inputs. Without both, this would cache a stale answer.
insert into public.card_tag_memo (input_hash, tags)
select distinct on (h) h, tags from (
  select public.card_tag_input_hash(name, type_line, oracle_text, keywords, mana_cost, cmc, faces) as h, tags
  from public.cards where tags is not null
) x order by h
on conflict (input_hash) do nothing;
