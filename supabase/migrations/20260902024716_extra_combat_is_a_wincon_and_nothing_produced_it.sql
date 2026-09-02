-- `eff:extra-combat` has been in EFFECT_VERBS and in ROLE_FACETS.wincon since
-- the wincon role was written, and NOTHING has ever produced it. The section
-- 10e shape for the fifth time: declared, wired to a consumer, fed by nobody.
--
-- It matters because wincon is the role the generator can never fill. Its own
-- changelog says so on most builds — "4 of 4 wincon slots could not be filled
-- from the legal pool" — and an unfillable target does not stay a local
-- problem: the slots come out of the budget every other role competes for.
--
-- Scryfall's `extra-combat-phase` tag is 54 cards and literal: Aggravated
-- Assault (697), Aurelia the Warleader (821), Moraug (984), Combat Celebrant
-- (1008), Karlach (1054), Relentless Assault, Seize the Day, Hellkite Charger,
-- Port Razer, Anzrag. Every one grants an additional combat phase, which is one
-- of the few things in Commander that genuinely ends a game from a stable
-- board.
--
-- GATED, because it is true of every card carrying it: the tag names a
-- mechanic, not a theme, and a card either gives an extra combat or it does
-- not. Nothing in the catalogue currently carries `eff:extra-combat` from the
-- compiler, so there is no reading for this to overwrite — purely additive.

insert into public.tag_facet_map (tag_id, slug, facets, confidence, gated, why)
select t.tag_id, t.slug, array['eff:extra-combat']::text[], 'high', true,
       'The tag names a mechanic, not a theme. eff:extra-combat was in ROLE_FACETS.wincon with no producer at all, and wincon is the role the generator most often cannot fill.'
from public.scryfall_tags t
where t.slug = 'extra-combat-phase'
on conflict (tag_id) do update
  set facets = excluded.facets, gated = excluded.gated, why = excluded.why;;
