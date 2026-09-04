-- APPLIED 4 Sep 2026. The SECOND reader of the facet memo, moved to 17.
--
-- `public.facets(c cards_unique)` is a computed column: `cards_unique.facets`
-- calls it, and it selects from `card_facet_memo` at a PINNED compiler version.
-- It is the second of the two readers CLAUDE.md names, and when `cards_pool`
-- was rebuilt earlier today its join moved to 17 while this function was left
-- on 16.
--
-- That is the exact silent divergence the version number exists to prevent, and
-- I introduced it. `cards_pool.facets` read the v17 memo while
-- `cards_unique.facets` read v16, so the same card answered "what do you do"
-- two different ways depending on which object was asked. Nothing errors. The
-- generator reads `cards_pool` and was correct; anything reading
-- `cards_unique.facets` - probes, ad-hoc SQL, `landPoolFor`'s sibling paths -
-- was a compiler version behind, and would have stayed behind indefinitely.
--
-- Found by an adversarial review of the rebuild, not by anything failing.
--
-- THE ORDER THAT MAKES A BUMP SAFE, restated because half of it was done:
--
--   1. bump the WRITER            facet-memo-fill's COMPILER_VERSION
--   2. refill                     both versions coexist; the primary key is
--                                 (oracle_id, compiler_version)
--   3. move EVERY reader          `cards_pool`'s join AND this function
--   4. only then delete the old   `delete from card_facet_memo
--                                  where compiler_version = <old>`
--
-- Step 3 is plural. Missing one of them is not an error, it is two answers.
--
-- Verified after: both readers report `eff:create-token` for Batterskull and
-- Tireless Tracker and neither reports it for Sol Ring; 33,035 rows in
-- `cards_pool` and 33,035 at v17 in the memo; 14 of 14 deployed decks build.
--
-- compiler_version 16 is deliberately LEFT IN PLACE for now. It costs storage
-- and nothing else, and it is the rollback: setting both pins back to 16 undoes
-- the whole move without a refill.

create or replace function public.facets(c cards_unique)
 returns text[]
 language sql
 stable
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 17;
$function$;
