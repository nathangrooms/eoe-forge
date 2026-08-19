-- The feature flag was the last row in the database still calling this thing
-- MTG Brain, and its description called it "AI card database and insights",
-- which is both the old name and the vocabulary the owner asked us to drop.
--
-- The key is safe to rename: it is referenced in exactly one place in the app
-- (`AI_FLAG_KEYS` in `src/components/admin/AISystemAdmin.tsx`, updated in the
-- same change) and by nothing else. Checked before writing this, there are zero
-- matching rows in `subscription_limits` and zero in `feature_usage`, so nothing
-- meters against it and no usage history is orphaned.

update public.feature_flags
   set key         = 'tutor',
       name        = 'Tutor',
       description = 'Answers about a deck, a card or the rules, with the decklist attached'
 where key = 'mtg_brain';
