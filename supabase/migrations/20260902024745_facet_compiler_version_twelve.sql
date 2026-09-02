-- COMPILER VERSION 12: a card that exiles ITSELF is not blinking your board.
--
-- Version 11 widened the blink rule and 14 cards gained `eff:exile-own`, every
-- one of them correctly a blink of something — and Syr Vondam's archetype score
-- FELL, 6/60 to 4/60, deterministically. Better reading, worse deck.
--
-- The gap between those two facts is the distinction this version adds. Most of
-- the 14 were transforming Praetors and Final Fantasy Dominants: "{R}: Exile
-- Urabrask, then return it to the battlefield transformed under its owner's
-- control". That is a blink of ITSELF, and Syr Vondam is paid when ANOTHER
-- creature you control is exiled, so it pays him nothing — while taking the
-- reserved slots that Eerie Interlude and Ghostway had.
--
--     exile-own   206 -> 220 (v11) -> 76 (v12)
--     exile-self                       144
--
-- Same shape and precedent as `cost:sacrifice` against `cost:sacrifice-self`,
-- and as the whole `effect.who` split that moved 574 cards: a separate verb,
-- never a qualifier, because a role check asks whether a card carries ONE facet
-- and a qualifier alongside would change nothing.
--
-- ONE CARD WORTH NAMING. Teferi's Protection is rank 109 and its only compiled
-- effect is `{do:'exile', what:{sel:'self'}}` — from the card's own cleanup
-- line, "Exile Teferi's Protection". Its actual protection is the phasing
-- clause, which the compiler does not read at all. So it held the protection
-- role by ACCIDENT and now loses that accident; it keeps the role through its
-- `protection` tag and the tag fallback, which is open because it is
-- `rec:partial`. Checked, not assumed.
--
-- Scryfall's `phasing` tag was the obvious way to read it properly and is NOT
-- mapped: measured over all 68 catalogue members, only 35% clearly phase out
-- YOUR permanents, and calling the rest protection would put removal spells in
-- protection slots. Reading phasing is named work, not a mapping.

create or replace function public.facets(c public.cards_unique)
returns text[]
language sql
stable
as $$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 12;
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
    on m.oracle_id = c.oracle_id and m.compiler_version = 12
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
-- Without this the pool query goes 25 ms -> 13.7 s against a 3 s timeout.
create index cards_pool_identity_rank_id_idx on public.cards_pool
  using btree (color_identity, edhrec_rank, id) where commander_legal = 'legal'::text;
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id)
  where commander_legal = 'legal'::text and edhrec_rank is not null;
create index cards_pool_band_idx on public.cards_pool using btree (knowledge_band);

analyze public.cards_pool;

-- Readers have moved. The old versions can go; the primary key is
-- (oracle_id, compiler_version) so holding two was safe, and holding five is
-- just 130,000 dead rows.
delete from public.card_facet_memo where compiler_version < 12;;
