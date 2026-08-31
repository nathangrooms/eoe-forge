-- The facet memo, and the two things that read it, move to compiler version 7.
--
-- Four bumps happened on 31 Aug 2026 as rules landed; this file is the state
-- production ended on, and the earlier versions have been deleted from the memo.
-- The full reasoning for each is in `facet-memo-fill/index.ts`, above the
-- constant. The short version:
--
--   4  the Oxford comma, Cultivate's split destination, tutors to the top of the
--      library, additional cast costs, and the two conditional tapped-land forms
--   5  extra land drops, reanimation written as "put ... from A graveyard", and
--      the additional-cost manual marker
--   6  eff:extra-land-drop, which is what makes Exploration count as ramp
--   7  cost:sacrifice-self and cost:cast-*, below
--
-- WHY 7 IS THE ONE WORTH A FILE OF ITS OWN. Two facets were doing the work of
-- four, and both splits came out of reading a whole generated Meren deck card
-- by card rather than looking at its score.
--
--   cost:sacrifice-self   "Sacrifice this artifact: draw a card" is not a
--                         sacrifice outlet. Vexing Bauble, Soul-Guide Lantern,
--                         Stone of Erech, Hedron Archive and Sakura-Tribe Elder
--                         all answered the aristocrats plan's loudest want while
--                         eating only themselves, once.
--   cost:cast-sacrifice   Village Rites and Deadly Dispute eat one creature
--                         once; Ashnod's Altar and Viscera Seer are the engine
--                         the deck cannot function without.
--
-- The deck this fixed had twelve "when a creature dies" payoffs in it — Grave
-- Pact, Dictate of Erebos, Bastion of Remembrance, Grim Haruspex, Midnight
-- Reaper — and nothing at all that could sacrifice a creature on demand.
--
-- Measured across the six decks in `generator-synergy-audit.mjs` after it:
-- format staples found 37/54 -> 40/54, Adeline 8/8, Niv-Mizzet's median rank
-- 1697 -> 1086, Teysa's 2316 -> 1225, Ghalta's cards past rank 15,000 3 -> 0.
--
-- THE ORDER IS NOT A PREFERENCE. The writer moved first (facet-memo-fill
-- deployed at COMPILER_VERSION = 7), the catalogue was refilled at the new
-- version, and only then did the readers move. A reader on one version and a
-- writer on another is SILENT: every card comes back with no facets, which the
-- ranker cannot tell apart from a card that does nothing. The primary key is
-- (oracle_id, compiler_version), so both versions coexist during the refill.
--
-- The indexes come back in the same breath because moving a matview's join
-- means DROP and CREATE, and `cards_pool_identity_rank_id_idx` is what lets a
-- colour-filtered pool be walked in popularity order rather than sorted.
-- Without it the pool query went from 25 ms to 13.7 s against a 3 s timeout.
--
-- The ANALYZE is not optional either: a freshly built matview has no statistics
-- at all, so the planner estimated one row, chose the GIN index and sorted
-- 12,474 rows — 229 ms against 38 ms after.

set statement_timeout = '10min';

create or replace function public.facets(cards_unique)
returns text[]
language sql
stable parallel safe security definer
set search_path to 'public', 'pg_temp'
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = $1.oracle_id
    and m.compiler_version = 7
$function$;

drop materialized view if exists public.cards_pool;

create materialized view public.cards_pool as
 SELECT c.id,
    c.oracle_id,
    c.name,
    c.type_line,
    c.cmc,
    c.color_identity,
    c.tags,
    c.mana_cost,
    c.edhrec_rank,
    (c.prices ->> 'usd'::text) AS usd,
    (c.legalities ->> 'commander'::text) AS commander_legal,
    m.facets
   FROM (cards_unique c
     LEFT JOIN card_facet_memo m ON (((m.oracle_id = c.oracle_id) AND (m.compiler_version = 7))));

create unique index cards_pool_id_idx on public.cards_pool using btree (id);
create index cards_pool_identity_idx on public.cards_pool using gin (color_identity) where (commander_legal = 'legal'::text);
create index cards_pool_identity_rank_id_idx on public.cards_pool using btree (color_identity, edhrec_rank, id) where (commander_legal = 'legal'::text);
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id) where ((commander_legal = 'legal'::text) and (edhrec_rank is not null));

grant select on public.cards_pool to anon, authenticated, service_role;

analyze public.cards_pool;

-- Only after the readers have moved. Keeping a superseded version costs 33,032
-- rows of write amplification on every vacuum and buys nothing once nothing
-- reads it.
delete from public.card_facet_memo where compiler_version < 7;
