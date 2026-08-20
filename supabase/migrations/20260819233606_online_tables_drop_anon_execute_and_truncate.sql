-- Two leftovers from the grants above, both measured rather than guessed.
--
-- 1. Supabase's default privileges grant EXECUTE on every new public function
--    to `anon` by name, so revoking PUBLIC did not remove it. Most of these
--    functions raise on a null auth.uid() anyway, but `peek_online_table` does
--    not: it is SECURITY DEFINER and answers "is this a real table code" to
--    anybody holding the anon key. Nobody needs that while signed out.
--
-- 2. `authenticated` held TRUNCATE on the four new tables. TRUNCATE bypasses
--    RLS entirely, which is the same hole section 8 of CLAUDE.md records being
--    closed across the rest of this database. It comes back on every new table
--    unless it is revoked.

revoke all on function public.create_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb, smallint) from anon;
revoke all on function public.join_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb)             from anon;
revoke all on function public.peek_online_table(text)                                                                    from anon;
revoke all on function public.set_online_seat(uuid, text, uuid, text, integer, jsonb, text, bigint, jsonb, boolean)      from anon;
revoke all on function public.leave_online_table(uuid)                                                                   from anon;
revoke all on function public.start_online_table(uuid, integer)                                                          from anon;
revoke all on function public.finish_online_table(uuid)                                                                  from anon;
revoke all on function public.append_online_action(uuid, text, text, smallint, integer, jsonb, jsonb, bigint)            from anon;

revoke truncate on public.game_tables       from anon, authenticated;
revoke truncate on public.game_participants from anon, authenticated;
revoke truncate on public.game_actions      from anon, authenticated;
revoke truncate on public.game_seat_secrets from anon, authenticated;

revoke all on public.game_tables       from anon;
revoke all on public.game_participants from anon;
revoke all on public.game_actions      from anon;
