-- Revoking from anon and authenticated does not revoke from PUBLIC.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, and `anon` and
-- `authenticated` inherit PUBLIC. Measured on the previous migration:
-- `purge_stale_online_tables` came out with acl `=X/postgres`, which is the
-- PUBLIC grant, so any signed-in user could have deleted every online table
-- from a SECURITY DEFINER function. `new_game_table_code` was reachable the
-- same way.
--
-- So the pattern is: revoke from PUBLIC first, then grant to exactly the role
-- that should have it. `revoke ... from anon, authenticated` on its own is a
-- grant that looks removed and is not.

revoke all on function public.new_game_table_code()              from public;
revoke all on function public.purge_stale_online_tables(integer)  from public;

revoke all on function public.create_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb, smallint) from public;
revoke all on function public.join_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb)             from public;
revoke all on function public.peek_online_table(text)                                                                    from public;
revoke all on function public.set_online_seat(uuid, text, uuid, text, integer, jsonb, text, bigint, jsonb, boolean)      from public;
revoke all on function public.leave_online_table(uuid)                                                                   from public;
revoke all on function public.start_online_table(uuid, integer)                                                          from public;
revoke all on function public.finish_online_table(uuid)                                                                  from public;
revoke all on function public.append_online_action(uuid, text, text, smallint, integer, jsonb, jsonb, bigint)            from public;

grant execute on function public.create_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb, smallint) to authenticated;
grant execute on function public.join_online_table(text, text, uuid, text, integer, jsonb, text, bigint, jsonb)             to authenticated;
grant execute on function public.peek_online_table(text)                                                                    to authenticated;
grant execute on function public.set_online_seat(uuid, text, uuid, text, integer, jsonb, text, bigint, jsonb, boolean)      to authenticated;
grant execute on function public.leave_online_table(uuid)                                                                   to authenticated;
grant execute on function public.start_online_table(uuid, integer)                                                          to authenticated;
grant execute on function public.finish_online_table(uuid)                                                                  to authenticated;
grant execute on function public.append_online_action(uuid, text, text, smallint, integer, jsonb, jsonb, bigint)            to authenticated;

-- The seat secrets table needs no client write grant at all: every write goes
-- through a SECURITY DEFINER function above. Reading your own row is what the
-- rejoin path needs, and the RLS policy already scopes that to auth.uid().
revoke insert, update, delete on public.game_seat_secrets from anon, authenticated;
revoke all on public.game_seat_secrets from anon;
