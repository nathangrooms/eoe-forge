-- The deck generator timed out in production and never reached a player.
--
-- catalog.ts walks the candidate pool by keyset: `order=id.asc` with a cursor,
-- 1000 rows a page. The six partial legality indexes were keyed on the legality
-- EXPRESSION itself under a predicate pinning that expression to 'legal', so
-- every entry in each index held the same key. An index whose key is a constant
-- can act as a filtered row set and nothing else: it cannot answer a lookup and
-- it cannot supply an order. So `order by id` had to sort, a sort has to see
-- every row before it can yield the first, and the LIMIT could never terminate
-- early.
--
-- Measured on cards_unique, four-colour commander pool, before:
--   Sort (top-N heapsort) over 31,829 rows, Buffers: hit=4 read=9826, 13.7 s
-- against a 3 s statement_timeout. Cold that is 78 MB off disk for 1000 rows.
--
-- Keying the same partial indexes on `id` gives the walk its order directly:
--   Index Scan using cards_unique_commander_id_idx, no sort
--   1,252 rows scanned for 1,000 returned, Buffers: hit=1252 read=11, 25 ms
--
-- 8x less I/O, and the LIMIT stops as soon as it has a page.
--
-- Nothing is lost by dropping the old ones. Their key carried no information,
-- so any plan that used them is served by these, which carry the ordering too.

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['commander','legacy','modern','pauper','pioneer','standard','vintage'] LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS cards_unique_%s_id_idx ON public.cards_unique (id) WHERE (legalities ->> %L) = ''legal''',
      f, f);
    EXECUTE format('DROP INDEX IF EXISTS public.cards_unique_legal_%s_idx', f);
  END LOOP;
END $$;

ANALYZE public.cards_unique;
