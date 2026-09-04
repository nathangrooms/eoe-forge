-- APPLIED 5 Sep 2026. Facet compiler 19 -> 20: two words the compiler tripped on.
--
-- WHAT CHANGED
--
--   "Choose one."       The Commander "Will" cycle writes its modal head with a
--                       FULL STOP and a following sentence instead of the
--                       classic em-dash: "Choose one. If you control a commander
--                       as you cast this spell, you may choose both instead."
--                       The head regex required the dash, so the whole card was
--                       refused. JESKA'S WILL (rank 104) and AKROMA'S WILL (rank
--                       189) compiled to NOTHING. 17 cards use this wording.
--
--   "tapped"            "Create thirteen TAPPED 2/2 black Zombie creature
--                       tokens" refused because the count had to sit
--                       immediately against the power and toughness. `tapped`
--                       is a field the DSL has always carried on create-token,
--                       so reading it is exact. "tapped AND ATTACKING" is still
--                       refused - there is no `attacking` field and half of
--                       that fix is worse than none.
--
--   read the whole card   11,069 -> 11,090      unread clauses  20,681 -> 20,556
--
-- THE ORDER, and step 3 is PLURAL: bump the WRITER (facet-memo-fill), refill
-- (34 calls, 67 s, 33,035 rows), move BOTH readers (`cards_pool`'s join AND
-- `public.facets(cards_unique)`), then delete the old. 18 removed; 19 kept as
-- the rollback.
--
-- Built ALONGSIDE as `cards_pool_next` and swapped in one transaction. Verified
-- before the swap: rows equal, 15 columns same names order and types, 5 indexes,
-- ACL identical, whole-card 11,070 -> 11,090 and the blind count unchanged.
--
-- ⚠️ VACUUM IMMEDIATELY AFTER THE SWAP, NOT JUST ANALYZE.
--
-- A rebuilt materialized view has no visibility map, so every index-only scan
-- falls back to the heap. `analyze` ran inside the swap statement and was NOT
-- enough: the very next commander query - `cards_pool` filtered on
-- `commander_legal` and walked by rank - returned 57014, a statement timeout,
-- against the 3 s cap the anon role carries. That is the GENERATOR'S OWN POOL
-- QUERY, so between the swap and the scheduled `cards-pool-vacuum` at 07:05 a
-- real player's build would have failed.
--
-- `vacuum (analyze) public.cards_pool;` as its OWN statement fixed it at once.
-- It cannot be folded into the swap: VACUUM refuses to run inside a transaction
-- block, and a multi-statement command IS one.

create or replace function public.facets(c cards_unique)
 returns text[]
 language sql
 stable
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 20;
$function$;

do $$
begin
  if pg_get_viewdef('public.cards_pool'::regclass, true) like '%compiler_version = 20%' then
    raise notice 'cards_pool already joins card_facet_memo at compiler_version 20';
  else
    raise exception
      'cards_pool is not on compiler_version 20. Rebuild it ALONGSIDE and swap, '
      'then VACUUM it as its own statement - see the header of this file.';
  end if;
end $$;
