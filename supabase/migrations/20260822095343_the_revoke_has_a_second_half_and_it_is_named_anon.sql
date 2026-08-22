-- ============================================================================
-- The revoke has a second half, and it is named `anon`.
-- ============================================================================
--
-- CLAUDE.md records the trap as "revoking EXECUTE from anon removes NOTHING,
-- because functions are granted to PUBLIC at creation; revoke from public".
-- That is true and it is only half the story, and the missing half was measured
-- ten minutes after the migration before this one was applied.
--
-- Read back off `pg_proc.proacl` for every function that migration created:
--
--     ask_to_be_friends   postgres=X | anon=X | authenticated=X | service_role=X
--     are_friends         postgres=X | anon=X | authenticated=X | service_role=X
--     my_friends          postgres=X | anon=X | authenticated=X | service_role=X
--     ... and 26 more, all with anon=X
--
-- Every one of those had `revoke all ... from public` written against it, and
-- `anon` still holds EXECUTE. The reason is that this project carries Supabase's
-- default privileges, which grant EXECUTE on new functions to `anon`,
-- `authenticated` and `service_role` EXPLICITLY. So a new function is granted
-- twice over: once to PUBLIC by Postgres and once to those three roles by the
-- default privilege. Revoking from PUBLIC removes the first grant and leaves the
-- second one standing.
--
-- Two functions in the same migration prove it by contrast. `post_chat_message`
-- and `remove_forum_post` were CREATE OR REPLACE over functions that already
-- existed, which keeps the existing ACL, and they read back correctly as
-- `postgres | service_role | authenticated` with no anon.
--
-- SO THE RULE, WRITTEN OUT IN FULL:
--
--   for a function that already exists   revoke from public
--   for a function you are CREATING      revoke from public, anon, authenticated
--                                        and then grant back exactly who needs it
--
-- Nothing here changes what any function DOES. Every one of them already
-- refused a null `auth.uid()`, so nothing was exploitable through the ones that
-- write. Two were readable and should not have been:
--
--   `are_friends(a, b)`      would tell an anonymous caller holding two user ids
--                            whether those two people are friends
--   `chat_room_members(id)`  would list the names of everybody in an open
--                            channel to somebody with no account
--
-- Neither is a catastrophe and both are somebody's business but nobody else's.
--
-- `presence_window()` also carried no `search_path`, which is the one thing the
-- linter flagged on the whole migration. It is immutable and reads nothing, so
-- it was never a route to anything, but a SECURITY DEFINER neighbourhood is not
-- a place to leave one function with a mutable path.
-- ============================================================================

create or replace function public.presence_window()
returns interval language sql immutable set search_path to 'public'
as $$ select interval '3 minutes' $$;


-- ---------------------------------------------------------------------------
-- The plumbing. Nothing calls these over HTTP: they are called from inside
-- SECURITY DEFINER functions, which run as the owner, and from triggers.
-- ---------------------------------------------------------------------------

revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.either_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.may_see_friend(uuid, text) from public, anon, authenticated;
revoke all on function public.tell_a_friend(uuid) from public, anon, authenticated;
revoke all on function public.chat_room_slug(text) from public, anon, authenticated;
revoke all on function public.presence_window() from public, anon, authenticated;
revoke all on function public.forum_post_inherits_privacy() from public, anon, authenticated;
revoke all on function public.forum_room_privacy_follows() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- The three named by a POLICY. `authenticated` has to be able to execute these
-- or the policy that calls them cannot be evaluated. `anon` never reaches them:
-- the two policies a signed-out reader is subject to test `not private`, which
-- is a plain column.
-- ---------------------------------------------------------------------------

revoke all on function public.in_chat_room(bigint) from public, anon, authenticated;
revoke all on function public.may_read_room(bigint) from public, anon, authenticated;
revoke all on function public.may_use_room_topic(text) from public, anon, authenticated;

grant execute on function public.in_chat_room(bigint) to authenticated;
grant execute on function public.may_read_room(bigint) to authenticated;
grant execute on function public.may_use_room_topic(text) to authenticated;


-- ---------------------------------------------------------------------------
-- Everything a signed-in player calls. Every one of these is about YOUR
-- account, so there is nothing for a signed-out caller to ask them.
-- ---------------------------------------------------------------------------

revoke all on function public.find_players(text) from public, anon, authenticated;
revoke all on function public.ask_to_be_friends(uuid) from public, anon, authenticated;
revoke all on function public.answer_friend_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.remove_friend(uuid) from public, anon, authenticated;
revoke all on function public.block_player(uuid, text) from public, anon, authenticated;
revoke all on function public.unblock_player(uuid) from public, anon, authenticated;
revoke all on function public.list_blocked_players() from public, anon, authenticated;
revoke all on function public.my_sharing() from public, anon, authenticated;
revoke all on function public.set_friend_sharing(boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.touch_presence(text, text) from public, anon, authenticated;
revoke all on function public.my_friends() from public, anon, authenticated;
revoke all on function public.friend_decks(uuid) from public, anon, authenticated;
revoke all on function public.friend_collection(uuid, integer) from public, anon, authenticated;
revoke all on function public.invite_friend_to_table(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decline_table_invite(bigint) from public, anon, authenticated;
revoke all on function public.create_chat_room(text, boolean) from public, anon, authenticated;
revoke all on function public.add_to_chat_room(bigint, uuid) from public, anon, authenticated;
revoke all on function public.remove_from_chat_room(bigint, uuid) from public, anon, authenticated;
revoke all on function public.join_chat_room(text) from public, anon, authenticated;
revoke all on function public.chat_room_members(bigint) from public, anon, authenticated;

grant execute on function public.find_players(text) to authenticated;
grant execute on function public.ask_to_be_friends(uuid) to authenticated;
grant execute on function public.answer_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_player(uuid, text) to authenticated;
grant execute on function public.unblock_player(uuid) to authenticated;
grant execute on function public.list_blocked_players() to authenticated;
grant execute on function public.my_sharing() to authenticated;
grant execute on function public.set_friend_sharing(boolean, boolean, boolean) to authenticated;
grant execute on function public.touch_presence(text, text) to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.friend_decks(uuid) to authenticated;
grant execute on function public.friend_collection(uuid, integer) to authenticated;
grant execute on function public.invite_friend_to_table(uuid, uuid) to authenticated;
grant execute on function public.decline_table_invite(bigint) to authenticated;
grant execute on function public.create_chat_room(text, boolean) to authenticated;
grant execute on function public.add_to_chat_room(bigint, uuid) to authenticated;
grant execute on function public.remove_from_chat_room(bigint, uuid) to authenticated;
grant execute on function public.join_chat_room(text) to authenticated;
grant execute on function public.chat_room_members(bigint) to authenticated;
