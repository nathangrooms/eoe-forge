-- The sync kept dying with 57014 even after batches were cut to 25 rows and
-- given four halvings of retry. A two-row upsert cannot take eight seconds on
-- its own merits, so the cost was not in the rows.
--
-- GIN `fastupdate` is on by default. New index entries go into a pending list
-- instead of the tree, and when that list passes gin_pending_list_limit (4 MB
-- by default) the NEXT statement to insert pays for merging the whole thing.
-- Most writes are very fast and one is enormous, and which one is arbitrary.
-- That is the shape of the failure: pages flowing normally, then a single batch
-- cancelled, then the same again after the resume.
--
-- `cards` carries eight GIN indexes and the sync writes 96,732 rows through
-- them in one pass. idx_cards_oracle_text_trgm alone is 32 MB, the largest
-- index on the table, because it tokenises every card's rules text into
-- trigrams.
--
-- fastupdate off means every insert goes straight into the tree: slightly more
-- work per row, no ambush. Under a hard eight-second statement timeout,
-- predictable and slightly slower beats fast-with-a-cliff, because the cliff
-- does not merely slow the sync down, it fails the page and costs a resume.
--
-- HONEST CAVEAT: this was not isolated from the other thing happening at the
-- same time. The failing window also contained another process running
-- CREATE INDEX CONCURRENTLY on `cards` and a `statement_timeout = 0` function
-- scanning it for four minutes. Either could starve an eight-second write on a
-- shared instance. This change is sound regardless and costs little, but it is
-- not proven to be the sole cause.
--
-- Apply with the catalogue sync stopped and no CREATE INDEX CONCURRENTLY in
-- flight on `cards`. Each ALTER needs SHARE UPDATE EXCLUSIVE on the table.
-- Applied 2026-08-19 with `set lock_timeout = '60s'`, which is what finally got
-- it past an in-progress `autovacuum: ANALYZE public.cards`; a 15-second wait
-- gave up before autovacuum yielded.
--
-- The existing pending lists drain separately, one index at a time:
-- `select gin_clean_pending_list('public.<index>')`. Doing all eight in one
-- transaction is itself the long statement this change exists to avoid.
alter index public.idx_cards_oracle_text_trgm set (fastupdate = off);
alter index public.idx_cards_name_trgm        set (fastupdate = off);
alter index public.cards_type_line_trgm_idx   set (fastupdate = off);
alter index public.idx_cards_tags             set (fastupdate = off);
alter index public.idx_cards_color_identity   set (fastupdate = off);
alter index public.idx_cards_colors           set (fastupdate = off);
alter index public.idx_cards_legalities       set (fastupdate = off);
alter index public.cards_keywords_idx         set (fastupdate = off);
