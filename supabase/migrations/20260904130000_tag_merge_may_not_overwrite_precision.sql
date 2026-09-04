-- The tag merge may not overwrite the compiler's precision with vagueness.
--
-- ## What is wrong
--
-- `cards_pool.facets` is `compiler_facets || tag_facets`, deduplicated. A gated
-- tag mapping is applied to EVERY card carrying the tag, on top of whatever the
-- compiler produced, and neither source knows what the other said. So when the
-- compiler read a card and emitted the PRECISE `-self` variant, a tag adding the
-- GENERIC verb puts back exactly the distinction the compiler was taught to draw.
--
-- On 3 Sep 2026 the compiler learned `eff:add-counters-self` and `ctr:+1/+1-self`
-- because "a counter the card puts on ITSELF read as a counters deck", and Korvold
-- and Animar both planned as Hardened Scales decks. That fix was correct and was
-- being reversed here every night. Measured 4 Sep 2026, Animar carried BOTH forms:
--
--   compiler_facets  eff:add-counters-self          (and NOT the generic)
--   tag_facets       ctr:+1/+1, eff:add-counters, eff:add-counters-self
--
-- so `ctr:+1/+1` and `eff:add-counters` were his two LOUDEST plan wants at 0.90,
-- and his deck came back with 33 creatures, none of them big, against a card whose
-- entire text makes big creatures cheap.
--
-- Correcting the individual mappings does not fix it. Three separate tags feed him
-- the generic - `gains-pp-counters`, `repeatable-pp-counters`, `pp-counters-matter`
-- - and only the first is unambiguously about the card itself. "Repeatably puts
-- +1/+1 counters on creatures" is TRUE of Animar; the tag simply does not draw the
-- distinction, and no amount of re-reading tags will make it.
--
-- ## The rule
--
-- Drop a TAG facet `X` when the compiler emitted `X-self` and did NOT emit `X`.
--
-- It is deliberately narrow. It never removes anything the compiler said, it never
-- touches a card the compiler was silent about, and it only fires where the
-- compiler drew a distinction the tag is flattening. Where the compiler emitted
-- BOTH `X` and `X-self`, the card genuinely does both and the tag agrees.
--
-- ## Measured before applying
--
--   429 cards change, of 25,790 carrying tags
--   facets dropped: ctr:+1/+1, eff:add-counters, eff:damage, eff:discard, eff:exile
--
-- A SECOND, SEPARATE CORRECTION RIDES THIS REBUILD, because a materialized view
-- can only be replaced whole and there is no sense paying for two outages:
-- `knowledge_band` did not count `grants:` as knowing what a card does, so 156
-- cards whose entire job is giving an ability were filed under "knows nothing".
-- Leyline of Anticipation, Shimmer Myr and Vedalken Orrery are three of them.
--
-- Those five are exactly the pairs this codebase created `-self` variants for. Both
-- named cases are fixed: Animar and Korvold keep `eff:add-counters-self` and lose
-- the generic.
--
-- ## Applying it
--
-- A materialized view cannot be replaced in place, so this is DROP, CREATE,
-- indexes, and a full populate of about eight minutes during which `cards_pool`
-- DOES NOT EXIST AND THE DECK GENERATOR RETURNS AN ERROR. It must be run in a
-- supervised window by a caller that can hold a connection for that long, which
-- the MCP SQL session (120 s) cannot. Run it with psql or the SQL editor, in one
-- go, and confirm all FIVE indexes came back before walking away.
--
--   `cards_pool_identity_rank_id_idx` is the one that lets a colour-filtered pool
--   be WALKED in popularity order rather than sorted. Without it the pool query
--   goes from 25 ms to 13.7 s against a 3 s statement_timeout, which is a broken
--   generator rather than a slow one.
--
-- The definition below is the CURRENT one with a single expression changed, so it
-- must be regenerated from `pg_get_viewdef('public.cards_pool')` if the view has
-- moved on. Check the pinned `compiler_version` still matches `facet-memo-fill`.

begin;

drop materialized view if exists public.cards_pool;

