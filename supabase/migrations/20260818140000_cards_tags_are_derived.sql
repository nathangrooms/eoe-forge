-- ============================================================================
-- `cards.tags` is derived, and the database enforces that.
--
-- The previous trigger recomputed tags when a classifier input changed and
-- otherwise left whatever the writer supplied. That is a hole: the deployed
-- scryfall-sync still sends the OLD five-rule tag guess with every upsert, so a
-- routine price refresh — which changes no classifier input — would quietly
-- overwrite a card's real roles with `['artifact']` again. Correct data would
-- decay on the next sync, silently, and nothing would report it.
--
-- The fix does not cost a reclassification. If nothing the classifier reads has
-- changed, the previously derived value is still the right answer, so the
-- trigger simply restores it and ignores what the writer sent. Tags therefore
-- cannot be set by hand from any client, which is what "derived" should mean.
--
-- The retag functions are the one legitimate writer of `tags` without an input
-- change, and they say so by setting `deckmatrix.retag` for their transaction.
--
-- ORDERING HAZARD — do not apply this while a bulk retag tick is in flight.
-- A transaction that started before this migration keeps its cached plan for
-- the OLD retag_cards_batch, which does not set `deckmatrix.retag`, but would
-- fire the NEW trigger, which reverts tag writes without it. That tick's rows
-- would be silently left unclassified while `card_retag_progress.last_id`
-- advanced past them. Check first:
--   select done from public.card_retag_progress;
--   select status from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'deckmatrix-retag-cards');
-- ============================================================================

create or replace function public.cards_apply_role_tags()
returns trigger
language plpgsql
as $trg$
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
    new.tags := public.derive_card_tags(
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
$trg$;

-- The two functions allowed to write tags directly announce themselves for the
-- duration of their transaction. set_config(..., is_local => true) means the
-- flag cannot leak into a pooled connection's next transaction.
create or replace function public.retag_cards_batch(
  p_limit integer default 2000,
  p_after text default ''
) returns table(scanned integer, changed integer, last_id text, remaining boolean)
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
           public.derive_card_tags(p.name, p.type_line, p.oracle_text, p.keywords, p.mana_cost, p.cmc, p.faces) as new_tags
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

create or replace function public.retag_cards(p_ids text[])
returns integer
language plpgsql
as $fn$
declare v_changed integer := 0;
begin
  perform set_config('deckmatrix.retag', 'on', true);

  with computed as (
    select c.id,
           public.derive_card_tags(c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces) as new_tags
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
