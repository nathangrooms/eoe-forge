-- COMPILER VERSION 11: the blink rule reads four more wordings.
--
-- `scripts/probe/blink-read.mjs` measured the gap rather than guessing at it.
-- Of the sixty most played cards our own tagger calls `blink`, the compiler
-- read TWENTY-FIVE. The other thirty-five were not exotic cards, they were four
-- wordings the rule's anchor refused: "you may exile ...", "... transformed
-- under its owner's control", "... with a +1/+1 counter on it", and a mods
-- group that could not end. 25 of 60 to 33 of 60.
--
-- THE THREE PINS MOVE TOGETHER, writer first. `facet-memo-fill`'s constant is
-- already 11 and the memo is refilled; this moves the two readers. A reader on
-- one version and a writer on another is SILENT: every card reads as having no
-- facets, which the ranker cannot tell apart from a card that genuinely does
-- nothing.
--
-- Version 10 is NOT deleted here. The primary key is (oracle_id,
-- compiler_version) precisely so both can exist, and dropping the old one
-- before the readers have moved is the window this project already paid for
-- once. It goes at the end, after `cards_pool` is rebuilt and verified.

create or replace function public.facets(c public.cards_unique)
returns text[]
language sql
stable
as $$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 11;
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
    on m.oracle_id = c.oracle_id and m.compiler_version = 11
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
-- Without this one the pool query goes from 25 ms to 13.7 s against a 3 s
-- statement_timeout: it is what lets a colour-filtered pool be WALKED in
-- popularity order rather than sorted.
create index cards_pool_identity_rank_id_idx on public.cards_pool
  using btree (color_identity, edhrec_rank, id) where commander_legal = 'legal'::text;
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id)
  where commander_legal = 'legal'::text and edhrec_rank is not null;
create index cards_pool_band_idx on public.cards_pool using btree (knowledge_band);

analyze public.cards_pool;;
