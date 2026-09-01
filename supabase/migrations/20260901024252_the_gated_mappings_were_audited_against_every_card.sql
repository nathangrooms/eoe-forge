-- All 196 gated mappings audited against real cards, every proposed change
-- independently verified by a second reader who pulled the WHOLE tag rather
-- than the eight samples the first reader saw.
--
-- 62 changes were proposed. THIRTY-FOUR WERE OVERTURNED, almost all toward
-- keeping, and that asymmetry is the finding: a verdict from eight samples is
-- systematically too harsh, because eight cards will show you the exceptions
-- and not the 800 the mapping gets right. `burn-player` is the clearest case —
-- ungating it would have withheld a correct `eff:damage` from 364 cards
-- including Boros Charm, whose first mode literally deals 4 damage to a player,
-- in order to avoid six unplayable cards from the donate-the-drawback cycle
-- that the rank-sliced pool never reaches anyway.
--
-- What survived:
--
--   DROP 10    the tag does not mean what the facet means. `homeward-effect` is
--              blink and was mapped to `eff:gain-control`, which is theft, so
--              the mapping was inverted rather than loose. `mill-opponent` put
--              `eff:mill` on Etali, Primal Storm, which exiles and casts.
--
--   UNGATE 16  true of most, not of all, so it may fill a silent card and may
--              not overwrite a reading. `castable-from-graveyard` is the one
--              worth reading: it added `cares:zone:graveyard` to Momentary
--              Blink, and `facetRoleQualifies(draw)` is
--              `eff:draw || cares:zone:graveyard`, whose own comment says
--              "Regrowth is card advantage; Ephemerate is not, and the
--              difference is the zone". Momentary Blink IS Ephemerate. The gate
--              was defeating its own named counter-example.
--
--   NARROW 10  the facet list claimed too much. Every `*-token` mapping kept
--              `eff:create-token` and lost `cares:type:token`: making a token
--              is not caring about tokens, and only 6.6% of those cards mention
--              a token anywhere outside the creation clause.
--
-- The other 134 were checked and left alone.

delete from public.tag_facet_map
where slug in ('tutors-by-name', 'donate-token', 'rhystic', 'gives-mm-counters',
               'hate-graveyard', 'repeatable-lifegain', 'graveyard-seal',
               'mill-opponent', 'homeward-effect', 'mana-filter');

update public.tag_facet_map set gated = false
where slug in ('repeatable-pure-draw', 'rummage', 'surveil', 'castable-from-graveyard',
               'removal-planeswalker', 'repeatable-loot', 'haven', 'tapper-artifact',
               'overrun', 'synergy-planeswalker', 'tapper-land', 'loot',
               'theft-artifact', 'draw-engine', 'theft-creature', 'tutor-land-any');

update public.tag_facet_map set facets = array['eff:create-token','tok:treasure']::text[] where slug = 'repeatable-treasures';
update public.tag_facet_map set facets = array['eff:create-token']::text[] where slug = 'creates-token-of-a-card';
update public.tag_facet_map set facets = array['cares:zone:graveyard']::text[] where slug = 'reanimate-self';
update public.tag_facet_map set facets = array['eff:create-token']::text[] where slug = 'repeatable-artifact-tokens';
update public.tag_facet_map set facets = array['eff:create-token']::text[] where slug = 'repeatable-creature-tokens';
update public.tag_facet_map set facets = array['eff:create-token']::text[] where slug = 'repeatable-noncreature-tokens';
update public.tag_facet_map set facets = array['eff:create-token']::text[] where slug = 'out-of-color-token';
update public.tag_facet_map set facets = array['eff:draw','cares:zone:hand']::text[] where slug = 'miniwheel';
update public.tag_facet_map set facets = array['eff:gain-life']::text[] where slug = 'drain-creature';
update public.tag_facet_map set facets = array['cares:zone:hand']::text[] where slug = 'thoughtseize';

update public.tag_facet_map set facets = array['eff:draw']::text[] where slug = 'repeatable-pure-draw';
update public.tag_facet_map set facets = array['eff:draw']::text[] where slug = 'rummage';
update public.tag_facet_map set facets = array['eff:surveil']::text[] where slug = 'surveil';
update public.tag_facet_map set facets = array['cares:zone:graveyard']::text[] where slug = 'castable-from-graveyard';
update public.tag_facet_map set facets = array['cares:type:planeswalker']::text[] where slug = 'removal-planeswalker';
update public.tag_facet_map set facets = array['eff:draw','eff:discard-self']::text[] where slug = 'repeatable-loot';
update public.tag_facet_map set facets = array['eff:exile-own']::text[] where slug = 'haven';
update public.tag_facet_map set facets = array['eff:tap']::text[] where slug = 'tapper-artifact';
update public.tag_facet_map set facets = array['eff:pump']::text[] where slug = 'overrun';
update public.tag_facet_map set facets = array['cares:type:planeswalker']::text[] where slug = 'synergy-planeswalker';
update public.tag_facet_map set facets = array['eff:tap']::text[] where slug = 'tapper-land';
update public.tag_facet_map set facets = array['eff:draw','eff:discard-self']::text[] where slug = 'loot';
update public.tag_facet_map set facets = array['eff:gain-control','cares:type:artifact']::text[] where slug = 'theft-artifact';
update public.tag_facet_map set facets = array['eff:draw']::text[] where slug = 'draw-engine';
update public.tag_facet_map set facets = array['eff:gain-control','cares:type:creature']::text[] where slug = 'theft-creature';;
