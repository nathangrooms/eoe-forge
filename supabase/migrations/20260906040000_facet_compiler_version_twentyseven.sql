-- APPLIED 6 Sep 2026. Facet compiler 26 -> 27: the board wipes the engine could
-- not see.
--
-- WHY. Edgar Markov - MARDU, the three best removal colours in Magic - came back
-- with exactly ONE card bucketed as removal, and it was TOXIC DELUGE: a
-- symmetric board wipe, in a go-wide Vampire deck, taken by the popularity
-- filler. `worksAgainstPlan` exists to refuse precisely that and could not see
-- it.
--
-- THREE CAUSES, all found by reading what the card COMPILES TO rather than the
-- code that took it.
--
--   1. `-X/-X` DID NOT PARSE. The pump rule required `[+-]\d+`, so "All
--      creatures get -X/-X until end of turn" - the whole of Toxic Deluge, rank
--      67 - compiled to NOTHING. Its `eff:shrink` in the pool came from the tag
--      merge, not from us. X is an expression and its SIGN is still known:
--      refusing to guess the MAGNITUDE is right, refusing to read the MINUS left
--      the clause unread. `-X` is `{v:'sub', a:0, b:{v:'x'}}`, which the DSL has
--      always been able to say.
--
--   2. `scope:wipe` WAS `destroy` ONLY. Its note gave the reason as "-X/-X
--      sweepers' selectors are frequently players" - but `sweepsYourBoardToo` IS
--      the test for that, so the selector guard already refused those and the
--      verb never needed to.
--
--   3. A COMPOUND FILTER. "each OTHER creature" is `{is:'and', of:[type
--      creature, other]}`, and the flat test took only a bare type, so MASSACRE
--      GIRL was not a wipe.
--
-- ⚠️ THE FIRST VERSION OF (3) USED `some` AND WAS WRONG, caught by reading the
-- 182 cards it claimed before the swap. Any `and` containing a creature type
-- passed, so every FILTERED wipe became a symmetric one - and a filtered wipe is
-- usually the card a go-wide deck most wants: Elspeth Sun's Champion (power 4 or
-- greater), Hour of Reckoning (NONTOKEN creatures), Olivia's Wrath (NON-VAMPIRE
-- creatures), Dusk // Dawn. It is `every` now, with only the source exclusion
-- treated as benign. 278 wrongly-marked cards became 153.
--
--   scope:wipe in the pool   96 -> 153
--   read as a player         17 of the 18 most played additions correct
--   symmetric wipes marked   Toxic Deluge, Massacre Girl, Languish, Meathook
--   sparing wipes refused    Massacre Wurm, Doomwake Giant, Elspeth, Hour of
--                            Reckoning, Olivia's Wrath, Dusk // Dawn
--
-- THE ORDER, and step 3 is PLURAL: bump the WRITER (facet-memo-fill), refill
-- (34 calls, 33,036 rows), move BOTH readers - `public.facets(cards_unique)` AND
-- the `cards_pool` join - then delete the old. 21-25 removed; 26 kept as the
-- rollback.
--
-- Built ALONGSIDE as `cards_pool_next` and swapped in one transaction. Verified
-- BEFORE the swap: rows equal at 33,036, columns identical by `pg_attribute`
-- (NOT `information_schema.columns`, which does not list materialized views and
-- silently answered 0 of 0), SIX indexes including `cards_pool_name_idx`, ACL
-- identical, and the specific change present.
--
-- ⚠️ `vacuum (analyze) public.cards_pool` AS ITS OWN STATEMENT, immediately.
-- A rebuilt matview has no visibility map and the generator's own pool query
-- returned 57014 after a previous swap. VACUUM cannot run inside a transaction
-- block and a multi-statement command IS one.
--
--   eighteen shells   keyed 1312 -> 1307, packages and named IDENTICAL
--   twenty commanders 45/71 -> 44/71 jobs, 6 groups at zero UNCHANGED, and
--                     nothing new fell to NONE
--   192 real decks    183/200 role checks in range, UNCHANGED
--   production        Edgar, Najeela, Krenko all 200 in 2-5 s, and Edgar no
--                     longer holds Toxic Deluge
--
-- The two instrument numbers fell slightly and the real-deck yardstick did not.
-- Neither can see the fault this fixes: `keyed` counts cards the commander
-- wanted, and a wipe that was keyed and is now refused makes it fall.

create or replace function public.facets(c cards_unique)
 returns text[]
 language sql
 stable
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 27;
$function$;

do $$
begin
  if pg_get_viewdef('public.cards_pool'::regclass, true) like '%compiler_version = 27%' then
    raise notice 'cards_pool joins card_facet_memo at compiler_version 27';
  else
    raise exception
      'cards_pool is not on compiler_version 27. Rebuild it ALONGSIDE and swap, '
      'then VACUUM it as its own statement - see the header of this file.';
  end if;
end $$;
