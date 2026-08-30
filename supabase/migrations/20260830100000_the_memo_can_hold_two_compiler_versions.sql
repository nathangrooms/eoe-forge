-- ============================================================================
-- The memo could only ever hold ONE compiler version, so the documented
-- upgrade order did not do what it claimed. 30 Aug 2026.
--
-- The procedure written into CLAUDE.md that morning was:
--
--   bump the WRITER first, refill, and only then move the readers, so there is
--   no window where every card reads as having no facets
--
-- That is false, and the primary key is why. `card_facet_memo_pkey` was UNIQUE
-- on `oracle_id` ALONE, and `facet-memo-fill` upserts with
-- `onConflict: 'oracle_id'`. So writing a card at version 3 DESTROYED its
-- version 2 row, and from that instant a reader filtering
-- `compiler_version = 2` found nothing for it.
--
-- The window was therefore real and it grew for the whole refill: 68 seconds
-- during which a rising fraction of the catalogue read as having NO FACETS to
-- the deployed generator. That is the exact silent failure the version number
-- exists to prevent, arriving through the mechanism meant to prevent it. It was
-- survivable at 68 seconds and would not be on a bigger catalogue or a slower
-- compiler.
--
-- Two ways to make it true. Accept the window and refill at a quiet hour, or
-- let both versions coexist. The second is taken, because a procedure that is
-- correct only when nobody is looking is not a procedure. The table is 23 MB
-- over 33,032 rows, so a second version costs about that again and is deleted
-- as soon as the readers have moved.
-- ============================================================================

-- The key is (card, version), which is what the memo has always MEANT: the
-- answer this compiler gives for this card. `oracle_id` alone said "the answer
-- for this card", which cannot be true of a cache with a version in it.
alter table public.card_facet_memo
  drop constraint if exists card_facet_memo_pkey;

alter table public.card_facet_memo
  add constraint card_facet_memo_pkey primary key (oracle_id, compiler_version);

-- `card_facet_memo_version_oracle_idx` is (compiler_version, oracle_id) and was
-- carrying the reader lookups. The new primary key is (oracle_id,
-- compiler_version), which cannot serve a `where compiler_version = N` scan on
-- its own, so that index stays and is not redundant.

comment on table public.card_facet_memo is
  'Facets per card per compiler version. The PRIMARY KEY is (oracle_id, '
  'compiler_version) so two versions can coexist: bump the writer, refill, move '
  'the readers, then delete the old version. With a key on oracle_id alone the '
  'refill deleted the version the readers were still on, one card at a time.';
