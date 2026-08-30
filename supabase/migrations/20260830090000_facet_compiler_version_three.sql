-- ============================================================================
-- The facet compiler is on version 3. Move both readers to it. 30 Aug 2026.
--
-- Four rules changed the compiler's OUTPUT for cards it already read, which is
-- exactly the case `COMPILER_VERSION` exists for:
--
--   conditional mana     Command Tower (rank 2), Arcane Signet (3),
--                        Exotic Orchard (9), Fellwar Stone (17),
--                        Reflecting Pool (173), Mox Amber (205)
--   scry and surveil     a DSL member and a renderer case with no rule to
--                        produce either, so `Scry 2.` compiled to nothing
--   subject ellipsis     the second half of "A does X and does Y" inherits A,
--                        which is Night's Whisper (182) and Sign in Blood (232)
--   search for up to N   Cultivate-shaped clauses said with a flag rather than
--                        refused whole
--   cost facets          what an ability COSTS, not only what it costs in mana.
--                        Every sacrifice outlet in the format was invisible:
--                        Ashnod's Altar (rank 134) read as a mana rock and
--                        Viscera Seer (255) read as "scries", both rec:full, so
--                        the absent facet was a positive NO and even the tag
--                        fallback could not rescue them
--
-- Measured with `scripts/compiler-gap-probe.ts`: the share of the hundred most
-- played Commander cards producing NO ability record fell from 26.3% to 23.2%.
--
-- THE VERSION IS PINNED IN THREE PLACES AND THEY MOVE TOGETHER. A reader on one
-- version and a writer on another is SILENT: every card reads as having no
-- facets, which the ranker cannot tell apart from a card that genuinely does
-- nothing. The writer (`facet-memo-fill`) is already deployed on 2 and all
-- 33,032 rows are filled, so both readers below are moving to data that exists.
-- Doing it in that order is why there is no window where facets are missing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reader one: the computed column PostgREST exposes on `cards_unique`.
--
-- SECURITY DEFINER because a computed column runs as the CALLER and
-- `card_facet_memo` is service-role only; without it every generate returned
-- `42501 permission denied`. `search_path` is pinned, which the security
-- advisor checks by name.
-- ---------------------------------------------------------------------------
create or replace function public.facets(public.cards_unique)
returns text[]
language sql
stable
parallel safe
security definer
set search_path = public, pg_temp
as $$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = $1.oracle_id
    and m.compiler_version = 3
$$;

grant execute on function public.facets(public.cards_unique) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reader two: the narrow pool the generator actually walks.
--
-- A materialized view cannot be replaced in place, so this is a drop and a
-- rebuild, and every index has to come back with it. They are not decoration:
-- `cards_pool_identity_rank_id_idx` is what lets a pool filtered by colour be
-- WALKED in popularity order instead of sorted, and without it the pool query
-- went from 25 ms to 13.7 s against a 3 s statement_timeout.
--
-- `cards_pool` is nine ranking columns plus the precompiled facets, 13 MB
-- against `cards_unique`'s 77 MB. The width is the point: one fat row is one
-- heap block, so scanning 7,495 mono-red candidates on the wide view touched
-- 6,441 blocks to use a fraction of each.
-- ---------------------------------------------------------------------------
drop materialized view if exists public.cards_pool;

create materialized view public.cards_pool as
select
  c.id,
  c.oracle_id,
  c.name,
  c.type_line,
  c.cmc,
  c.color_identity,
  c.tags,
  c.mana_cost,
  c.edhrec_rank,
  c.prices ->> 'usd'      as usd,
  c.legalities ->> 'commander' as commander_legal,
  m.facets
from public.cards_unique c
left join public.card_facet_memo m
       on m.oracle_id = c.oracle_id
      and m.compiler_version = 3;

-- UNIQUE, and required: REFRESH MATERIALIZED VIEW CONCURRENTLY refuses without
-- one, and a non-concurrent refresh takes an ACCESS EXCLUSIVE lock that blocks
-- every read of the pool while it runs.
create unique index cards_pool_id_idx on public.cards_pool (id);

create index cards_pool_identity_idx
  on public.cards_pool using gin (color_identity)
  where commander_legal = 'legal';

create index cards_pool_identity_rank_id_idx
  on public.cards_pool (color_identity, edhrec_rank, id)
  where commander_legal = 'legal';

create index cards_pool_rank_idx
  on public.cards_pool (edhrec_rank, id)
  where commander_legal = 'legal' and edhrec_rank is not null;

grant select on public.cards_pool to anon, authenticated, service_role;

-- A materialized view has no visibility map until it is vacuumed, so every
-- index-only scan against a freshly built one falls back to the heap. The
-- scheduled `cards-pool-vacuum` handles this daily; doing it once here means
-- the first generate after this migration is not the slow one.
analyze public.cards_pool;