create materialized view public.cards_pool as
with tag_words as (
  select ct.oracle_id,
         array_agg(distinct f.f) filter (where t.gated) as gated_facets,
         array_agg(distinct f.f) as any_facets
    from scryfall_card_tags ct
    join tag_facet_map t on t.tag_id = ct.tag_id
    cross join lateral unnest(t.facets) f(f)
   group by ct.oracle_id
), merged as (
  select c.id, c.oracle_id, c.name, c.type_line, c.cmc, c.color_identity, c.tags,
         c.mana_cost, c.edhrec_rank,
         (c.prices ->> 'usd') as usd,
         (c.legalities ->> 'commander') as commander_legal,
         m.coverage,
         m.facets as compiler_facets,
         /*
          * THE TAG SIDE, WITH THE COMPILER'S PRECISION PROTECTED.
          *
          * The outer CASE is unchanged: a card the compiler gave a real verb to
          * takes only GATED tag words, and a card it was silent about takes any.
          * The inner filter is the new rule.
          */
         (
           select coalesce(array_agg(tf), '{}'::text[])
             from unnest(
                    case
                      when exists (
                        select 1 from unnest(coalesce(m.facets, '{}'::text[])) x(x)
                         where x.x ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok):'
                      ) then coalesce(tw.gated_facets, '{}'::text[])
                      else coalesce(tw.any_facets, '{}'::text[])
                    end
                  ) tf
            where not (
                    (tf || '-self') = any(coalesce(m.facets, '{}'::text[]))
                    and not (tf = any(coalesce(m.facets, '{}'::text[])))
                  )
         ) as tag_facets
    from cards_unique c
    left join card_facet_memo m
      on m.oracle_id = c.oracle_id and m.compiler_version = 17
    left join tag_words tw on tw.oracle_id = (c.oracle_id)::uuid
)
select id, oracle_id, name, type_line, cmc, color_identity, tags, mana_cost,
       edhrec_rank, usd, commander_legal,
       (select array_agg(distinct f.f)
          from unnest(coalesce(merged.compiler_facets, '{}'::text[]) || merged.tag_facets) f(f)
       ) as facets,
       compiler_facets,
       tag_facets,
       case
         when coverage = 'none' then 'nothing-to-read'
         when coverage = 'full' then 'whole-card'
         when exists (
           select 1 from unnest(coalesce(merged.compiler_facets, '{}'::text[]) || merged.tag_facets) f(f)
            /*
             * `grants:` COUNTS AS KNOWING WHAT A CARD DOES, and it did not.
             *
             * A card whose whole job is giving something an ability was
             * reported as "knows nothing about what it does". Measured 4 Sep
             * 2026, 156 cards, including Leyline of Anticipation (rank 734),
             * Shimmer Myr (1,321) and Vedalken Orrery (1,461), whose entire
             * text is "you may cast spells as though they had flash". The
             * engine knew exactly what they do - `grants:flash` - and the
             * work list said otherwise.
             *
             * ONLY THIS LABEL. The identical regex appears in the `merged`
             * CTE above, where it decides whether a card takes only GATED tag
             * words or any of them. Adding `grants` THERE would change which
             * facets 156 cards carry, which is a behaviour change wearing a
             * reporting fix's clothes.
             */
            where f.f ~ '^(eff|trig|cost|acost|scope|mana|ctr|tok|grants):'
         ) then 'knows-job'
         when exists (
           select 1 from unnest(coalesce(merged.compiler_facets, '{}'::text[]) || merged.tag_facets) f(f)
            where f.f ~ '^cares:'
         ) then 'looks-at-only'
         else 'nothing'
       end as knowledge_band
  from merged;

-- ALL FIVE INDEXES, copied from `pg_indexes` on 4 Sep 2026 rather than
-- remembered. The first draft of this file guessed FOUR and got three of them
-- wrong: it invented an index on `name`, missed the GIN one on `color_identity`
-- and the rank one entirely, and misnamed the band index. Any of those would
-- have been a silently slower or broken pool query rather than an error.
--
-- UNIQUE first: `refresh materialized view concurrently` requires one, and the
-- nightly job refreshes concurrently so reads are never blocked.
create unique index cards_pool_id_idx on public.cards_pool using btree (id);

-- The one that lets a colour-filtered pool be WALKED in popularity order rather
-- than sorted. Without it the pool query is 13.7 s against a 3 s timeout.
create index cards_pool_identity_rank_id_idx
  on public.cards_pool using btree (color_identity, edhrec_rank, id)
  where (commander_legal = 'legal'::text);

create index cards_pool_identity_idx
  on public.cards_pool using gin (color_identity)
  where (commander_legal = 'legal'::text);

create index cards_pool_rank_idx
  on public.cards_pool using btree (edhrec_rank, id)
  where ((commander_legal = 'legal'::text) and (edhrec_rank is not null));

create index cards_pool_band_idx on public.cards_pool using btree (knowledge_band);

commit;

-- Then, and only then:
--   analyze public.cards_pool;
-- and confirm:
--   select count(*) from public.cards_pool where facets @> array['eff:add-counters']
--     and facets @> array['eff:add-counters-self'];   -- expect this to fall
