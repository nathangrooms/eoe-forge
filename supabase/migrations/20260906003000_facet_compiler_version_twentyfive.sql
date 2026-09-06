-- APPLIED 6 Sep 2026. Facet compiler 24 -> 25.
--
-- WHAT CHANGED
--
--   the delayed blink, TIMING FIRST
--     Compiler 24 read "exile X. Return those cards ... at the beginning of the
--     next end step". Wizards writes it the other way round on 15 cards -
--     "exile X. AT THE BEGINNING OF THE NEXT END STEP, return those cards" -
--     and FOURTEEN of the fifteen carried eff:exile-own or eff:exile with NO
--     eff:return-from, so the blink was half read.
--
--   the two-sentence GLUE
--     PHELIA, EXUBERANT SHEPHERD is a blink COMMANDER and could not be read,
--     nor could Semester's End: both are "exile X. At the beginning of the next
--     end step, return it. <rider>", and the rule anchors at the end so the
--     trailing rider made it miss. Glued as a PAIR, the same mechanism impulse
--     draw already uses, so the third sentence goes back through the loop and
--     is honestly left unread - coverage partial, not a false full.
--
--   eff:return-from across the pool   1,770 -> 1,777
--
-- THE ORDER, and step 3 is PLURAL: bump the WRITER (facet-memo-fill), refill
-- (34 calls, 66 s, 33,036 rows), move BOTH readers - public.facets(cards_unique)
-- AND the cards_pool matview join - then delete the old. 23 and 24 kept as the
-- rollback.
--
-- The matview was built ALONGSIDE as cards_pool_next and swapped in one
-- transaction. Verified BEFORE the swap: rows 33,036 = 33,036, columns
-- identical by name/order/type, SIX indexes each, ACL identical, and the change
-- itself present. Built by reading pg_get_viewdef and substituting the version
-- rather than transcribing the definition, which is where the last rebuild's
-- three index mistakes came from.
--
-- ⚠️ SIX INDEXES NOW, not five. cards_pool_name_idx was added on 5 Sep for the
-- commander lookup and a rebuild that recreates only the original five will
-- silently lose it.
--
-- ⚠️ THE SEQUENCE NEEDS SPACING, AND THIS FILE IS THE RECORD OF WHY.
-- Refill, rebuild, refresh and two vacuums ran back to back on an instance that
-- had already taken three outages that day. Afterwards a query with a GOOD plan
-- - bitmap index scan, 709 buffers, ALL cache hits, zero disk reads - measured
-- 15,308 ms, which is CPU starvation and not planning. Production returned 500
-- for some minutes. Each step here is documented as safe on its own; the
-- SEQUENCE is not, and it should be spread out or run when nobody is playing.

create or replace function public.facets(c cards_unique)
 returns text[]
 language sql
 stable
as $function$
  select m.facets
  from public.card_facet_memo m
  where m.oracle_id = c.oracle_id and m.compiler_version = 25;
$function$;

do $$
begin
  if pg_get_viewdef('public.cards_pool'::regclass, true) like '%compiler_version = 25%' then
    raise notice 'cards_pool joins card_facet_memo at compiler_version 25';
  else
    raise exception
      'cards_pool is not on compiler_version 25. Rebuild it ALONGSIDE and swap, '
      'recreating all SIX indexes, then VACUUM (ANALYZE) it as its own statement.';
  end if;
end $$;
