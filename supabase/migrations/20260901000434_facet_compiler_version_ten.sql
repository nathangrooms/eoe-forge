-- The facet memo moves to COMPILER_VERSION 10, and the readers follow it.
--
-- WHAT CHANGED IN 10. Three bugs where the producer already had the
-- information and threw it away, all found by mapping Scryfall Tagger onto our
-- vocabulary and asking why 337 of its concepts had no word of ours:
--
--   grants:<kw>   2,045 cards. `out.add('kw:' + g)` fired both for a card that
--                 HAS a keyword and one that GRANTS it, so Purphoros and
--                 Swiftfoot Boots were the same card to the protection role.
--                 Both facets are emitted now, because a flier is evasion and a
--                 card that gives flying is an evasion ENABLER.
--   acost:x         117 cards reached. `if (parsed.hasX) return;` meant an
--                 activated ability with X in its cost emitted NO acost facet
--                 at all, so every mana sink read as having no ability.
--   eff:set-pt      117 cards. `pt-set` and `pt-modify` both became eff:pump,
--                 filing Humble and Kenrith's Transformation as cards that make
--                 creatures bigger rather than as answers that overwrite them.
--   cost salvage  the activated cost of an ability whose BODY defeated the
--                 compiler is now read into a facet, without publishing an
--                 ability the runtime could offer as a dead button.
--
-- THE ORDER IS NOT NEGOTIABLE. Bump the WRITER, refill, and only then move the
-- readers. A reader on one version and a writer on another is SILENT: every
-- card reads as having no facets, which the ranker cannot tell apart from a
-- card that genuinely does nothing. Safe only because the primary key is
-- (oracle_id, compiler_version), so both versions coexist during the refill.

create or replace function public.facets(cards_unique)
returns text[]
language sql
stable
parallel safe
security definer
set search_path = public, pg_temp
as $$
  select m.facets from public.card_facet_memo m
  where m.oracle_id = $1.oracle_id and m.compiler_version = 10
$$;

-- A materialized view freezes its definition, so moving the join means DROP and
-- CREATE, and ALL FOUR INDEXES HAVE TO COME BACK WITH IT.
-- `cards_pool_identity_rank_id_idx` is the one that lets a colour-filtered pool
-- be WALKED in popularity order rather than sorted; without it the pool query
-- went from 25 ms to 13.7 s against a 3 s statement_timeout.

drop materialized view if exists public.cards_pool cascade;

create materialized view public.cards_pool as
  select c.id, c.oracle_id, c.name, c.type_line, c.cmc, c.color_identity,
         c.tags, c.mana_cost, c.edhrec_rank,
         (c.prices ->> 'usd') as usd,
         (c.legalities ->> 'commander') as commander_legal,
         m.facets
    from public.cards_unique c
    left join public.card_facet_memo m
      on m.oracle_id = c.oracle_id
     and m.compiler_version = 10;

create unique index cards_pool_id_idx on public.cards_pool using btree (id);
create index cards_pool_identity_idx on public.cards_pool using gin (color_identity)
  where commander_legal = 'legal';
create index cards_pool_identity_rank_id_idx on public.cards_pool
  using btree (color_identity, edhrec_rank, id)
  where commander_legal = 'legal';
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id)
  where commander_legal = 'legal' and edhrec_rank is not null;

grant select on public.cards_pool to anon, authenticated, service_role;

analyze public.cards_pool;

-- ONLY NOW, after both readers are on 10.
delete from public.card_facet_memo where compiler_version < 10;;
