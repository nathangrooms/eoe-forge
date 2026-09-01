-- `engine_knowledge()` started returning 57014.
--
-- It classified all 33,032 rows on every request: three EXISTS subqueries, each
-- unnesting a facet array and running a regex over every element. That was ~1 s
-- when the pool carried compiler facets alone, and it went past the 8 s
-- `authenticator` timeout once Tagger's words were merged in and the arrays got
-- longer. An admin screen then drew nothing at all, which is precisely the
-- failure the screen exists to prevent.
--
-- The band is a COLUMN now, computed once per refresh. Same reasoning that
-- created `cards_pool` in the first place: a matview is the place to pay a cost
-- once rather than per page view. `engine_knowledge()` becomes a GROUP BY.
--
-- The five bands PARTITION and the shares sum to 100. That is load-bearing: the
-- coverage screen once summed to 120% because one band was the union of two
-- others, and 354 cards were in no band at all.

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
    on m.oracle_id = c.oracle_id and m.compiler_version = 10
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
       /*
        * WHAT WE CAN SAY ABOUT THIS CARD, decided once.
        *
        * `nothing-to-read` is a vanilla card and is COMPLETE, not missing: a
        * creature with no rules text has been read correctly by reading nothing.
        * `whole-card` is the compiler's own span-accounted verdict. The other
        * three describe how far short of that we fell.
        */
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
-- The band is what the admin screen groups by, and what the "cards nobody has
-- read yet" alert filters on.
create index cards_pool_band_idx on public.cards_pool using btree (knowledge_band);

analyze public.cards_pool;

-- --------------------------------------------------------------------------
create or replace function public.engine_knowledge()
returns table (measure text, cards bigint, share numeric, note text)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select knowledge_band,
           count(*)::bigint                                          as n,
           count(*) filter (where cardinality(tag_facets) > 0)::bigint as tagged,
           count(*) filter (
             where cardinality(tag_facets) > 0
               and not exists (select 1 from unnest(coalesce(compiler_facets,'{}'::text[])) f
                               where f ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):')
           )::bigint                                                 as tag_only
    from public.cards_pool group by knowledge_band
  ),
  t as (select sum(n) as n from b)
  select 'the app knows what it does'::text,
         coalesce(sum(n) filter (where knowledge_band in ('nothing-to-read','whole-card','knows-job')), 0),
         round(100.0 * coalesce(sum(n) filter (where knowledge_band in ('nothing-to-read','whole-card','knows-job')), 0)
               / nullif((select n from t), 0), 1),
         'complete, fully read, or at least one verb from any source'::text from b
  union all
  select 'nothing to read', coalesce(sum(n) filter (where knowledge_band = 'nothing-to-read'), 0),
         round(100.0 * coalesce(sum(n) filter (where knowledge_band = 'nothing-to-read'),0) / nullif((select n from t),0), 1),
         'no rules text at all. A vanilla creature is not an unread card' from b
  union all
  select 'whole card read', coalesce(sum(n) filter (where knowledge_band = 'whole-card'), 0),
         round(100.0 * coalesce(sum(n) filter (where knowledge_band = 'whole-card'),0) / nullif((select n from t),0), 1),
         'the compiler accounted for every paragraph' from b
  union all
  select 'knows what it does, not all of it', coalesce(sum(n) filter (where knowledge_band = 'knows-job'), 0),
         round(100.0 * coalesce(sum(n) filter (where knowledge_band = 'knows-job'),0) / nullif((select n from t),0), 1),
         'at least one verb, from the compiler or from Tagger under the gate' from b
  union all
  select 'knows what it looks at, not what it does', coalesce(sum(n) filter (where knowledge_band = 'looks-at-only'), 0),
         round(100.0 * coalesce(sum(n) filter (where knowledge_band = 'looks-at-only'),0) / nullif((select n from t),0), 1),
         'cares: words only. Cannot be offered for a job' from b
  union all
  select 'knows nothing about what it does', coalesce(sum(n) filter (where knowledge_band = 'nothing'), 0),
         round(100.0 * coalesce(sum(n) filter (where knowledge_band = 'nothing'),0) / nullif((select n from t),0), 1),
         'the real work list' from b
  union all
  select 'Tagger added a word', coalesce(sum(tagged), 0),
         round(100.0 * coalesce(sum(tagged),0) / nullif((select n from t),0), 1),
         'community reading, merged under the 86% precision gate' from b
  union all
  select 'Tagger was the only source', coalesce(sum(tag_only), 0),
         round(100.0 * coalesce(sum(tag_only),0) / nullif((select n from t),0), 1),
         'our compiler produced no verb for these at all' from b;
$$;

grant execute on function public.engine_knowledge() to anon, authenticated, service_role;;
