-- COMPILER VERSION 13: a negation is not a wish.
--
-- Three readers in the facet layer read a negative frame as a positive one:
--
--   readFilter          `case 'not'` recursed into the negated filter and
--                       emitted from inside it, so "nonland permanents" gave
--                       Brago, King Eternal `cares:type:land`.
--   the word scan       split rules text on non-letters and read every subtype
--                       word as wanted; "Protection from Humans" made Yawgmoth
--                       a Human tribal commander and "non-Human" did the same
--                       to Kinnan.
--   readCaresFilters    guarded on a `not` KEY the DSL never writes; it spells
--                       a negated filter `{is:'not', of}`. The guard never fired.
--
-- Every card carrying a negated filter or a negative frame around a subtype
-- reads differently now, so the memo is refilled and the readers move. Writer
-- first (done), readers second (this), version 12 deleted last, after the
-- pool is verified. Same discipline as every version before it.

create or replace function public.facets(c public.cards_unique)
returns text[]
language sql
stable
as $$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 13;
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
    on m.oracle_id = c.oracle_id and m.compiler_version = 13
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
