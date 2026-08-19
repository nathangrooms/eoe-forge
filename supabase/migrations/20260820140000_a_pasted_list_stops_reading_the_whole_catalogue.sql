-- Reading a pasted list stops scanning all 97,140 printings.
--
-- WHAT WAS WRONG
-- --------------
-- `resolve_card_names` was measured at "99 names all matching, 120 ms". That
-- measurement was taken with a payload of NAMES ONLY. Every real export carries
-- a set code and a collector number:
--
--   1 Sol Ring (EOC) 57            Moxfield, Arena, MTGO, Archidekt
--
-- and that is the path the function was slowest on, because `hit_printing`
-- joins `cards` on `lower(set_code)` and `lower(collector_number)`, neither of
-- which had an index that could serve them. `idx_cards_set_code` is on the bare
-- column, so `lower(set_code)` could not use it, and `collector_number` had no
-- index at all.
--
-- Measured on the live catalogue on 20 Aug 2026, a real 95 line Moxfield export
-- of the Modern Horizons 3 Eldrazi Incursion precon:
--
--   EXPLAIN showed  Parallel Seq Scan on cards  (48,570 rows x 2 workers),
--   20,463 buffers, with card_name_key() evaluated per row.
--
--   cold   15,182 ms / 11,200 ms / 9,502 ms
--   warm    3,317 ms, settling to ~170 ms only after repeated calls
--
-- `authenticated` carries `statement_timeout = 8s`, so a player pasting their
-- deck on a cold instance got a statement timeout, not a list. The name-only
-- number was real; it just was not the number that mattered.
--
-- WHAT THIS DOES
-- --------------
-- Three expression indexes, one per lookup the function actually performs.
-- `card_name_key` is already IMMUTABLE, which is what lets it be indexed.
--
-- Measured on the same payload immediately after, same session:
--
--   set code + collector number   11,200 / 9,502 / 3,317 ms  ->  794 / 8 / 8 ms
--   names only                     4,626 /   162 /   100 ms  ->   64 / 8 / 8 ms
--   95 names all misspelt            (trigram path, unchanged)  898 / 132 / 132 ms
--
-- and the plan for a mixed payload dropped from 20,463 buffers to 2,194 with no
-- sequential scan left in it.
--
-- ⚠️ THE TWO ON `cards_unique` ARE ON A MATERIALIZED VIEW. A materialized view
-- drops its indexes when it is recreated, so re-run this file after any
-- migration that rebuilds `cards_unique` (see
-- `cards_unique_tracks_every_column_of_cards`). `public.cards_unique_column_drift()`
-- will not tell you about a missing index, only a missing column.
--
-- On the live database these were created with CREATE INDEX CONCURRENTLY so no
-- write to `cards` was blocked. They are written plainly here because the
-- migration runner wraps a file in a transaction, and CONCURRENTLY cannot run
-- inside one. `if not exists` makes this a no-op on the database that already
-- has them.

create index if not exists cards_printing_lookup_idx
  on public.cards (lower(set_code), lower(collector_number));

comment on index public.cards_printing_lookup_idx is
  'The (set code, collector number) a paste names, the way resolve_card_names compares it.';

create index if not exists cards_unique_name_key_idx
  on public.cards_unique (public.card_name_key(name));

create index if not exists cards_unique_face_key_idx
  on public.cards_unique (public.card_name_key(split_part(name, ' // ', 1)));

-- ------------------------------------------------------------- the near match
--
-- A SECOND BUG, FOUND BY PASTING A TYPO
-- -------------------------------------
-- `Lightnig Bolt` resolved to a card whose id is the literal text
-- `lightning-bolt-lea`, not a Scryfall id, and whose printing count is 1. There
-- are five such rows in `cards` (`black-lotus`, `counterspell-lea`,
-- `force-of-will`, `lightning-bolt-lea`, `tarmogoyf`) left over from seeding.
-- Each carries its own invented `oracle_id`, so each is a separate card to
-- `cards_unique`, and each is a perfect trigram twin of the real card.
--
-- The lateral already ordered by `edhrec_rank nulls last`, which puts the real
-- printing first, and then the window function threw that away:
--
--     row_number() over (partition by u.idx order by s.sim desc, s.name)
--
-- Two rows both named "Lightning Bolt" with identical similarity tie on `name`,
-- so which one a player was offered was arbitrary. Accepting the wrong one puts
-- a card id on the proxy list that nothing else in the product can resolve.
--
-- The rank is carried out of the lateral and into the window so the ordering the
-- lateral chose is the ordering the reader sees.
--
-- That alone is not enough for Lightning Bolt, because the row `cards_unique`
-- picks for the real card is the `msc` printing, and `edhrec_rank` and
-- `released_at` are NULL on it -- the same 59% NULL gap the sync left behind
-- and that the previous session recorded. Both candidates therefore tie on
-- every column the ordering had. So the tie now breaks on HOW MANY PRINTINGS
-- the card has, which is the question the reader is really asking: 54 printings
-- of Lightning Bolt is the card people mean, one printing with an invented id
-- is not. It costs at most three indexed counts per unmatched line, after the
-- trigram search has already cut the field to three, and `idx_cards_oracle_id`
-- serves them.
--
-- The five seed rows are NOT deleted here. One of them is referenced by a real
-- `deck_cards` row, so removing them would break a user's deck. They are
-- reported instead:
--
--   select id, name, set_code, oracle_id from public.cards
--   where id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-';
--
--   black-lotus / counterspell-lea / force-of-will / lightning-bolt-lea /
--   tarmogoyf, each with a hand-made oracle_id, so each is a separate card to
--   `cards_unique` and a perfect trigram twin of the real one.

