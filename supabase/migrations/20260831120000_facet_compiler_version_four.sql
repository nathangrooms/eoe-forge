-- The facet memo, and the two things that read it, move to compiler version 4.
--
-- Seven compiler rules landed on 31 Aug 2026 and every one of them changes the
-- facets of cards that ALREADY had a memo row, which is exactly what the
-- version number is for:
--
--   the Oxford comma in an object phrase   Farseek (23) and every basic-type fetch
--   Cultivate's split destination          Cultivate (20), Kodama's Reach (37)
--   tutors that leave the card on top      Vampiric (12), Enlightened, Mystical,
--                                          Worldly, Sylvan
--   additional cast costs                  Village Rites (200), Deadly Dispute,
--                                          Crop Rotation, Big Score
--   "unless you control N other lands"     20 check lands
--   "unless you have N opponents"          10 Commander duals
--
-- ORDER, and it is not a preference. The WRITER moved first
-- (`facet-memo-fill`, deployed with COMPILER_VERSION = 4), the whole catalogue
-- was refilled at the new version, and only then did the readers move. A reader
-- on one version and a writer on another is SILENT: every card comes back with
-- no facets, which the ranker cannot tell apart from a card that genuinely does
-- nothing. The primary key is (oracle_id, compiler_version), so the two
-- versions coexist and version 3 is still there to fall back to.
--
-- Measured after the refill, both versions present:
--
--   version 3   33,032 rows   compiler 23,859   xmage 1,866   no record 7,307
--   version 4   33,032 rows   compiler 23,930   xmage 1,838   no record 7,264
--
-- THE INDEXES COME BACK IN THE SAME BREATH. Moving a materialized view's join
-- means DROP and CREATE, and `cards_pool_identity_rank_id_idx` is the one that
-- lets a colour-filtered pool be WALKED in popularity order rather than sorted;
-- without it the pool query went from 25 ms to 13.7 s against a 3 s
-- statement_timeout, which is written up in CLAUDE.md as the thing that took
-- the deck generator down.
--
-- AND THE ANALYZE. A freshly built matview has no statistics at all, so the
-- planner estimated one row, chose the GIN index and sorted 12,474 rows:
--
--   before analyze   Bitmap Heap Scan + top-N heapsort   229 ms
--   after analyze    Index Scan, no sort                   38 ms
--
-- The two `cards-pool-vacuum` cron jobs keep it that way; this is the first one.

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
    and m.compiler_version = 4
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
     LEFT JOIN card_facet_memo m ON (((m.oracle_id = c.oracle_id) AND (m.compiler_version = 4))));

create unique index cards_pool_id_idx on public.cards_pool using btree (id);
create index cards_pool_identity_idx on public.cards_pool using gin (color_identity) where (commander_legal = 'legal'::text);
create index cards_pool_identity_rank_id_idx on public.cards_pool using btree (color_identity, edhrec_rank, id) where (commander_legal = 'legal'::text);
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id) where ((commander_legal = 'legal'::text) and (edhrec_rank is not null));

grant select on public.cards_pool to anon, authenticated, service_role;

analyze public.cards_pool;
