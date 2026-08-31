-- The facet memo moves to COMPILER_VERSION 8, and the readers follow it.
--
-- WRITTEN AFTER THE FACT, from the live definitions, on 31 Aug 2026. The move
-- from 7 to 8 was applied with `execute_sql` and left NO FILE, which is the
-- failure CLAUDE.md describes as "a file with no recorded version", in its
-- other direction: a change with no file at all. The three objects below were
-- read out of the database with `pg_get_functiondef` and `pg_get_viewdef` and
-- transcribed, so this file states what is actually running rather than what
-- somebody remembers doing.
--
-- WHY 8. Version 7 was pinned when the compiler learned conditional mana, scry
-- and surveil, subject ellipsis and "search for up to N". Version 8 is the
-- rules written after it: the `cost:` split that tells a sacrifice OUTLET from
-- a spell that eats itself, `eff:exile-graveyard` split out of `eff:exile` so
-- graveyard hate stops reading as removal, `eff:extra-land-drop` for
-- Exploration and Azusa, and the recursion and split-destination search rules.
--
-- THE ORDER IS NOT NEGOTIABLE. Bump the WRITER, refill, and only then move the
-- readers. A reader on one version and a writer on another is SILENT: every
-- card reads as having no facets, which the ranker cannot tell apart from a
-- card that genuinely does nothing.
--
-- That order is only safe because the primary key is `(oracle_id,
-- compiler_version)`. It was `oracle_id` ALONE until 30 Aug, and under the old
-- key a refill DESTROYED each card's row at the previous version as it went, so
-- a rising fraction of the catalogue read as having no facets to the live
-- generator for the whole duration of the refill. See
-- `the_memo_can_hold_two_compiler_versions`.
--
-- The three pins, which move together and are the whole hazard:
--
--   1. `facet-memo-fill`'s COMPILER_VERSION       (the WRITER, deployed first)
--   2. `public.facets(cards_unique)`              (below)
--   3. `public.cards_pool`'s own join             (below)

-- ------------------------------------------------------------- reader one ---

create or replace function public.facets(cards_unique)
returns text[]
language sql
stable
parallel safe
security definer
set search_path = public, pg_temp
as $$
  select m.facets from public.card_facet_memo m
  where m.oracle_id = $1.oracle_id and m.compiler_version = 8
$$;

-- ------------------------------------------------------------- reader two ---
--
-- A materialized view freezes its definition, so moving the join means DROP and
-- CREATE, and ALL FOUR INDEXES HAVE TO COME BACK WITH IT.
-- `cards_pool_identity_rank_id_idx` is the one that lets a colour-filtered pool
-- be WALKED in popularity order rather than sorted; without it the pool query
-- went from 25 ms to 13.7 s against a 3 s statement_timeout.

drop materialized view if exists public.cards_pool cascade;

create materialized view public.cards_pool as
  select c.id,
         c.oracle_id,
         c.name,
         c.type_line,
         c.cmc,
         c.color_identity,
         c.tags,
         c.mana_cost,
         c.edhrec_rank,
         (c.prices ->> 'usd') as usd,
         (c.legalities ->> 'commander') as commander_legal,
         m.facets
    from public.cards_unique c
    left join public.card_facet_memo m
      on m.oracle_id = c.oracle_id
     and m.compiler_version = 8;

create unique index cards_pool_id_idx on public.cards_pool using btree (id);

create index cards_pool_identity_idx on public.cards_pool using gin (color_identity)
  where commander_legal = 'legal';

create index cards_pool_identity_rank_id_idx on public.cards_pool
  using btree (color_identity, edhrec_rank, id)
  where commander_legal = 'legal';

create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id)
  where commander_legal = 'legal' and edhrec_rank is not null;

grant select on public.cards_pool to anon, authenticated, service_role;

-- ------------------------------------------------------------ the old rows --
--
-- ONLY AFTER BOTH READERS HAVE MOVED. Deleting version 7 before this point
-- would blind every reader still on it, which is the failure this whole
-- ordering exists to avoid.

delete from public.card_facet_memo where compiler_version < 8;
