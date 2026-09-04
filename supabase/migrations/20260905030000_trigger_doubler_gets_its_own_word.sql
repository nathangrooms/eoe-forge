-- APPLIED 5 Sep 2026. `trigger-doubler` was flattened into the generic word.
--
-- `eff:multiply` means "doubles a thing" and its population is about half
-- TRIGGER doublers (Panharmonicon, Yarok, Elesh Norn, Teysa Karlov) and half
-- DAMAGE doublers (Fiery Emancipation, Torbran, Gisela, Gratuitous Violence),
-- plus a draw doubler in Alhammarret's Archive.
--
-- So no rule could ask for a trigger doubler without also asking for damage
-- doublers. The blink plan rule asked for `eff:multiply` at 0.5 and Brago, King
-- Eternal's benchmark job "doubling the arrival" - which needs ONE card - sat at
-- zero with his deck holding neither kind.
--
-- Scryfall Tagger has had the precise word all along. Read the WHOLE tag, 39
-- resolved cards: Panharmonicon, Roaming Throne, Yarok, Elesh Norn Mother of
-- Machines, Teysa Karlov, Veyran, Delney, Naban, Harmonic Prodigy, Ancient
-- Greenwarden, Wulfgar, Virtue of Knowledge, Isshin. 39 of 39 correct, no damage
-- doublers at all.
--
-- THE GENERIC WORD IS KEPT ALONGSIDE, so nothing reading `eff:multiply` loses a
-- card. This is the same shape as the `eff:add-counters-self` flattening found
-- earlier the same day: a gated mapping to a BROADER word than the distinction
-- being drawn silently widens the record.
--
-- Consumer, in the same change: the `eff:exile-own` plan rule now asks for
-- `eff:multiply-triggers` at 0.7 instead of `eff:multiply` at 0.5.
--
--   Brago   0 trigger doublers -> Roaming Throne (rank 132)
--
-- REFUSED, measured: mapping `copy-ability` to the same word. It would have
-- closed the benchmark row, since two of that job's four named examples are
-- Strionic Resonator and Lithoform Engine. But half of that tag's 50 cards copy
-- ACTIVATED abilities rather than triggers - Rings of Brighthearth, Illusionist's
-- Bracers, Battlemage's Bracers - which is about 50% precision against the 85%
-- bar these role-affecting words are held to.
--
-- No compiler version bump: the tag merge lives in the `cards_pool` view.
--
--   set statement_timeout = '20min';
--   refresh materialized view public.cards_pool;
--   vacuum (analyze) public.cards_pool;   -- its own statement, always

update public.tag_facet_map
set facets = array['eff:multiply', 'eff:multiply-triggers']
where slug = 'trigger-doubler';

do $$
declare n int;
begin
  select cardinality(facets) into n from public.tag_facet_map where slug = 'trigger-doubler';
  if n is null then raise exception 'trigger-doubler is not in tag_facet_map'; end if;
  raise notice 'trigger-doubler maps to % facets', n;
end $$;
