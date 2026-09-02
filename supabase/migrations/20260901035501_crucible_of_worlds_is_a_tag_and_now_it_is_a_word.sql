-- `eff:play-from-graveyard` was declared, wired into ROLE_FACETS.ramp, and fed
-- by NOTHING: 0 cards carried it. The section 10e shape for the fourth time,
-- caught this time by checking every new word against the pool rather than
-- assuming the mapping round had covered it.
--
-- Tagger names the archetype after the card, `crucible-of-worlds`, 19 cards. It
-- fell below the round-three cut because only a couple of its cards were in the
-- gap, which is exactly how a word with two important producers goes unfed:
-- the worklist is ranked by CARDS RESCUED, and Crucible of Worlds (rank 597)
-- and Ramunap Excavator (476) are two cards.
--
-- Ungated: 16 of 18 say "you may play lands from your graveyard" outright, and
-- the other two (Coram, Kagha) are graveyard cards that are not land recursion.
-- That is not "essentially every card", so it fills silence only — which is all
-- that is needed, because both cards it exists for are silent.

insert into public.tag_facet_map (tag_id, slug, facets, confidence, gated, why)
select t.tag_id, t.slug, array['eff:play-from-graveyard']::text[], 'high', false,
       '16 of 18 say "you may play lands from your graveyard". Ungated because two are not land recursion.'
from public.scryfall_tags t
where t.slug = 'crucible-of-worlds'
on conflict (tag_id) do update
  set facets = excluded.facets, gated = excluded.gated, why = excluded.why;;
