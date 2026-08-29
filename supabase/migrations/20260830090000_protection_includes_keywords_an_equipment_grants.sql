-- ============================================================================
-- Protection includes the keywords an Equipment or Aura GRANTS.
--
-- Swiftfoot Boots and Lightning Greaves are EDHREC rank 12 and 13, the two
-- most-played protection cards in Commander, and they carried NO ROLE AT ALL.
-- `ROLE_TAGS.interaction` reads the `protection` tag, and the protection rule
-- matched "gains hexproof" and "creatures you control have hexproof" but not
-- "Equipped creature has hexproof", which is what those cards actually say. So
-- every role quota in the deck builder was blind to them, and six generated
-- decks measured on 2026-08-30 were missing both.
--
-- The note on the rule stays true and is the reason the pattern is narrow: a
-- creature born with hexproof is not protecting anything but itself. "Equipped
-- creature" and "enchanted creature" appear only on cards that attach to
-- something else, so the reading cannot widen past cards that grant it.
--
-- Measured before applying, over cards_unique: 104 cards match, 14 already
-- carried the tag, 90 gain it. The TypeScript tagger independently found 88 on
-- the same corpus; the difference is multi-face cards whose text the SQL reads
-- out of card_faces. Nothing loses the tag.
--
-- ---------------------------------------------------------------------------
-- WHY THIS PATCHES THE FUNCTION INSTEAD OF REPLACING IT
-- ---------------------------------------------------------------------------
--
-- Every other tagger migration pastes the whole generated body from
-- `scripts/generate-tagger-sql.ts`, and that is normally right: one generator,
-- one source of truth, no hand-edited SQL.
--
-- It is not right here, and the reason is worth keeping. The deployed function
-- and a freshly generated one are NOT byte-identical: measured 2026-08-30, the
-- deployed body is 24,977 characters over 328 lines and the generated one is
-- 24,980 over 323. Three characters and five line breaks apart. The tag
-- vocabularies were compared and are identical, all 109 of them, with nothing
-- gained and nothing lost, so the difference is formatting rather than a rule.
--
-- But "probably just formatting" is not a safe thing to act on when the body
-- contains a 4,000-character single-line regex listing every creature type in
-- Magic. Re-emitting that by hand to change one alternative risks silently
-- breaking tribal tagging on 34,000 cards, and a one-character slip inside it
-- would not fail loudly. It would just quietly stop matching Dwarves.
--
-- So this replaces exactly the substring it means to and nothing else, and
-- RAISES if the anchor is not found or is not unique. Verified before writing:
-- the anchor appears exactly once and the new alternative appears zero times.
--
-- The generator stays the source of truth. The next full regeneration will
-- carry this rule, because it was added to TAG_RULES in
-- src/engine/knowledge/tagger.ts first and the SQL was generated from it; the
-- alternative inserted below was lifted from that generated output verbatim.
-- ============================================================================

do $$
declare
  v_src     text;
  v_new     text;
  v_anchor  text := '|(?:(creatures|permanents|artifacts|enchantments) you control (have|gain) (hexproof';
  v_insert  text := '|(?:(equipped|enchanted) creature (has|gains|gets) [^\n]{0,40}(hexproof|indestructible|shroud|protection from|ward))';
  v_hits    integer;
begin
  select prosrc into strict v_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'derive_card_tags';

  if position(v_insert in v_src) > 0 then
    raise notice 'already applied, nothing to do';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
  if v_hits <> 1 then
    raise exception 'expected the protection anchor exactly once, found %', v_hits;
  end if;

  v_new := replace(v_src, v_anchor, v_insert || v_anchor);

  execute format(
    'create or replace function public.derive_card_tags(' ||
    '  p_name text, p_type_line text, p_oracle_text text, p_keywords text[],' ||
    '  p_mana_cost text, p_cmc numeric, p_faces jsonb' ||
    ') returns text[] language plpgsql immutable parallel safe as %L',
    v_new
  );
end $$;

-- ---------------------------------------------------------------------------
-- Retag only what this change touches.
--
-- A full retag of 97,140 printings maintains 28 indexes and is what took this
-- database down twice. The rule is purely additive, so the affected set is
-- exactly the rows the new pattern matches, and it is small.
--
-- TWO THINGS HERE ARE NOT OPTIONAL, and I got both wrong first by reading the
-- repo instead of the database. The generated file's version of
-- `cards_apply_role_tags` recomputes on a source-column change and does nothing
-- else. THE DEPLOYED TRIGGER IS NOT THAT FUNCTION. It carries a branch the
-- generator has never emitted:
--
--     elsif new.tags is distinct from old.tags
--           and coalesce(current_setting('deckmatrix.retag', true), '') <> 'on'
--     then new.tags := old.tags;
--
-- so any write to `tags` that does not first set `deckmatrix.retag` is silently
-- reverted. The first attempt reported 369 rows updated and changed nothing.
-- The deployed trigger also calls `derive_card_tags_memo`, not
-- `derive_card_tags`; the memo is keyed on a hash of the classifier's inputs,
-- which this change does not alter, so every affected card's cached answer is
-- now stale and has to be deleted or the next sync writes the old tags back.
--
-- Both of those would have been DESTROYED by pasting the freshly generated
-- migration over the top, which is what every previous tagger migration did.
-- That is the second reason this one patches instead of replacing, and it is a
-- stronger reason than the first: the generator and the database have diverged
-- on the trigger, not just on formatting, and the divergence is load-bearing.
-- Regenerating the tagger wholesale needs that reconciled first.
-- ---------------------------------------------------------------------------
do $$
declare
  v_memo integer;
  v_rows integer;
begin
  perform set_config('deckmatrix.retag', 'on', true);

  delete from public.card_tag_memo m
   where m.input_hash in (
     select public.card_tag_input_hash(
       c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces)
     from public.cards c
     where lower(coalesce(c.oracle_text, '')) ~
       '(equipped|enchanted) creature (has|gains|gets) [^\n]{0,40}(hexproof|indestructible|shroud|protection from|ward)'
   );
  get diagnostics v_memo = row_count;

  update public.cards c
     set tags = public.derive_card_tags(
       c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces
     )
   where lower(coalesce(c.oracle_text, '')) ~
     '(equipped|enchanted) creature (has|gains|gets) [^\n]{0,40}(hexproof|indestructible|shroud|protection from|ward)'
     and not (c.tags @> array['protection']);

  get diagnostics v_rows = row_count;
  raise notice 'stale memo rows removed %, printings retagged %', v_memo, v_rows;
end $$;

-- Applied 2026-08-30: 369 printings retagged, Swiftfoot Boots across all 44 of
-- its printings and Lightning Greaves across all 52. Two rows still match the
-- raw predicate above and correctly do NOT get the tag (Charmed Clothier,
-- Redtooth Genealogist): their only match is inside REMINDER text, which the
-- classifier strips before matching and this WHERE clause does not.
--
-- `cards_unique` is a materialized view and does not see any of this until it
-- is rebuilt, which is where the deck builder actually reads from. A refresh
-- was requested through `refresh_cards_unique(false)` rather than run here: the
-- last one took 575 seconds and the cron job `cards-unique-refresh` (06:00 and
-- 12:00) has no statement timeout. Running it from a request that does is how
-- you get a cancelled rebuild.

-- ---------------------------------------------------------------------------
-- The two things this fixes, measured before and after on six generated decks:
-- every one of them was missing both Swiftfoot Boots and Lightning Greaves,
-- because `ROLE_TAGS.interaction` reads `protection` and neither card had any
-- role at all.
-- ---------------------------------------------------------------------------
