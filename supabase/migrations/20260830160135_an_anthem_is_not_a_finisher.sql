-- An anthem is not a finisher.
--
-- The `finisher` rule accepted any `creatures you control ... get +N/+N`, which
-- is Craterhoof Behemoth and is also Heraldic Banner. Measured on 30 Aug 2026:
-- of the 715 RANKED cards carrying `finisher`, 328 were static anthems --
-- Patchwork Banner, Vanquisher's Banner, Banner of Kinship, Mirari's Wake,
-- Heraldic Banner, Elvish Archdruid, Caged Sun. Forty-six per cent of the pool.
-- Across every printing it is 1,353 of 2,224.
--
-- It was visible in the product, which is how it was found. The deck page's Add
-- tab ranks candidates into the role a deck is shortest of; the deck was short
-- three win conditions, so it offered three mana rocks and a counterspell as
-- win conditions.
--
-- THE TEST IS MAGNITUDE, not duration. A pump wins a game when it is variable
-- (+X/+X, which scales with the board) or big (two or more). A static +1/+1 or
-- +1/+0 is an anthem however long it lasts, and "until end of turn" does not
-- help: a temporary +1/+1 is not a finisher and a permanent +3/+3 is.
--
-- Verified against the deployed function before writing, on seven cards:
--   keeps  Craterhoof Behemoth, Overrun, Elesh Norn, Laboratory Maniac
--   loses  Heraldic Banner, Glorious Anthem, Patchwork Banner
-- The same seven are asserted in `src/engine/knowledge/tagger.test.ts`.
--
-- PATCHED BY SUBSTRING, NOT REGENERATED. CLAUDE.md records why: the deployed
-- `cards_apply_role_tags` carries a revert guard and the `derive_card_tags_memo`
-- indirection that `generate-tagger-sql.ts` has never emitted, and every earlier
-- tagger migration pasted a fresh generation over the top. This changes the one
-- regex it means to change and raises if that regex is not found.

do $$
declare
  v_def  text;
  v_old  text := '(?:(?:you win the game)|(?:(target player|each opponent) loses the game)|(?:creatures you control [^\n]{0,60}get \+(x|\d+)/\+(x|\d+))|(?:creatures you control get \+(x|\d+)/\+(x|\d+))|(?:each opponent loses \d+ life for each))';
  v_new  text := '(?:(?:you win the game)|(?:(target player|each opponent) loses the game)|(?:each opponent loses \d+ life for each)|(?:creatures you control[^.\n]{0,60}get \+x/\+x)|(?:creatures you control[^.\n]{0,60}get \+([2-9]|\d\d)/)|(?:creatures you control[^.\n]{0,60}get \+\d+/\+([2-9]|\d\d)))';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'derive_card_tags';

  if v_def is null then
    raise exception 'public.derive_card_tags does not exist';
  end if;

  if position(v_old in v_def) = 0 then
    raise exception
      'the finisher regex is not the one this migration was written against; read the deployed function and re-derive the patch rather than regenerating the tagger';
  end if;

  -- Also update the note above it, so the function explains itself.
  v_def := replace(
    v_def,
    '-- Mass pump and alternate wins. Craterhoof reaches this through "creatures you control ... get +X/+X".',
    '-- Alternate wins, and a pump that is variable or two or more. A static +1/+1 anthem is not a finisher; see mass-pump.'
  );
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end $$;

-- The memo is keyed on the classifier's INPUTS, and a rule change does not
-- alter an input, so every affected card would keep returning its cached answer
-- for as long as the row lives. Only rows that could contain the tag are
-- touched.
delete from public.card_tag_memo where 'finisher' = any(tags);

-- Rewrite the cards whose answer actually moves.
--
-- `deckmatrix.retag` is required: without it the BEFORE trigger sees tags
-- changing while nothing tags are derived from has changed, and silently
-- reverts. CLAUDE.md records a retag that reported 369 rows updated and changed
-- nothing for exactly this reason.
--
-- `is distinct from` keeps the write to the rows that move: 1,353 printings of
-- 2,224 carrying the tag, rather than all 97,000. `cards` maintains 28 indexes
-- per row written, and the database discipline note in CLAUDE.md exists because
-- a full rewrite of this table makes the app unusable while it runs.
select set_config('deckmatrix.retag', 'on', true);

-- THE RETAG RAN OUTSIDE THIS MIGRATION, IN BATCHES OF 400, and the statement
-- is recorded here because it is the other half of the change.
--
-- It cannot run as one statement: `derive_card_tags` is 109 regexes of plpgsql,
-- and calling it on 2,224 rows to decide and again to write is 4,448 calls,
-- which took the whole migration past `statement_timeout` and rolled the
-- function patch back with it. So the DECISION uses the regex directly, which
-- is an index-free scan of a small set and costs nothing, and the function is
-- called once, only on rows that are going to change.
--
-- Repeat until it reports nothing left. `set_config(..., true)` is
-- transaction-local, so it belongs in EVERY batch; without it the trigger
-- silently reverts each write.
--
--   select set_config('deckmatrix.retag','on',true);
--   with victim as (
--     select id from public.cards
--     where 'finisher' = any(tags)
--       and not (lower(coalesce(oracle_text,'')) ~ '<the new regex above>')
--     limit 400
--   )
--   update public.cards c
--   set tags = public.derive_card_tags(
--     c.name, c.type_line, c.oracle_text, c.keywords, c.mana_cost, c.cmc, c.faces)
--   from victim v where c.id = v.id;
--
-- Measured after: printings carrying `finisher` fell 2,224 -> 914, `wincon`
-- tracked it exactly, and `mass-pump` stayed at 2,025 because an anthem is
-- still mass pump. Spot-checked by name: Craterhoof Behemoth, Overrun, Elesh
-- Norn and Laboratory Maniac keep it; Heraldic Banner, Patchwork Banner and
-- Mirari's Wake lose it.
--
-- 43 rows still match the "should not be a finisher" predicate above and are
-- CORRECT. Every one is multi-face: the pump is on a face, `derive_card_tags`
-- reads `faces` and the raw-`oracle_text` predicate cannot. Checked rather than
-- assumed -- `tags is distinct from derive_card_tags(...)` is zero for all 43,
-- so the column and the function agree.

-- `cards_unique` and `cards_pool` are materialized views over `cards` and still
-- hold the old tags until they are refreshed. The nightly `cards-unique-refresh`
-- job carries this through; nothing here forces it, because that refresh takes
-- roughly 575 seconds and this is not worth taking the pool offline for.
