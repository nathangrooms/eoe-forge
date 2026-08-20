-- Revoking from `anon` is not revoking from PUBLIC. Again.
--
-- Every function is created with EXECUTE granted to PUBLIC, and `anon` holds
-- it through that membership rather than in its own right, so
-- `revoke all on function … from anon` removes nothing. This project already
-- has a migration named for this exact mistake
-- (`revoking_from_authenticated_is_not_revoking_from_public`), and the playmat
-- migration made it a third time.
--
-- Measured over HTTP with the anon key before this ran:
--
--   POST /rest/v1/rpc/playmats_at_table   200  []
--   POST /rest/v1/rpc/set_playmat_prefs   400  "sign in to save your playmat"
--
-- Neither leaked anything, because both are written to answer nothing when
-- `auth.uid()` is null. That is a second line of defence being mistaken for
-- the first. The grant is the gate.
--
-- `playmat_visible_to_me` and `playmat_object_count` are called from inside the
-- storage policies, which are evaluated as the caller, so `authenticated`
-- genuinely needs EXECUTE on those two and gets it back explicitly.

revoke all on function public.playmat_visible_to_me(text)                                 from public;
revoke all on function public.playmat_object_count()                                      from public;
revoke all on function public.record_playmat(text, text, text, integer, integer, integer) from public;
revoke all on function public.set_playmat_prefs(text, text, uuid, boolean)                from public;
revoke all on function public.playmats_at_table(uuid)                                     from public;

grant execute on function public.playmat_visible_to_me(text)                                 to authenticated;
grant execute on function public.playmat_object_count()                                      to authenticated;
grant execute on function public.record_playmat(text, text, text, integer, integer, integer) to authenticated;
grant execute on function public.set_playmat_prefs(text, text, uuid, boolean)                to authenticated;
grant execute on function public.playmats_at_table(uuid)                                     to authenticated;
