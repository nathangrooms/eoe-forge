-- The four "where the knowledge comes from" numbers, cheaply.
--
-- The admin engine screen asked PostgREST for `count=exact` on `cards` and on
-- two filtered reads of `cards_unique`. All three returned 500, so the screen
-- drew a dash where a number belongs and had done since it shipped. Nobody
-- noticed, because a dash looks like "not loaded yet".
--
--   select count(*) from public.cards          37,284 ms, Heap Fetches 47,348
--
-- against the 3 s the authenticator role carries. An exact count of a
-- 98,000-row, 255 MB table carrying 28 indexes is not something a dashboard may
-- ask for, and no amount of index will change that: COUNT has to visit
-- everything.
--
-- The three that CAN be exact are read from `cards_pool`, the same 33,032 cards
-- in 13 MB, measured at 73 ms for all three. The one that cannot is the
-- planner's own `reltuples`, and the screen prints "about" over it rather than
-- passing an estimate off as a count.

create or replace function public.engine_sources()
returns table (
  printings_estimate bigint,
  cards              bigint,
  ranked             bigint,
  tagged             bigint,
  last_sync          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select greatest(c.reltuples, 0)::bigint
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'cards'),
    (select count(*)::bigint from public.cards_pool),
    (select count(*)::bigint from public.cards_pool where edhrec_rank is not null),
    (select count(*)::bigint from public.cards_pool where tags is not null and tags <> '{}'),
    (select max(last_sync) from public.sync_status);
$$;

comment on function public.engine_sources() is
  'Catalogue counts for the admin engine screen. printings_estimate is the planner''s reltuples, NOT a count: counting public.cards exactly measured 37 s against a 3 s statement_timeout. The other three are exact, read from cards_pool.';

grant execute on function public.engine_sources() to anon, authenticated, service_role;
