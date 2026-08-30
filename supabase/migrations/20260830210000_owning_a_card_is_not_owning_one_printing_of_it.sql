-- Deck ownership is a question about a CARD, not about one printing of it.
--
-- `compute_deck_summary` decided what you own with
--
--     LEFT JOIN user_collections uc ON uc.card_id = dc.card_id
--
-- which is a join on the PRINTING id, and then counted the deck's whole
-- required quantity as owned the moment any row matched:
--
--     SUM(CASE WHEN uc.card_id IS NOT NULL THEN dc.quantity ELSE 0 END)
--
-- Two faults pulling in opposite directions, so the error was not even
-- consistently in one direction.
--
-- WHY IT MATTERS MORE NOW THAN IT USED TO. Until 19 Aug 2026 the catalogue
-- held one printing per card, so a printing id and a card were nearly the
-- same thing and this join nearly worked. `cards` now holds every printing
-- (see CLAUDE.md 6.3), so the deck listing the Commander Legends Sol Ring
-- and the collection holding the Revised one are two different ids for one
-- card, and the deck page says you do not own it.
--
-- Measured on this database before the change: of 16 deck rows whose card the
-- owner genuinely holds, 4 were reported missing. 25%, on the number the deck
-- tile draws as "Missing", "Complete" and "Collection progress".
--
-- The second fault has not bitten yet only because the collections are small:
-- owning one Forest marked all ten a deck asked for as owned.
--
-- WHAT THIS DOES. Resolves both sides to `oracle_id` and takes the smaller of
-- what the deck asks for and what you hold, so ten Forests needed against
-- three owned is three. `least()` also stops a spare box of Sol Rings pushing
-- a deck over 100% owned.
--
-- WHY A SUBSTRING PATCH. The same reason the tagger migrations give: the
-- deployed function is the authority, not the repo file, and regenerating
-- wholesale would overwrite anything the deployed copy carries that the repo
-- does not. The two were checked against each other on this block first and
-- match exactly. It raises rather than silently doing nothing if the anchor
-- has moved.
--
-- COST. Measured with EXPLAIN (ANALYZE, BUFFERS) against the real 100-card
-- deck: 2.2 ms, 651 buffers, every one a shared hit and no reads. Index scans
-- on `cards_pkey` for both sides. The old form was one join; this is one pass
-- over the caller's own collection plus that.

do $patch$
declare
  src  text;
  next text;
  old_block constant text :=
$old$        SELECT
            COALESCE(SUM(CASE WHEN uc.card_id IS NOT NULL THEN dc.quantity ELSE 0 END), 0),
            CASE WHEN SUM(dc.quantity) > 0 THEN
                (SUM(CASE WHEN uc.card_id IS NOT NULL THEN dc.quantity ELSE 0 END)::numeric / SUM(dc.quantity)::numeric) * 100
            ELSE 0 END
        INTO owned_count, owned_pct
        FROM deck_cards dc
        LEFT JOIN user_collections uc ON uc.card_id = dc.card_id AND uc.user_id = auth.uid()
        WHERE dc.deck_id = compute_deck_summary.deck_id;$old$;
  new_block constant text :=
$new$        WITH owned AS (
            SELECT ucc.oracle_id,
                   SUM(COALESCE(uc.quantity, 0) + COALESCE(uc.foil, 0)) AS have
            FROM user_collections uc
            JOIN cards ucc ON ucc.id = uc.card_id
            WHERE uc.user_id = auth.uid()
              AND ucc.oracle_id IS NOT NULL
            GROUP BY ucc.oracle_id
        )
        SELECT
            COALESCE(SUM(LEAST(dc.quantity, COALESCE(o.have, 0))), 0),
            CASE WHEN SUM(dc.quantity) > 0 THEN
                (COALESCE(SUM(LEAST(dc.quantity, COALESCE(o.have, 0))), 0)::numeric
                 / SUM(dc.quantity)::numeric) * 100
            ELSE 0 END
        INTO owned_count, owned_pct
        FROM deck_cards dc
        LEFT JOIN cards dcc ON dcc.id = dc.card_id
        LEFT JOIN owned o ON o.oracle_id = dcc.oracle_id
        WHERE dc.deck_id = compute_deck_summary.deck_id;$new$;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'compute_deck_summary'
    and pg_get_function_identity_arguments(p.oid) = 'deck_id uuid';

  if src is null then
    raise exception 'public.compute_deck_summary(uuid) not found';
  end if;

  -- Already patched. Said rather than raised, because a migration that fails
  -- on its second run is a migration that breaks `supabase db push`, and this
  -- project already carries version numbers recorded in two places.
  if position(new_block in src) > 0 then
    raise notice 'compute_deck_summary already resolves ownership by oracle_id; nothing to do';
    return;
  end if;

  if position(old_block in src) = 0 then
    raise exception
      'the ownership block in compute_deck_summary has moved; read the deployed function before patching it again';
  end if;

  next := replace(src, old_block, new_block);
  execute next;
end
$patch$;

comment on function public.compute_deck_summary(uuid) is
  'Deck summary. Ownership resolves both the deck row and the collection row to oracle_id, so any printing of a card counts, and takes least(required, held) so one copy does not cover ten.';
