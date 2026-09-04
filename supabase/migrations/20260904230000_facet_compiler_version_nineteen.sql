-- APPLIED 4 Sep 2026. Facet compiler 18 -> 19: three grammar gaps.
--
-- WHAT CHANGED IN THE COMPILER
--
-- All three made a card compile to NOTHING rather than lose one clause,
-- because a null selector fails the whole rule it appears in.
--
--   "and/or" is "or"        `parseObject` read "target artifacts and
--                           enchantments" and "target artifacts or
--                           enchantments" and returned null for "and/or",
--                           the same set of cards said a third way.
--                           Ghostly Flicker #587 manual -> FULL and carrying
--                           eff:exile-own; Force of Vigor #1024 and Mondrak
--                           #426 went from nothing to a verb each.
--
--   "one or more X"         a lower bound, refused by the quantifier parser.
--                           Wizards writes a trigger's subject that way
--                           whenever the event can happen to several things.
--                           NOT marked countBounded: that flag means "exactly
--                           this many", which is the opposite claim.
--
--   "with power N or less"  the DSL member has always been
--                           {is:'power'|'toughness'|'mana-value'} and only the
--                           parser was narrower than the type it builds.
--                           Garruk's Uprising #90 went from nothing to
--                           trig:enters, eff:draw and grants:trample.
--
--   read the whole card   10,988 -> 11,070      unread clauses  20,799 -> 20,681
--   eff:exile-own on      105 -> 108 pool cards
--
-- THE ORDER, and step 3 is PLURAL
--
--   1. bump the WRITER          facet-memo-fill COMPILER_VERSION 18 -> 19,
--                               deployed, walk run to completion: 34 calls, 70s
--   2. both versions coexist    primary key is (oracle_id, compiler_version)
--   3. move EVERY reader        `cards_pool`'s join AND public.facets(cards_unique)
--   4. delete the old           compiler_version 17 removed; 18 KEPT as the
--                               rollback, since setting both pins back to 18
--                               undoes this with no refill
--
-- THE MATVIEW WAS REBUILT ALONGSIDE AND SWAPPED, never dropped and recreated:
-- CREATE populates while holding ACCESS EXCLUSIVE on the name, so every reader
-- blocks and then dies on its own statement_timeout. Verified BEFORE the swap -
-- rows equal at 33,035, 15 columns with the same names order and types (from
-- pg_attribute; matviews are NOT in information_schema.columns), 5 indexes
-- copied from pg_indexes, ACL byte-identical - and `analyze` in the same
-- statement, because a rebuilt matview has zero column statistics.
--
-- Applied through `execute_sql`, so it carries no version in
-- `supabase_migrations.schema_migrations`. Written to be idempotent: the
-- function is `create or replace`, and the check below only reports.

create or replace function public.facets(c cards_unique)
 returns text[]
 language sql
 stable
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 19;
$function$;

do $$
begin
  if pg_get_viewdef('public.cards_pool'::regclass, true) like '%compiler_version = 19%' then
    raise notice 'cards_pool already joins card_facet_memo at compiler_version 19';
  else
    raise exception
      'cards_pool is not on compiler_version 19. Rebuild it ALONGSIDE and swap - '
      'see the header of this file. A drop-and-create takes the generator down '
      'for the length of the populate.';
  end if;
end $$;
