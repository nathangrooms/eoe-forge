-- APPLIED 5 Sep 2026. The `copy-spell` tag mapped only the "looks at" word.
--
-- Eight of the nine best-known copy spells sat in `knowledge_band =
-- 'looks-at-only'` with NO VERB AT ALL: Narset's Reversal (rank 728),
-- Reverberate (1,406), Reiterate, Increasing Vengeance, See Double, Clone
-- Legion, Twincast, Fork. They carried `cares:type:instant`,
-- `cares:type:sorcery` and `cares:zone:stack`, so the engine knew what they
-- LOOKED AT and not what they DID, and no role or plan rule could reach them.
--
-- THE DSL HAS NO `copy` EFFECT MEMBER, so the oracle-text compiler cannot
-- produce one and this tag is the only source. The `clone` tag has mapped to
-- `eff:copy` for clone CREATURES since the map was written; `copy-spell` is the
-- spell half of the same idea and was given only the zone word.
--
-- `eff:copy` already had two consumers and no producer for these cards, which
-- is the fifth time this project has recorded a word declared without one: a
-- clone commander wants it at 0.85, and `trig:cast-own` at 0.7.
--
-- READ BEFORE MAPPED, which is what the method asks for. The 24 most played
-- members, as a player: 24 of 24 correct. Copy spells - Return the Favor,
-- Dualcaster Mage, Flare of Duplication, Twinferno, Galvanic Iteration - and
-- copy engines - Thousand-Year Storm, Twinning Staff, Pyromancer's Goggles,
-- Double Vision, Unbound Flourishing, Sword of Wealth and Power. No false
-- positives, so `gated` stays true and the word is applied to every card
-- carrying the tag.
--
--   eff:copy in the pool          468 -> 585 cards
--   knows what it LOOKS AT only   361 -> 345
--   eighteen strategies           shell cards held 37 -> 40
--   Talrand + Spellslinger        12 copy cards - Narset's Reversal, Twinning
--                                 Staff, Brain Freeze, Orvar, Kitsa
--   forty random commanders       40/40 clean, keyed 76%, unchanged
--
-- NO COMPILER VERSION BUMP. The tag merge lives in the `cards_pool` view, so a
-- `tag_facet_map` change reaches the app on a refresh:
--
--   set statement_timeout = '20min';
--   refresh materialized view public.cards_pool;
--   vacuum (analyze) public.cards_pool;   -- ITS OWN STATEMENT. See the
--                                         -- compiler-20 migration: without it
--                                         -- the next pool query returned 57014.
--
-- Idempotent: re-running sets the same two facets.

update public.tag_facet_map
set facets = array['cares:zone:stack', 'eff:copy']
where slug = 'copy-spell';

do $$
declare n int;
begin
  select cardinality(facets) into n from public.tag_facet_map where slug = 'copy-spell';
  if n is null then
    raise exception 'the copy-spell tag is not in tag_facet_map';
  end if;
  raise notice 'copy-spell now maps to % facets', n;
end $$;
