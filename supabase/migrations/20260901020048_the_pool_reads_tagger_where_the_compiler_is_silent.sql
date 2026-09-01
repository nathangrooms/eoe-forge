-- `cards_pool` merges Scryfall Tagger's reading into the compiler's, under the
-- gate that was measured before this was written.
--
-- ## The two rules, and why they are not one rule
--
--   GATED (196 mappings)   applied to EVERY card
--   the rest (191)         applied ONLY where the compiler produced no
--                          behavioural word at all
--
-- Scored against a 374-word answer key built by two independent readers who saw
-- none of the contenders:
--
--     compiler alone                     86.7% precision   48.7% recall
--     the whole mapping merged in        83.5%             75.7%   FAILS
--     gated only                         86.9%             67.1%   passes
--     gated, plus all of it where the
--       compiler said nothing            86.3%             72.5%   passes
--
-- The naive union FAILS because both sources' errors compound. 85% is the bar
-- because this table puts cards into deck-building ROLES, and a wrong facet
-- makes the builder spend a real slot on a card that cannot do the job. A card
-- the compiler is silent on has nothing to lose, which is why the ungated half
-- is safe there and nowhere else.
--
-- ## The merge is HERE and not in `card_facet_memo`, and that is absolute
--
-- The memo holds what our compiler derived from a parsed record. Tagger holds
-- what a person wrote. Writing Tagger into the memo would destroy the one
-- property that makes the compiler improvable: that its output can be
-- regenerated from source and checked. `compiler_facets` and `tag_facets` are
-- both kept as columns so any row can be taken apart afterwards, and so this
-- whole merge can be reverted by changing one expression.

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
)
select c.id,
       c.oracle_id,
       c.name,
       c.type_line,
       c.cmc,
       c.color_identity,
       c.tags,
       c.mana_cost,
       c.edhrec_rank,
       c.prices ->> 'usd'::text        as usd,
       c.legalities ->> 'commander'::text as commander_legal,

       /* What every consumer reads. Compiler first, Tagger under the gate. */
       (select array_agg(distinct f)
          from unnest(
            coalesce(m.facets, '{}'::text[]) ||
            case when exists (
                   select 1 from unnest(coalesce(m.facets, '{}'::text[])) x
                   where x ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):')
                 then coalesce(tw.gated_facets, '{}'::text[])
                 else coalesce(tw.any_facets,   '{}'::text[])
            end
          ) f)                          as facets,

       /* Provenance, so a wrong word can always be traced to whoever said it. */
       m.facets                         as compiler_facets,
       case when exists (
              select 1 from unnest(coalesce(m.facets, '{}'::text[])) x
              where x ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):')
            then coalesce(tw.gated_facets, '{}'::text[])
            else coalesce(tw.any_facets,   '{}'::text[])
       end                              as tag_facets

  from public.cards_unique c
  left join public.card_facet_memo m
    on m.oracle_id = c.oracle_id and m.compiler_version = 10
  left join tag_words tw
    on tw.oracle_id = c.oracle_id::uuid;

-- All four come back. `cards_pool_identity_rank_id_idx` is the one that lets a
-- colour-filtered pool be WALKED in popularity order rather than sorted;
-- without it the pool query goes from 25 ms to 13.7 s against a 3 s timeout.
create unique index cards_pool_id_idx on public.cards_pool using btree (id);
create index cards_pool_identity_idx on public.cards_pool using gin (color_identity)
  where commander_legal = 'legal'::text;
create index cards_pool_identity_rank_id_idx on public.cards_pool
  using btree (color_identity, edhrec_rank, id) where commander_legal = 'legal'::text;
create index cards_pool_rank_idx on public.cards_pool using btree (edhrec_rank, id)
  where commander_legal = 'legal'::text and edhrec_rank is not null;

analyze public.cards_pool;;
