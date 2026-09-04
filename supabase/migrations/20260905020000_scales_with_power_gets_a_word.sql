-- APPLIED 5 Sep 2026. `scales-with-power` had no mapping at all.
--
-- Scryfall Tagger has named this shape on 405 cards for months and it mapped to
-- nothing, so GHALTA, PRIMAL HUNGER (rank 460) - a 12/12 whose entire card is
-- "this spell costs {X} less to cast, where X is the total power of creatures
-- you control" - sat in `knowledge_band = 'looks-at-only'` with NO VERB. So did
-- Selvala, Heart of the Wilds (413) and Marwyn, the Nurturer (1,205).
--
-- A CARES WORD, NOT A VERB, and that is the whole judgement. Read across the 16
-- most played members: they DRAW off power (Return of the Wildspeaker, Rishkar's
-- Expertise, Greater Good), make MANA off power (Selvala, Marwyn, Kami of
-- Whispered Hopes), deal DAMAGE off power (Terror of the Peaks, Warstorm Surge)
-- and COST LESS for power (Ghalta, The Great Henge). One verb could not cover
-- those and would be a lie about most of them. What they share is the thing they
-- LOOK AT, so the word is `cares:power`.
--
-- THE CONSUMER SHIPPED IN THE SAME CHANGE, because a word without one is
-- decoration and this project has shipped five of those:
--
--     PLAN_RULES   cares:power -> pt:big 0.7, mv:big 0.4
--
-- `pt:big` rather than `mv:big` first, because power is the axis the tag names:
-- a cheap enormous creature is exactly what these decks want and an expensive
-- small one is not.
--
-- It does nothing on a NON-commander, which is correct and worth stating:
-- `planFit` matches a card's facets against the COMMANDER'S WANTS, and no want
-- is `cares:power`. The facet acts only through the plan rule, on the commander,
-- which is the population it was read against.
--
--   cares:power in the pool     0 -> 573 cards
--   Ghalta's plan               pt:big 0.70 is now her LOUDEST want
--   Ghalta's deck               9 cards at mana value 6+, 8 of them creatures -
--                               Rampaging Baloths, Soul of the Harvest, Vigor,
--                               Vorinclex
--   forty random commanders     40/40 clean, keyed 75%
--   twenty commanders           groups at zero 14 -> 13
--
-- NO COMPILER VERSION BUMP. The tag merge lives in the `cards_pool` view:
--
--   set statement_timeout = '20min';
--   refresh materialized view public.cards_pool;
--   vacuum (analyze) public.cards_pool;   -- ITS OWN STATEMENT, always
--
-- Idempotent: `on conflict` rewrites the same row.

insert into public.tag_facet_map (tag_id, slug, facets, confidence, gated, why)
select t.tag_id, t.slug, array['cares:power'], 'high', true,
  'Cards whose effect scales with creature power. A CARES word rather than a verb: they draw, '
  || 'make mana, deal damage and cost less off power, so one verb would be a lie about most of '
  || 'them. Consumer: PLAN_RULES cares:power -> pt:big 0.7, mv:big 0.4.'
from public.scryfall_tags t
where t.slug = 'scales-with-power'
on conflict (tag_id) do update
  set facets = excluded.facets, gated = excluded.gated, why = excluded.why;

do $$
declare n int;
begin
  select count(*) into n from public.tag_facet_map where slug = 'scales-with-power';
  if n = 0 then
    raise exception 'scales-with-power is not in scryfall_tags, so nothing was mapped';
  end if;
  raise notice 'scales-with-power maps to cares:power';
end $$;
