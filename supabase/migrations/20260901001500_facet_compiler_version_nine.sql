-- The facet memo moves to COMPILER_VERSION 9, and the readers follow it.
--
-- WHAT CHANGED IN 9, all measured over the whole catalogue:
--
--   direction on effects   964 cards. eff:exile-own, eff:shrink, eff:discard-self,
--                          eff:damage-self, eff:tap-own, eff:destroy-own,
--                          eff:draw-each. The facet layer had never once read
--                          `effect.who`, so every effect was recorded as though
--                          aimed at an opponent, and 574 cards held a role
--                          solely because of it.
--   Scryfall's keywords    16,507 cards carry a curated keyword array from
--                          Wizards' own labelling that this engine never read.
--   ability words          1 of 69 to 61 of 69. Landfall is on 193 cards.
--   supertypes             snow, basic, token, world, free from the type line.
--   both type-line faces   851 double-faced cards were read as half a card.
--   blink                  47 cards, the immediate "exile then return" wording.
--   "another target"       416 cards, an ordering bug in the selector parser.
--
-- Live after the move: 33,008 of 33,032 pool rows carry facets, 206 blink
-- cards, 190 landfall, 611 equip.
--
-- WRITTEN AFTER THE FACT, from the live definitions, on 1 Sep 2026. The move
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
  where m.oracle_id = $1.oracle_id and m.compiler_version = 9
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
     and m.compiler_version = 9;

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

delete from public.card_facet_memo where compiler_version < 9;