create or replace function public.resolve_card_names(p_lines jsonb)
returns table (
  idx integer,
  query text,
  status text,
  card jsonb,
  printings integer,
  suggestions jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
with req as (
  select
    (t.ord - 1)::int as idx,
    btrim(coalesce(t.line ->> 'name', '')) as q,
    lower(nullif(btrim(coalesce(t.line ->> 'set', '')), '')) as set_code,
    lower(nullif(btrim(coalesce(t.line ->> 'cn', '')), '')) as cn
  from jsonb_array_elements(
         case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end
       ) with ordinality as t(line, ord)
),
asked as (
  select
    idx, q, set_code, cn,
    card_name_key(q) as qkey,
    card_name_key(split_part(q, ' // ', 1)) as qfront
  from req
  where q <> ''
),
hit_printing as (
  select distinct on (a.idx) a.idx, c.id, 'printing'::text as status
  from asked a
  join cards c
    on lower(c.set_code) = a.set_code
   and lower(c.collector_number) = a.cn
   and (card_name_key(c.name) = a.qkey
        or card_name_key(split_part(c.name, ' // ', 1)) = a.qfront)
  where a.set_code is not null and a.cn is not null
  order by a.idx, c.id
),
hit_name as (
  select distinct on (a.idx) a.idx, u.id, 'exact'::text as status
  from asked a
  join cards_unique u on card_name_key(u.name) = a.qkey
  where a.idx not in (select idx from hit_printing)
  order by a.idx, u.edhrec_rank nulls last, u.released_at, u.id
),
hit_face as (
  select distinct on (a.idx) a.idx, u.id, 'face'::text as status
  from asked a
  join cards_unique u on card_name_key(split_part(u.name, ' // ', 1)) = a.qfront
  where a.idx not in (select idx from hit_printing)
    and a.idx not in (select idx from hit_name)
  order by a.idx, u.edhrec_rank nulls last, u.released_at, u.id
),
matched as (
  select idx, id, status from hit_printing
  union all select idx, id, status from hit_name
  union all select idx, id, status from hit_face
),
unmatched as (
  select a.* from asked a where a.idx not in (select idx from matched)
),
near_candidates as (
  select u.idx, s.id, s.name, s.oracle_id, s.edhrec_rank, s.sim
  from unmatched u
  cross join lateral (
    select c.id, c.name, c.oracle_id, c.edhrec_rank, similarity(c.name, u.q) as sim
    from cards_unique c
    where c.name % u.q
    order by similarity(c.name, u.q) desc, c.edhrec_rank nulls last
    limit 3
  ) s
),
near as (
  select n.idx, n.id, n.name, n.sim,
         row_number() over (
           partition by n.idx
           order by n.sim desc, n.edhrec_rank nulls last, pc.n desc nulls last, n.name, n.id
         ) as rank
  from near_candidates n
  left join lateral (
    select count(*)::int as n from cards x where x.oracle_id = n.oracle_id
  ) pc on true
),
resolved as (
  select idx, id, status from matched
  union all
  select idx, id, 'near'::text from near where rank = 1
)
select
  a.idx,
  a.q as query,
  coalesce(r.status, 'none') as status,
  case when c.id is null then null else jsonb_build_object(
    'id', c.id,
    'oracle_id', c.oracle_id,
    'name', c.name,
    'set_code', c.set_code,
    'set_name', c.set_name,
    'collector_number', c.collector_number,
    'released_at', c.released_at,
    'artist', c.artist,
    'rarity', c.rarity,
    'layout', c.layout,
    'type_line', c.type_line,
    'mana_cost', c.mana_cost,
    'cmc', c.cmc,
    'colors', c.colors,
    'color_identity', c.color_identity,
    'image_uris', c.image_uris,
    'faces', c.faces,
    'prices', c.prices,
    'finishes', c.finishes
  ) end as card,
  coalesce(pc.n, 0) as printings,
  coalesce(sg.items, '[]'::jsonb) as suggestions
from asked a
left join resolved r on r.idx = a.idx
left join cards c on c.id = r.id
left join lateral (
  select count(*)::int as n from cards x where x.oracle_id = c.oracle_id
) pc on c.oracle_id is not null
left join lateral (
  select jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'score', round(n.sim::numeric, 3))
                   order by n.rank) as items
  from near n where n.idx = a.idx
) sg on true
order by a.idx
$$;

comment on function public.resolve_card_names(jsonb) is
  'Resolve a whole pasted list of card names to printings in one query. Every line comes back, including the ones that matched nothing.';

revoke all on function public.resolve_card_names(jsonb) from anon, public;
grant execute on function public.resolve_card_names(jsonb) to authenticated;
