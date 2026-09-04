-- APPLIED 5 Sep 2026. Facet compiler 20 -> 21 -> 22: `scope:wipe`.
--
-- A DECK THAT KILLS ITS OWN BOARD. Edgar Markov is a Vampire TRIBAL commander
-- whose whole plan is a board full of Vampires, and his deck came back with
-- BLASPHEMOUS ACT and TOXIC DELUGE among its ten removal spells.
--
-- `scope:all` could not tell Wrath of God from Massacre Wurm: both are a mass
-- effect on creatures, one kills YOUR board and one does not, and that is the
-- difference between a card a go-wide deck wants and a card that beats it. The
-- SELECTOR has carried it all along - Massacre Wurm's is
-- `{sel:'all', where:…, controller:{who:'each-opponent'}}` and Blasphemous
-- Act's has no controller at all. Same defect as `effect.who`, on selectors.
--
-- TWO BUMPS, and the second is the lesson. Version 21 emitted the word for
-- `destroy` only, chosen for precision - and it MISSED BOTH CARDS THAT
-- MOTIVATED IT, because Blasphemous Act deals damage and Toxic Deluge shrinks.
-- Measure a fix against the case that caused it before shipping.
--
--   21   destroy only              13 of the 4,000 most played, 13 correct
--   22   plus mass damage          17 of the 4,000 most played, 17 correct
--                                  96 catalogue-wide
--
-- 17 of 17 read as a player: Blasphemous Act, Austere Command, Damnation,
-- Supreme Verdict, Wrath of God, Vanquish the Horde, Fumigate, Cleansing Nova,
-- Decree of Pain, Fiery Confluence, Blood Money, Day of Judgment, Starfall
-- Invocation, Spiteful Banditry, Starstorm, Deadly Tempest, Final Act.
--
-- The word is emitted where the VERB is known rather than in `readSelector`,
-- because the verb is half the fact: with the selector alone it landed on 108
-- cards and half its destructive members were not wipes - Victimize, Goblin
-- Bombardment, Scapeshift and Eldrazi Monument all SACRIFICE, which is a cost
-- the deck accepts, and Eldrazi Monument is a card a token deck WANTS.
--
-- THE CONSUMER: the second `ATTACKS` entry, and the note there asks for a
-- measurement rather than a guess.
--
--   scope:wipe  attacks  eff:create-token
--
-- It discriminates: Talrand carries the want at 0.90 because he makes Drakes,
-- Edgar and Krenko at 0.30 through their tribe, and Kutzil (voltron) and
-- Sheoldred (control) do not carry it at all - so a control deck keeps its
-- wraths, which is right.
--
-- Toxic Deluge is still not caught. The compiler cannot read "All creatures get
-- -X/-X, where X is the life paid" at all, so its facets come from the tagger
-- and no selector is available. A READING gap, not a classification one.
--
--   set statement_timeout = '20min';
--   refresh materialized view public.cards_pool;
--   vacuum (analyze) public.cards_pool;   -- its own statement, always

create or replace function public.facets(c cards_unique)
 returns text[] language sql stable
as $function$
  select m.facets from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 22;
$function$;

do $$
begin
  if pg_get_viewdef('public.cards_pool'::regclass, true) like '%compiler_version = 22%' then
    raise notice 'cards_pool already joins card_facet_memo at compiler_version 22';
  else
    raise exception 'cards_pool is not on compiler_version 22. Rebuild ALONGSIDE and swap, then VACUUM.';
  end if;
end $$;
