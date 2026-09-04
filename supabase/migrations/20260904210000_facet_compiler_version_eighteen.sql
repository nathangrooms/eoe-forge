-- APPLIED 4 Sep 2026. Facet compiler 17 -> 18: the trigger direction split.
--
-- WHAT CHANGED IN THE COMPILER
--
-- `readTriggerDirection` in `src/lib/deck/recommend/behaviour.ts` reads three
-- fields the DSL has always carried and the facet layer always threw away:
--
--   {on:'cast',  what, by}     -> trig:cast-own / trig:cast-opponent
--   {on:'enters', who}         -> trig:enters-self / trig:enters-other
--   {on:'step',  step, whose}  -> trig:step:<step>
--
-- The base facet is still always emitted, so nothing reading `trig:cast` loses
-- anything, and an absent field adds no word rather than guessing - guessing is
-- what produced the 574 misfiled cards the `effect.who` split had to undo.
--
-- Written on 33,035 cards: trig:enters-self 4,425, trig:enters-other 775,
-- trig:cast-own 645, trig:cast-opponent 83.
--
-- WHY IT WAS WORTH A VERSION BUMP
--
-- `scripts/probe/silent-facets.mjs` measured 1,627 of 3,363 commanders (48%)
-- reaching a plan with two or fewer loud wants, which meant the loudest thing
-- in the plan was the protection floor every creature commander gets so that
-- Swiftfoot Boots can be chosen. `trig:enters`, `trig:cast` and `trig:step`
-- were three of the top four rows and all three had been REFUSED as plan rules,
-- because one flattened word names two opposite decks: Ghalta triggers on
-- herself and wants to be blinked, Tatyova triggers on a land and wants lands.
--
-- THE ORDER, and step 3 is PLURAL
--
--   1. bump the WRITER            facet-memo-fill COMPILER_VERSION 17 -> 18,
--                                 deployed, then the walk run to completion:
--                                 34 calls, 69 seconds, 33,035 rows
--   2. both versions coexist      the primary key is (oracle_id, compiler_version)
--   3. move EVERY reader          `cards_pool`'s join AND `public.facets(cards_unique)`
--   4. delete the old             compiler_version 16 removed; 17 KEPT as the
--                                 rollback, since setting both pins back to 17
--                                 undoes the move with no refill
--
-- Missing one reader is not an error, it is two answers. That happened on the
-- 16 -> 17 move and was found by review rather than by anything failing.
--
-- HOW THE MATVIEW WAS REBUILT, WITHOUT AN OUTAGE
--
-- Never `drop` then `create` a matview the product reads: CREATE populates
-- while holding ACCESS EXCLUSIVE on the name, so every reader blocks and then
-- dies on its own statement_timeout. Built alongside as `cards_pool_next`,
-- indexed, granted, refreshed, and swapped in one transaction that takes
-- milliseconds. Everything before the swap is invisible and is undone by
-- dropping `cards_pool_next`.
--
-- VERIFIED BEFORE THE SWAP, not after:
--   rows      33,035 both sides
--   columns   15, same names, same order, same types (pg_attribute - matviews
--             are NOT in information_schema.columns)
--   indexes   5, copied from pg_indexes rather than guessed
--   grants    ACL byte-identical to the live view
--   unchanged eff:create-token 3,138 both sides, knowledge_band 'nothing' 324
--             both sides - only the new trigger words differ
-- and afterwards `analyze public.cards_pool`, because a rebuilt matview has
-- ZERO column statistics and the planner chooses badly until it is analysed.
--
-- This file records what was applied through `execute_sql`, so it carries no
-- version in `supabase_migrations.schema_migrations`. It is written to be
-- idempotent and safe to re-run: the function is `create or replace`, and the
-- matview block does nothing when the join is already on 18.

create or replace function public.facets(c cards_unique)
 returns text[]
 language sql
 stable
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 18;
$function$;

do $$
begin
  if pg_get_viewdef('public.cards_pool'::regclass, true) like '%compiler_version = 18%' then
    raise notice 'cards_pool already joins card_facet_memo at compiler_version 18';
  else
    raise exception
      'cards_pool is not on compiler_version 18. Rebuild it ALONGSIDE and swap - '
      'see the header of this file. A drop-and-create takes the generator down '
      'for the length of the populate.';
  end if;
end $$;
