-- COMPILER VERSION 15, 3 Sep 2026. Seven shapes from the second workflow round:
-- `eff:bounce-own` (returning your OWN creature is not Cyclonic Rift),
-- `eff:impulse`, a pump sized by a creature's power with `cares:power`,
-- protection from a colour chosen on resolution, the wheel read by the
-- compiler rather than only by the Tagger, `eff:unless-pays`, and
-- `eff:cast-free`. Plus `trig:cast:targeting` from version 14, which the
-- facet layer emitted and the pool never saw.
--
-- Writer first (done, 33,034 rows), readers second (this), 14 deleted last.
-- Measured against 14 before moving: 1,016 cards gained a facet, 22 lost one
-- and every loss was a correction (Ragavan stops "caring about" the Treasure
-- he makes; Mother of Runes' salvaged `acost:1` goes because her ability now
-- compiles with its real tap-only cost).

create or replace function public.facets(c public.cards_unique)
returns text[]
language sql
stable
as $$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 15;
$$;

drop materialized view if exists public.cards_pool cascade;

create materialized view public.cards_pool as
with tag_words as (
  select ct.oracle_id,
         array_agg(distinct f) filter (where t.gated) as gated_facets,
         array_agg(distinct f)                        as any_facets
  from public.scryfall_card_tags ct
  join public.tag_facet_map t on t.tag_id = ct.tag_id
  cross join lateral unnest(t.facets) f
  group by ct.oracle_id
),
merged as (
  select c.id, c.oracle_id, c.name, c.type_line, c.cmc, c.color_identity, c.tags,
         c.mana_cost, c.edhrec_rank,
         c.prices ->> 'usd'::text           as usd,
         c.legalities ->> 'commander'::text as commander_legal,
         m.coverage,
         m.facets                           as compiler_facets,
         case when exists (
                select 1 from unnest(coalesce(m.facets, '{}'::text[])) x
                where x ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):')
              then coalesce(tw.gated_facets, '{}'::text[])
              else coalesce(tw.any_facets,   '{}'::text[])
         end                                as tag_facets
  from public.cards_unique c
  left join public.card_facet_memo m
    on m.oracle_id = c.oracle_id and m.compiler_version = 15
  left join tag_words tw
    on tw.oracle_id = c.oracle_id::uuid
)
select id, oracle_id, name, type_line, cmc, color_identity, tags, mana_cost,
       edhrec_rank, usd, commander_legal,
       (select array_agg(distinct f)
          from unnest(coalesce(compiler_facets, '{}'::text[]) || tag_facets) f)
                                            as facets,
       compiler_facets,
       tag_facets,
       case
         when coverage = 'none' then 'nothing-to-read'
         when coverage = 'full' then 'whole-card'
         when exists (
           select 1 from unnest(coalesce(compiler_facets,'{}'::text[]) || tag_facets) f
           where f ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):') then 'knows-job'
         when exists (
           select 1 from unnest(coalesce(compiler_facets,'{}'::text[]) || tag_facets) f
           where f ~ '^cares:') then 'looks-at-only'
         else 'nothing'
       end                                  as knowledge_band
  from merged;

create unique index cards_pool_id_idx on public.cards_pool using btree (id);
create index cards_pool_identity_idx on public.cards_pool using gin (color_identity)
  where commander_legal = 'legal'::text;
create index cards_pool_identity_rank_id_idx on public.cards_pool
  using btree (color_identity, edhrec_rank, id) where commander_legal = 'legal'::text;
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id)
  where commander_legal = 'legal'::text and edhrec_rank is not null;
create index cards_pool_band_idx on public.cards_pool using btree (knowledge_band);

analyze public.cards_pool;;
